// Monte Carlo equity calculator — uses the game's own card objects and evaluator.
// equity = P(win) + P(tie)/2 vs `opponents` random hands, rolling out the board.

const { evaluateBestHand, compareHands } = require('../game/HandEvaluator');

const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function buildDeckExcluding(knownCards) {
  const used = new Set(knownCards.map(c => c.rank + c.suit));
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (!used.has(rank + suit)) deck.push({ rank, suit, value: RANK_VALUES[rank] });
    }
  }
  return deck;
}

// Estimate equity for holeCards on communityCards vs N random opponent hands.
function calcEquity(holeCards, communityCards, { simulations = 500, opponents = 1 } = {}) {
  const deck = buildDeckExcluding([...holeCards, ...communityCards]);
  const boardNeeded = 5 - communityCards.length;
  const cardsNeeded = boardNeeded + opponents * 2;

  let wins = 0, ties = 0;

  for (let s = 0; s < simulations; s++) {
    // Partial Fisher-Yates: randomize just the first `cardsNeeded` slots.
    for (let j = 0; j < cardsNeeded; j++) {
      const k = j + Math.floor(Math.random() * (deck.length - j));
      [deck[j], deck[k]] = [deck[k], deck[j]];
    }

    const board = boardNeeded > 0
      ? communityCards.concat(deck.slice(0, boardNeeded))
      : communityCards;
    const myHand = evaluateBestHand([...holeCards, ...board]);

    let outcome = 1; // 1 = win, 0.5 = tie, 0 = loss
    for (let o = 0; o < opponents; o++) {
      const oppHole = [deck[boardNeeded + o * 2], deck[boardNeeded + o * 2 + 1]];
      const oppHand = evaluateBestHand([...oppHole, ...board]);
      const cmp = compareHands(myHand, oppHand);
      if (cmp < 0) { outcome = 0; break; }
      if (cmp === 0) outcome = 0.5; // tie with at least one opponent (unless beaten later)
    }
    if (outcome === 1) wins++;
    else if (outcome === 0.5) ties++;
  }

  return {
    equity: (wins + ties / 2) / simulations,
    win: wins / simulations,
    tie: ties / simulations,
  };
}

module.exports = { calcEquity, buildDeckExcluding };
