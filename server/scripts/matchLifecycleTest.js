// Match lifecycle invariant tests.
//
// Invariants under test:
//  - disconnect vacates the seat: opponent sees a grace banner, match stays live
//  - reconnect within grace re-seats the SAME match; after expiry the present player wins
//  - both seats vacant → match closes immediately
//  - lobby and table are mutually exclusive (a seated socket entering the lobby forfeits;
//    a fresh socket entering the lobby rejoins its vacant seat instead)
//  - find-match / cancel-match never corrupt match state
//  - acting on a dead match is a harmless no-op
//
// GRACE must match the server's grace window (DISCONNECT_GRACE_MS on the server,
// TEST_GRACE_MS here; default 20000 to match prod).
//
// Run: SERVER_URL=http://localhost:PORT TEST_GRACE_MS=4000 node server/scripts/matchLifecycleTest.js

const { io } = require('../../client/node_modules/socket.io-client');

const URL = process.env.SERVER_URL || 'http://localhost:3843';
const GRACE = parseInt(process.env.TEST_GRACE_MS, 10) || 20000;
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

async function makePlayer(tag, playerId = null) {
  playerId = playerId || `test_ml_${tag}_${Date.now()}`;
  const resp = await fetch(`${URL}/api/player/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, name: `MlTest${tag}`, avatarId: 'cigar' }),
  });
  if (!resp.ok) throw new Error(`guest upsert failed for ${tag}`);
  const socket = io(URL, { transports: ['websocket'] });
  await new Promise(r => socket.on('connect', r));
  socket.emit('enter-lobby', { playerId });
  await sleep(400);
  return { playerId, socket, tag };
}

async function startMatch(challenger, accepter) {
  const recv = waitFor(accepter.socket, 'challenge-received');
  challenger.socket.emit('challenge-send', { toId: accepter.playerId });
  await recv;
  const m1 = waitFor(challenger.socket, 'match-found');
  const m2 = waitFor(accepter.socket, 'match-found');
  accepter.socket.emit('challenge-accept', { fromId: challenger.playerId });
  const [a, b] = await Promise.all([m1, m2]);
  if (!a || !b) throw new Error('match failed to start');
  return a.matchId;
}

(async () => {
  console.log(`Match lifecycle tests vs ${URL} (grace ${GRACE}ms)\n`);

  // ════ 1. Disconnect vacates the seat — grace, then forfeit ════
  console.log('1. Disconnect → grace → forfeit:');
  const A = await makePlayer('A');
  const B = await makePlayer('B');
  await startMatch(A, B);
  const aBanner = waitFor(A.socket, 'opponent-disconnected', 4000);
  const aOverEarly = waitFor(A.socket, 'match-over', GRACE * 0.5);
  B.socket.disconnect();
  const banner = await aBanner;
  check('A told opponent disconnected, with deadline', banner !== null && banner.deadline > Date.now());
  check('match NOT ended during grace', (await aOverEarly) === null);
  const aOver = await waitFor(A.socket, 'match-over', GRACE);
  check('A wins when grace expires', aOver?.winnerId === A.playerId);
  A.socket.emit('rematch-vote', { vote: false });
  await waitFor(A.socket, 'reset', 3000);

  // ════ 2. Reconnect within grace re-seats the same match ════
  console.log('2. Reconnect within grace resumes the match:');
  const C = await makePlayer('C');
  const D = await makePlayer('D');
  const matchId = await startMatch(C, D);
  const cBanner = waitFor(C.socket, 'opponent-disconnected', 4000);
  D.socket.disconnect();
  await cBanner;

  // D returns on a brand-new socket (refresh) and just enters the lobby
  const cBack = waitFor(C.socket, 'opponent-reconnected', 5000);
  const D2 = { playerId: D.playerId, socket: io(URL, { transports: ['websocket'] }) };
  await new Promise(r => D2.socket.on('connect', r));
  const dRejoin = waitFor(D2.socket, 'match-found', 5000);
  D2.socket.emit('enter-lobby', { playerId: D.playerId });
  const rejoin = await dRejoin;
  check('D pulled back into the SAME match', rejoin !== null && rejoin.matchId === matchId);
  check('C notified opponent reconnected', (await cBack) !== null);

  // the match must still be playable and must NOT end at the old grace deadline
  const cOverStale = waitFor(C.socket, 'match-over', GRACE + 2000);
  check('no stale grace-forfeit after rejoin', (await cOverStale) === null);

  // ════ 3. A seated socket entering the lobby still forfeits ════
  console.log('3. Deliberate lobby navigation forfeits:');
  const dOver = waitFor(D2.socket, 'match-over', 5000);
  C.socket.emit('enter-lobby', { playerId: C.playerId }); // C walks back to the lobby
  const dWin = await dOver;
  check('D wins when C deliberately enters the lobby', dWin?.winnerId === D.playerId);
  D2.socket.emit('rematch-vote', { vote: false });
  await waitFor(D2.socket, 'reset', 3000);

  // ════ 4. Both seats vacant → immediate close ════
  console.log('4. Both players disconnect:');
  const E = await makePlayer('E');
  const F = await makePlayer('F');
  await startMatch(E, F);
  E.socket.disconnect();
  await sleep(500);
  F.socket.disconnect();
  await sleep(1000); // well inside the grace window
  // E returns: there must be NO vacant seat left to rejoin (match closed)
  const E2 = { playerId: E.playerId, socket: io(URL, { transports: ['websocket'] }) };
  await new Promise(r => E2.socket.on('connect', r));
  const eRejoin = waitFor(E2.socket, 'match-found', 3000);
  E2.socket.emit('enter-lobby', { playerId: E.playerId });
  check('no zombie seat after double disconnect', (await eRejoin) === null);

  // ════ 5. find-match / cancel-match hygiene ════
  console.log('5. Queue guards:');
  const G = await makePlayer('G');
  const H = await makePlayer('H');
  await startMatch(G, H);
  const gErr = waitFor(G.socket, 'error');
  G.socket.emit('find-match', { playerId: G.playerId });
  check('find-match rejected mid-match', /match/i.test((await gErr)?.message || ''));
  const gReset = waitFor(G.socket, 'reset');
  G.socket.emit('leave-table');
  await gReset;

  const gQueued = waitFor(G.socket, 'in-queue');
  G.socket.emit('find-match', { playerId: G.playerId });
  await gQueued;
  const gCancelled = waitFor(G.socket, 'queue-cancelled');
  G.socket.emit('cancel-match');
  await gCancelled;
  const gMatch = waitFor(G.socket, 'match-found', 4000);
  G.socket.emit('play-bot', { playerId: G.playerId });
  check('play-bot works right after queue cancel', (await gMatch) !== null);
  const gReset2 = waitFor(G.socket, 'reset');
  G.socket.emit('leave-table');
  await gReset2;

  // ════ 6. Stray actions on a dead match are no-ops ════
  console.log('6. Stray actions on a dead match:');
  // H is still seated at the ended G–H match — actions must be ignored
  H.socket.emit('player-action', { action: 'check' });
  await sleep(400);
  const hRecv = waitFor(H.socket, 'challenge-received', 4000);
  G.socket.emit('challenge-send', { toId: H.playerId });
  check('server healthy + H challengeable after stray action', (await hRecv)?.fromId === G.playerId);

  // ════ 7. Bot match: human vacates, bot wins at grace expiry ════
  console.log('7. Bot match disconnect:');
  const I = await makePlayer('I');
  const iMatch = waitFor(I.socket, 'match-found');
  I.socket.emit('challenge-send', { toId: 'bot_rickdeckard' });
  await iMatch;
  I.socket.disconnect();
  await sleep(GRACE + 2500);
  const J = await makePlayer('J');
  const jMatch = waitFor(J.socket, 'match-found', 5000);
  J.socket.emit('challenge-send', { toId: 'bot_rickdeckard' });
  check('bot freed after grace expired', (await jMatch)?.opponent?.name === 'Rick Deckard');
  const jReset = waitFor(J.socket, 'reset');
  J.socket.emit('leave-table');
  await jReset;

  for (const p of [A, C, D2, E2, F, G, H, J]) p.socket.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error('Test crashed:', err); process.exit(1); });
