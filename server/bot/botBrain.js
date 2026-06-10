// Tunable poker bot brain.
//
//   decideAction(gameState, profile) → { action, amount?, delay, meta }
//
// gameState (see stateFromGame for deriving it from a PokerGame instance):
//   holeCards, communityCards, phase, pot, currentBet, minRaise, bigBlind,
//   myRoundBet, myChips, effectiveOpponentChips, numOpponents
//
// Actions match PokerGame.handleAction: fold | check | call | raise | all-in.
// `amount` on a raise is the TOTAL round bet to raise to.
//
// Flow: Monte Carlo equity → compare vs pot-odds-required equity (warped by the
// profile's tightness/stickiness) → weighted-random pick over fold/call/raise
// (weights warped by aggression/bluffFreq) → size the raise via betSizing.
// Short stacks (≤12BB effective, preflop) switch to push/fold mode.

const { calcEquity } = require('./monteCarlo');

const SHORT_STACK_BB = 12;

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function pickWeighted(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

// Round chip amounts to half-big-blind granularity so bets look human.
function roundChips(amount, bigBlind) {
  const unit = Math.max(1, Math.round(bigBlind / 2));
  return Math.round(amount / unit) * unit;
}

function chooseRaiseSize(gs, profile, equity, toCall) {
  const maxTo = gs.myRoundBet + gs.myChips; // all-in total
  const minLegalTo = gs.currentBet + gs.minRaise;
  const sizeNoise = (Math.random() - 0.5) * 0.2;

  let raiseTo;
  if (gs.phase === 'pre-flop' && gs.currentBet <= gs.bigBlind) {
    // Opening raise: 2x–3.5x BB scaled by betSizing
    raiseTo = gs.bigBlind * (2 + profile.betSizing * 1.5 + sizeNoise * 2);
  } else {
    // Raise by a fraction of the pot (after our call)
    const potAfterCall = gs.pot + toCall;
    let frac = 0.4 + profile.betSizing * 0.6 + sizeNoise;
    if (equity > 0.85 && Math.random() < 0.3) frac += 0.4; // occasional monster overbet
    raiseTo = gs.currentBet + Math.max(gs.minRaise, potAfterCall * frac);
  }

  raiseTo = roundChips(raiseTo, gs.bigBlind);
  raiseTo = Math.max(raiseTo, minLegalTo);

  // If a legal raise barely leaves chips behind (or isn't possible), jam instead.
  if (raiseTo >= maxTo * 0.7 || minLegalTo > maxTo) {
    return { action: 'all-in' };
  }
  return { action: 'raise', amount: Math.min(raiseTo, maxTo) };
}

// Preflop push/fold mode for short effective stacks.
function shortStackDecision(gs, profile, equity, toCall, effBB) {
  const potOddsEquity = toCall > 0 ? toCall / (gs.pot + toCall) : 0;

  // Jam threshold: tighter profiles need more equity; shrinks as the stack shrinks.
  const jamThreshold = 0.52 + (profile.tightness - 0.5) * 0.18 - (SHORT_STACK_BB - effBB) * 0.008;

  // Facing a bet that covers (or nearly covers) us → pure call/fold on pot odds.
  if (toCall >= gs.myChips * 0.6) {
    const required = potOddsEquity * (0.85 + profile.tightness * 0.35) * (1 - profile.stickiness * 0.2);
    return equity >= required
      ? { action: toCall >= gs.myChips ? 'call' : 'all-in' }
      : { action: 'fold' };
  }

  if (equity >= jamThreshold) {
    // Strong enough to jam — aggressive profiles jam more, passive ones sometimes flat
    if (Math.random() < 0.45 + profile.aggression * 0.55) return { action: 'all-in' };
    return { action: toCall > 0 ? 'call' : 'check' };
  }

  // Below jam threshold: resteal-jam bluffs at bluffFreq, otherwise limp/fold by tightness
  if (Math.random() < profile.bluffFreq * profile.aggression * 0.25) {
    return { action: 'all-in' };
  }
  const limpThreshold = 0.36 + profile.tightness * 0.12;
  if (toCall === 0) return { action: 'check' };
  if (toCall <= gs.bigBlind && equity >= limpThreshold) return { action: 'call' };
  const required = potOddsEquity * (0.85 + profile.tightness * 0.35) * (1 - profile.stickiness * 0.3);
  return equity >= required ? { action: 'call' } : { action: 'fold' };
}

function decideAction(gs, profile) {
  const toCall = Math.min(Math.max(0, gs.currentBet - gs.myRoundBet), gs.myChips);
  const effStack = Math.min(gs.myChips, gs.effectiveOpponentChips);
  const effBB = effStack / gs.bigBlind;

  const { equity } = calcEquity(gs.holeCards, gs.communityCards, {
    simulations: profile.simulations || 500,
    opponents: gs.numOpponents || 1,
  });

  const potOddsEquity = toCall > 0 ? toCall / (gs.pot + toCall) : 0;
  // Equity we demand before continuing: pot odds warped by tightness, discounted by stickiness
  const required = potOddsEquity * (0.75 + profile.tightness * 0.6) * (1 - profile.stickiness * 0.25);

  const meta = { equity: +equity.toFixed(3), required: +required.toFixed(3), toCall, effBB: +effBB.toFixed(1) };

  let decision;

  if (gs.phase === 'pre-flop' && effBB <= SHORT_STACK_BB) {
    decision = shortStackDecision(gs, profile, equity, toCall, effBB);
    meta.mode = 'push-fold';
  } else if (toCall > 0) {
    meta.mode = 'facing-bet';
    const margin = equity - required;
    let weights;
    if (margin >= 0) {
      let raiseP = clamp01(margin * 2.5) * (0.25 + profile.aggression * 0.75);
      if (equity > 0.8) raiseP = Math.max(raiseP, 0.5 + profile.aggression * 0.3);
      raiseP = clamp01(raiseP + profile.bluffFreq * profile.aggression * 0.1);
      weights = { raise: raiseP, call: 1 - raiseP };
    } else {
      let foldP = clamp01(0.3 + -margin * 6) * (1 - profile.stickiness * 0.75);
      // Never fold getting a near-free price with live cards
      if (potOddsEquity < 0.12 && equity > 0.12) foldP = 0;
      const bluffRaiseP = (margin > -0.12 ? 0.25 : 0.08) * profile.bluffFreq * profile.aggression;
      weights = { fold: foldP, raise: bluffRaiseP, call: Math.max(0, 1 - foldP - bluffRaiseP) };
    }
    if (toCall >= gs.myChips) {
      // Can't raise — facing an all-in price. Raise mass becomes call.
      weights.call = (weights.call || 0) + (weights.raise || 0);
      weights.raise = 0;
    }
    decision = { action: pickWeighted(weights) };
    meta.weights = weights;
  } else {
    meta.mode = 'checked-to';
    // Polarized betting: value-bet strong, bluff air, check the middle
    const valueBetP = clamp01((equity - 0.45) * 2.2) * (0.25 + profile.aggression * 0.75);
    const bluffP = equity < 0.4 ? profile.bluffFreq * (0.25 + profile.aggression * 0.5) : 0;
    const betP = clamp01(valueBetP + bluffP);
    const weights = { raise: betP, check: 1 - betP };
    decision = { action: pickWeighted(weights) };
    meta.weights = weights;
  }

  // Resolve raise into a sized action
  if (decision.action === 'raise') {
    decision = chooseRaiseSize(gs, profile, equity, toCall);
  }
  // Normalize: calling zero is a check; folding when checking is free never happens
  if (decision.action === 'call' && toCall === 0) decision.action = 'check';
  if (decision.action === 'fold' && toCall === 0) decision.action = 'check';

  return {
    ...decision,
    delay: Math.round(600 + Math.random() * 900),
    meta,
  };
}

// Build a brain-ready gameState from a live PokerGame instance.
function stateFromGame(game, botId) {
  const me = game.players.find(p => p.id === botId);
  const opponents = game.getActivePlayers().filter(p => p.id !== botId);
  return {
    holeCards: me.holeCards,
    communityCards: game.communityCards,
    phase: game.phase,
    pot: game.pot,
    currentBet: game.currentBet,
    minRaise: game.minRaise,
    bigBlind: game.bigBlind,
    myRoundBet: me.roundBet,
    myChips: me.chips,
    effectiveOpponentChips: Math.max(...opponents.map(p => p.chips)),
    numOpponents: opponents.length,
  };
}

module.exports = { decideAction, stateFromGame };
