const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function buildDeck(exclude) {
  const dead = new Set(exclude.map(c => `${c.rank}${c.suit}`));
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      if (!dead.has(`${rank}${suit}`)) deck.push({ rank, suit, value: RANK_VALUES[rank] });
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function evaluate5Card(cards) {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const values = sorted.map(c => c.value);
  const suits  = sorted.map(c => c.suit);
  const isFlush    = suits.every(s => s === suits[0]);
  const isStraight = values.every((v, i) => i === 0 || values[i - 1] - v === 1);
  const isWheel    = values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2;
  const freq = {};
  for (const v of values) freq[v] = (freq[v] || 0) + 1;
  const groups = Object.entries(freq)
    .map(([v, c]) => ({ value: parseInt(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
  const counts = groups.map(g => g.count);
  if (isFlush && (isStraight || isWheel)) return { rank: 8, tb: [isWheel ? 5 : values[0]] };
  if (counts[0] === 4) return { rank: 7, tb: [groups[0].value, groups[1].value] };
  if (counts[0] === 3 && counts[1] === 2) return { rank: 6, tb: [groups[0].value, groups[1].value] };
  if (isFlush) return { rank: 5, tb: values };
  if (isStraight || isWheel) return { rank: 4, tb: [isWheel ? 5 : values[0]] };
  if (counts[0] === 3) return { rank: 3, tb: [groups[0].value, ...groups.slice(1).map(g => g.value)] };
  if (counts[0] === 2 && counts[1] === 2) return { rank: 2, tb: [groups[0].value, groups[1].value, groups[2].value] };
  if (counts[0] === 2) return { rank: 1, tb: [groups[0].value, ...groups.slice(1).map(g => g.value)] };
  return { rank: 0, tb: values };
}

function bestOf7(cards) {
  // Pick best 5 from up to 7 cards
  if (cards.length <= 5) return evaluate5Card(cards);
  let best = null;
  for (let i = 0; i < cards.length - 1; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const five = cards.filter((_, k) => k !== i && k !== j);
      const h = evaluate5Card(five);
      if (!best || h.rank > best.rank || (h.rank === best.rank && h.tb.some((v, k) => v !== (best.tb[k] || 0) && v > (best.tb[k] || 0)))) best = h;
    }
  }
  return best;
}

function compare(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tb.length, b.tb.length); i++) {
    const d = (a.tb[i] || 0) - (b.tb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Returns equity [0-100] for player 1 given both hole card pairs and community cards already dealt.
// Treats any remaining streets as a single deal (no per-card recalculation mid-flop).
export function calcEquity(hand1, hand2, board, iterations = 1000) {
  const needed = 5 - board.length;
  if (needed === 0) {
    // Board complete — exact result
    const h1 = bestOf7([...hand1, ...board]);
    const h2 = bestOf7([...hand2, ...board]);
    const cmp = compare(h1, h2);
    return cmp > 0 ? 100 : cmp < 0 ? 0 : 50;
  }

  const known = [...hand1, ...hand2, ...board];
  const deck  = buildDeck(known);
  let p1wins = 0;

  for (let i = 0; i < iterations; i++) {
    shuffle(deck);
    const runout = deck.slice(0, needed);
    const community = [...board, ...runout];
    const h1 = bestOf7([...hand1, ...community]);
    const h2 = bestOf7([...hand2, ...community]);
    const cmp = compare(h1, h2);
    if (cmp > 0) p1wins++;
    else if (cmp === 0) p1wins += 0.5;
  }

  return Math.round((p1wins / iterations) * 100);
}
