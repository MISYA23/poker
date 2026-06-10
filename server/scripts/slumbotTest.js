// Proof-of-concept: connect to the Slumbot API, play hands with a simple check/call
// policy on our side, and console.log Slumbot's play alongside the game state at
// every decision point.
//
// Run: node server/scripts/slumbotTest.js [numHands]

const { newHand, act, parseAction, BIG_BLIND } = require('../slumbot');

const NUM_HANDS = parseInt(process.argv[2], 10) || 3;

function fmtCards(cards) {
  return cards && cards.length ? cards.join(' ') : '—';
}

function fmtPlay(a) {
  if (a.type === 'fold') return 'FOLD';
  if (a.type === 'check') return 'CHECK';
  if (a.type === 'call') return `CALL ${a.amount}`;
  return `${a.type.toUpperCase()} to ${a.to}`;
}

// Log any Slumbot actions in the parsed state we haven't logged yet.
const BOARD_CARDS = { preflop: 0, flop: 3, turn: 4, river: 5 };

function logSlumbotPlays(resp, loggedCount) {
  const state = parseAction(resp.action, resp.client_pos);
  for (let i = loggedCount; i < state.actions.length; i++) {
    const a = state.actions[i];
    if (a.actor !== 'slumbot') continue;
    const board = (resp.board || []).slice(0, BOARD_CARDS[a.street]);
    console.log(
      `  [SLUMBOT PLAY] ${fmtPlay(a)}  |  gamestate: street=${a.street} ` +
      `board=[${fmtCards(board)}] pot=${a.potAfter} ` +
      `our_cards=[${fmtCards(resp.hole_cards)}] action_string="${resp.action}"`
    );
  }
  return state;
}

// Our throwaway policy while testing connectivity: check when we can, call when facing a bet.
function ourAction(state) {
  return state.toCall > 0 ? 'c' : 'k';
}

async function playHand(handNum, prevToken) {
  let resp = await newHand(prevToken);
  const token = resp.token || prevToken;
  const pos = resp.client_pos === 0 ? 'BB' : 'SB';
  console.log(`\n=== HAND ${handNum} — our cards: [${fmtCards(resp.hole_cards)}], we are ${pos} ===`);

  let logged = 0;
  while (resp.winnings === undefined) {
    const state = logSlumbotPlays(resp, logged);
    const incr = ourAction(state);
    console.log(`  [us] ${incr === 'c' ? `call ${state.toCall}` : 'check'}`);
    logged = state.actions.length + 1; // +1 accounts for the action we just sent
    resp = await act(token, incr);
  }

  logSlumbotPlays(resp, logged);
  console.log(
    `  HAND END: board=[${fmtCards(resp.board)}] slumbot_cards=[${fmtCards(resp.bot_hole_cards)}] ` +
    `winnings=${resp.winnings} (${resp.winnings / BIG_BLIND} BB)  session_total=${resp.session_total}`
  );
  return token;
}

(async () => {
  console.log(`Connecting to Slumbot API — playing ${NUM_HANDS} hand(s)...`);
  let token;
  for (let i = 1; i <= NUM_HANDS; i++) {
    token = await playHand(i, token);
  }
  console.log('\nDone.');
})().catch((err) => {
  console.error('Slumbot test failed:', err.message);
  process.exit(1);
});
