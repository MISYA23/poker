function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function isConsecutive(values) {
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] - values[i + 1] !== 1) return false;
  }
  return true;
}

function evaluate5Card(cards) {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const values = sorted.map(c => c.value);
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = isConsecutive(values);
  const isWheel = values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2;

  const freq = {};
  for (const v of values) freq[v] = (freq[v] || 0) + 1;
  const groups = Object.entries(freq)
    .map(([v, c]) => ({ value: parseInt(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
  const counts = groups.map(g => g.count);

  if (isFlush && (isStraight || isWheel)) {
    const high = isWheel ? 5 : values[0];
    const name = values[0] === 14 && !isWheel ? 'Royal Flush' : 'Straight Flush';
    return { rank: 8, tiebreakers: [high], name, bestCards: sorted };
  }
  if (counts[0] === 4) {
    return { rank: 7, tiebreakers: [groups[0].value, groups[1].value], name: 'Four of a Kind', bestCards: sorted };
  }
  if (counts[0] === 3 && counts[1] === 2) {
    return { rank: 6, tiebreakers: [groups[0].value, groups[1].value], name: 'Full House', bestCards: sorted };
  }
  if (isFlush) {
    return { rank: 5, tiebreakers: values, name: 'Flush', bestCards: sorted };
  }
  if (isStraight) {
    return { rank: 4, tiebreakers: [values[0]], name: 'Straight', bestCards: sorted };
  }
  if (isWheel) {
    return { rank: 4, tiebreakers: [5], name: 'Straight', bestCards: sorted };
  }
  if (counts[0] === 3) {
    const kickers = groups.slice(1).map(g => g.value);
    return { rank: 3, tiebreakers: [groups[0].value, ...kickers], name: 'Three of a Kind', bestCards: sorted };
  }
  if (counts[0] === 2 && counts[1] === 2) {
    const kicker = groups[2].value;
    return { rank: 2, tiebreakers: [groups[0].value, groups[1].value, kicker], name: 'Two Pair', bestCards: sorted };
  }
  if (counts[0] === 2) {
    const kickers = groups.slice(1).map(g => g.value);
    return { rank: 1, tiebreakers: [groups[0].value, ...kickers], name: 'One Pair', bestCards: sorted };
  }
  return { rank: 0, tiebreakers: values, name: 'High Card', bestCards: sorted };
}

function evaluateBestHand(cards) {
  if (cards.length <= 5) return evaluate5Card(cards);
  const combos = combinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const result = evaluate5Card(combo);
    if (!best || compareHands(result, best) > 0) best = result;
  }
  return best;
}

function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] || 0;
    const bv = b.tiebreakers[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

module.exports = { evaluateBestHand, compareHands };
