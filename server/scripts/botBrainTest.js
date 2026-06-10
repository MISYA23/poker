// Bot brain harness: run canonical spots through every personality profile
// and print the action distributions, so profile differences are visible.
//
// Run: node server/scripts/botBrainTest.js [iterations]

const { decideAction } = require('../bot/botBrain');
const { PROFILES, getProfile } = require('../bot/profiles');
const { calcEquity } = require('../bot/monteCarlo');

const ITERATIONS = parseInt(process.argv[2], 10) || 100;

const RANK_VALUES = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };

// 'As' → {rank:'A',suit:'s',value:14}; accepts 'T' or '10' for tens
function card(str) {
  const suit = str.slice(-1);
  let rank = str.slice(0, -1);
  if (rank === 'T') rank = '10';
  return { rank, suit, value: RANK_VALUES[rank] };
}
const cards = (str) => str.split(' ').map(card);

// Spots. Game context: HU NLH, raise amount = total round bet ("raise to").
const SPOTS = [
  {
    name: 'AA preflop, we are SB/button (50bb) — facing just the BB',
    gs: {
      holeCards: cards('As Ah'), communityCards: [], phase: 'pre-flop',
      pot: 30, currentBet: 20, minRaise: 20, bigBlind: 20,
      myRoundBet: 10, myChips: 990, effectiveOpponentChips: 980, numOpponents: 1,
    },
    expect: 'never fold; mostly raise',
  },
  {
    name: '72o preflop facing an all-in jam (we cover, 50bb)',
    gs: {
      holeCards: cards('7c 2d'), communityCards: [], phase: 'pre-flop',
      pot: 1010, currentBet: 1000, minRaise: 980, bigBlind: 20,
      myRoundBet: 20, myChips: 980, effectiveOpponentChips: 0, numOpponents: 1,
    },
    expect: 'almost always fold (station may call)',
  },
  {
    name: 'Flush draw on flop, facing a pot-size bet',
    gs: {
      holeCards: cards('Ah 9h'), communityCards: cards('Kh 6h 2c'), phase: 'flop',
      pot: 240, currentBet: 120, minRaise: 120, bigBlind: 20,
      myRoundBet: 0, myChips: 880, effectiveOpponentChips: 760, numOpponents: 1,
    },
    expect: 'mostly call/raise, rarely fold',
  },
  {
    name: 'Set of sixes on flop, checked to us',
    gs: {
      holeCards: cards('6s 6d'), communityCards: cards('Kh 6h 2c'), phase: 'flop',
      pot: 120, currentBet: 0, minRaise: 20, bigBlind: 20,
      myRoundBet: 0, myChips: 940, effectiveOpponentChips: 940, numOpponents: 1,
    },
    expect: 'bet a lot (aggressive profiles near-always)',
  },
  {
    name: 'Total air on river, checked to us',
    gs: {
      holeCards: cards('7c 4d'), communityCards: cards('Kh Th 9s 2c As'), phase: 'river',
      pot: 200, currentBet: 0, minRaise: 20, bigBlind: 20,
      myRoundBet: 0, myChips: 900, effectiveOpponentChips: 900, numOpponents: 1,
    },
    expect: 'check mostly; bluffy profiles fire sometimes',
  },
  {
    name: 'K9o preflop at 6bb effective (blinds 40/80) — push/fold mode',
    gs: {
      holeCards: cards('Kc 9d'), communityCards: [], phase: 'pre-flop',
      pot: 120, currentBet: 80, minRaise: 80, bigBlind: 80,
      myRoundBet: 40, myChips: 460, effectiveOpponentChips: 480, numOpponents: 1,
    },
    expect: 'jam a lot (nit jams less)',
  },
  {
    name: 'Middling Q7o preflop at 20bb, facing a 3x open',
    gs: {
      holeCards: cards('Qc 7d'), communityCards: [], phase: 'pre-flop',
      pot: 80, currentBet: 60, minRaise: 40, bigBlind: 20,
      myRoundBet: 20, myChips: 380, effectiveOpponentChips: 340, numOpponents: 1,
    },
    expect: 'mostly call (3:1 closing the action is a correct defend HU)',
  },
];

function fmtPct(n) {
  return `${Math.round((n / ITERATIONS) * 100)}%`.padStart(4);
}

console.log(`Bot brain harness — ${ITERATIONS} iterations per spot per profile\n`);

for (const spot of SPOTS) {
  const eq = calcEquity(spot.gs.holeCards, spot.gs.communityCards, { simulations: 3000, opponents: spot.gs.numOpponents });
  console.log(`=== ${spot.name}`);
  console.log(`    equity≈${(eq.equity * 100).toFixed(1)}%  expect: ${spot.expect}`);

  for (const profileName of Object.keys(PROFILES)) {
    const profile = getProfile(profileName);
    const counts = {};
    const raiseSizes = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const d = decideAction(spot.gs, profile);
      counts[d.action] = (counts[d.action] || 0) + 1;
      if (d.action === 'raise') raiseSizes.push(d.amount);
    }
    const dist = ['fold', 'check', 'call', 'raise', 'all-in']
      .filter(a => counts[a])
      .map(a => `${a} ${fmtPct(counts[a])}`)
      .join('  ');
    const avgRaise = raiseSizes.length
      ? `  (avg raise-to ${Math.round(raiseSizes.reduce((s, x) => s + x, 0) / raiseSizes.length)})`
      : '';
    console.log(`    ${profileName.padEnd(8)} ${dist}${avgRaise}`);
  }
  console.log('');
}

// Timing check: how expensive is one decision?
const t0 = Date.now();
const N = 20;
for (let i = 0; i < N; i++) {
  decideAction(SPOTS[2].gs, getProfile('tag'));
}
console.log(`Avg decision time (600 sims): ${((Date.now() - t0) / N).toFixed(1)}ms`);
