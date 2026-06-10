// Match format test: escalating blind schedule + admin config.
//
// Covers:
//  - matchFormat module: level parsing, serialization, hand→blinds mapping, clamping
//  - admin API: GET format, PUT validation (rejects bad input), PUT round-trip
//  - live escalation: in a real bot match the blinds posted on hand N follow the
//    schedule, and game-state carries handNumber/smallBlind/bigBlind
//
// Start a server first, then: SERVER_URL=http://localhost:PORT node server/scripts/matchFormatTest.js
// Restores the default format and removes test players when done.

const { io } = require('../../client/node_modules/socket.io-client');
const { DEFAULT_FORMAT, parseLevels, serializeLevels, blindsForHand } = require('../matchFormat');

const URL = process.env.SERVER_URL || 'http://localhost:3843';
const BOT_ID = 'bot_hal';
let pass = 0, fail = 0;

function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name}`); }
}

function waitFor(socket, event, timeoutMs = 6000, predicate = null) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { socket.off(event, h); resolve(null); }, timeoutMs);
    const h = (data) => {
      if (predicate && !predicate(data)) return;
      clearTimeout(t); socket.off(event, h); resolve(data ?? {});
    };
    socket.on(event, h);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function putFormat(body) {
  return fetch(`${URL}/admin/match-format`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function makePlayer(tag) {
  const playerId = `test_mf_${tag}_${Date.now()}`;
  const resp = await fetch(`${URL}/api/player/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, name: `MfTest${tag}`, avatarId: 'cigar' }),
  });
  if (!resp.ok) throw new Error(`guest upsert failed for ${tag}`);
  const socket = io(URL, { transports: ['websocket'] });
  await new Promise(r => socket.on('connect', r));
  socket.emit('enter-lobby', { playerId });
  await sleep(400);
  return { playerId, socket, tag };
}

// Fold (or check when free) whenever it's this player's turn — fastest way
// through hands. Returns a stop fn.
function autoFold(player) {
  const h = (state) => {
    if (!state.atTable || state.currentPlayerId !== player.playerId) return;
    const me = state.players?.find(p => p.id === player.playerId);
    if (!me) return;
    const action = state.currentBet > (me.roundBet || 0) ? 'fold' : 'check';
    player.socket.emit('player-action', { action });
  };
  player.socket.on('game-state', h);
  return () => player.socket.off('game-state', h);
}

(async () => {
  console.log(`Match format test vs ${URL}\n`);

  // ════ 1. matchFormat module ════
  console.log('1. Module logic:');
  check('parseLevels round-trips the default schedule',
    serializeLevels(parseLevels(serializeLevels(DEFAULT_FORMAT.levels))) === serializeLevels(DEFAULT_FORMAT.levels));
  check('parseLevels rejects garbage', parseLevels('10/20,nope') === null && parseLevels('') === null);
  check('parseLevels rejects bb < sb', parseLevels('20/10') === null);
  const f = DEFAULT_FORMAT;
  check('hand 1 → 10/20',  blindsForHand(1, f).bb === 20);
  check('hand 5 → 10/20',  blindsForHand(5, f).bb === 20);
  check('hand 6 → 15/30',  blindsForHand(6, f).bb === 30);
  check('hand 11 → 25/50', blindsForHand(11, f).bb === 50);
  check('hand 21 → 100/200', blindsForHand(21, f).bb === 200);
  check('hand 99 clamps to last level', blindsForHand(99, f).bb === 200);

  // ════ 2. Admin API ════
  console.log('2. Admin API:');
  const got = await fetch(`${URL}/api/admin/match-format`).then(r => r.json());
  check('GET returns handsPerLevel + levels + startingChips',
    got.handsPerLevel >= 1 && Array.isArray(got.levels) && got.levels.length >= 1 && got.startingChips > 0);

  check('PUT rejects handsPerLevel 0', (await putFormat({ handsPerLevel: 0, levels: f.levels })).status === 400);
  check('PUT rejects empty levels', (await putFormat({ handsPerLevel: 5, levels: [] })).status === 400);
  check('PUT rejects bb < sb', (await putFormat({ handsPerLevel: 5, levels: [{ sb: 20, bb: 10 }] })).status === 400);
  check('PUT rejects non-integer blinds', (await putFormat({ handsPerLevel: 5, levels: [{ sb: 1.5, bb: 3 }] })).status === 400);

  const custom = { handsPerLevel: 2, levels: [{ sb: 10, bb: 20 }, { sb: 25, bb: 50 }, { sb: 100, bb: 200 }] };
  check('PUT accepts a valid custom format', (await putFormat(custom)).ok);
  const got2 = await fetch(`${URL}/api/admin/match-format`).then(r => r.json());
  check('GET reflects the custom format', got2.handsPerLevel === 2 && got2.levels.length === 3 && got2.levels[1].bb === 50);

  // ════ 3. Live escalation in a bot match (2 hands per level) ════
  console.log('3. Live escalation vs HAL 9000:');
  const A = await makePlayer('A');
  const aMatch = waitFor(A.socket, 'match-found', 8000);
  A.socket.emit('challenge-send', { toId: BOT_ID });
  check('match started vs HAL 9000', (await aMatch)?.opponent?.name === 'HAL 9000');

  const stopA = autoFold(A);
  const h1 = await waitFor(A.socket, 'game-state', 15000, s => s.atTable && s.handNumber === 1 && s.phase === 'pre-flop');
  check('hand 1 posts 10/20', h1?.smallBlind === 10 && h1?.bigBlind === 20);
  const h3 = await waitFor(A.socket, 'game-state', 40000, s => s.atTable && s.handNumber === 3 && s.phase === 'pre-flop');
  check('hand 3 posts 25/50 (level 2)', h3?.smallBlind === 25 && h3?.bigBlind === 50);
  const h5 = await waitFor(A.socket, 'game-state', 40000, s => s.atTable && s.handNumber === 5 && s.phase === 'pre-flop');
  check('hand 5 posts 100/200 (level 3, clamped thereafter)', h5?.smallBlind === 100 && h5?.bigBlind === 200);

  stopA();
  A.socket.emit('leave-table');
  await sleep(800);
  A.socket.disconnect();

  // ════ Restore defaults ════
  const restored = await putFormat({ handsPerLevel: DEFAULT_FORMAT.handsPerLevel, levels: DEFAULT_FORMAT.levels });
  check('default format restored', restored.ok);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('test crashed:', e); process.exit(1); });
