// Match lifecycle invariant tests.
//
// Invariants under test:
//  - lobby and table are mutually exclusive (enter-lobby forfeits any live match)
//  - disconnect = instant forfeit, no grace period; remaining player wins
//  - a returning player is always free (never stuck "in a match")
//  - find-match / cancel-match never corrupt match state
//  - acting on a dead match is a harmless no-op
//
// Start a server first, then: SERVER_URL=http://localhost:PORT node server/scripts/matchLifecycleTest.js

const { io } = require('../../client/node_modules/socket.io-client');

const URL = process.env.SERVER_URL || 'http://localhost:3843';
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
}

(async () => {
  console.log(`Match lifecycle invariant tests vs ${URL}\n`);

  // ════ 1. Disconnect = instant forfeit, no grace ════
  console.log('1. Disconnect ends the match immediately:');
  const A = await makePlayer('A');
  const B = await makePlayer('B');
  await startMatch(A, B);
  const t0 = Date.now();
  const aOver = waitFor(A.socket, 'match-over', 5000);
  B.socket.disconnect();
  const over = await aOver;
  check('A got match-over when B disconnected', over !== null);
  check('A is the winner', over?.winnerId === A.playerId);
  check(`forfeit was immediate (${Date.now() - t0}ms, no 30s grace)`, Date.now() - t0 < 4000);

  // ════ 2. Returning player is free ════
  console.log('2. Disconnected player returns free:');
  const B2 = await makePlayer('B2', B.playerId); // same identity, new socket
  const aRecv = waitFor(A.socket, 'challenge-received');
  B2.socket.emit('challenge-send', { toId: A.playerId });
  check('returning player can challenge immediately', (await aRecv)?.fromId === B.playerId);

  // A is on the match-over screen of an ended match — also free to accept
  const bMatch = waitFor(B2.socket, 'match-found');
  A.socket.emit('challenge-accept', { fromId: B.playerId });
  check('player on match-over screen can accept a challenge', (await bMatch) !== null);

  // clean up: A leaves the new match
  const aReset = waitFor(A.socket, 'reset');
  A.socket.emit('leave-table');
  await aReset;

  // ════ 3. Lobby and table are mutually exclusive ════
  console.log('3. Entering the lobby forfeits a live match:');
  const C = await makePlayer('C');
  const D = await makePlayer('D');
  await startMatch(C, D);
  const dOver = waitFor(D.socket, 'match-over', 5000);
  C.socket.emit('enter-lobby', { playerId: C.playerId }); // C walked back to the lobby
  const dWin = await dOver;
  check('D got match-over when C entered the lobby', dWin !== null);
  check('D is the winner', dWin?.winnerId === D.playerId);

  // C must be free instantly — play a bot with no error
  const cErr = waitFor(C.socket, 'error', 2500);
  const cMatch = waitFor(C.socket, 'match-found', 4000);
  C.socket.emit('play-bot', { playerId: C.playerId });
  const [cm, ce] = await Promise.all([cMatch, cErr]);
  check('C can start a bot match right after', cm !== null);
  check('no "finish your current match" error for C', ce === null);
  const cReset = waitFor(C.socket, 'reset');
  C.socket.emit('leave-table');
  await cReset;

  // ════ 4. find-match guard while in a live match ════
  console.log('4. Queueing while in a live match is rejected:');
  const E = await makePlayer('E');
  const F = await makePlayer('F');
  await startMatch(E, F);
  const eErr = waitFor(E.socket, 'error');
  E.socket.emit('find-match', { playerId: E.playerId });
  check('find-match rejected mid-match', /match/i.test((await eErr)?.message || ''));
  const eReset = waitFor(E.socket, 'reset');
  E.socket.emit('leave-table');
  await eReset;

  // ════ 5. cancel-match never touches match state ════
  console.log('5. Queue cancel is harmless:');
  const G = await makePlayer('G');
  const gQueued = waitFor(G.socket, 'in-queue');
  G.socket.emit('find-match', { playerId: G.playerId });
  await gQueued;
  const gCancelled = waitFor(G.socket, 'queue-cancelled');
  G.socket.emit('cancel-match');
  await gCancelled;
  const gMatch = waitFor(G.socket, 'match-found', 4000);
  G.socket.emit('play-bot', { playerId: G.playerId });
  check('play-bot works right after queue cancel', (await gMatch) !== null);
  const gReset = waitFor(G.socket, 'reset');
  G.socket.emit('leave-table');
  await gReset;

  // ════ 6. Acting on a dead match is a no-op ════
  console.log('6. Stray actions on a dead match:');
  // F is still seated at the E–F ended match — actions must be ignored
  F.socket.emit('player-action', { action: 'check' });
  await sleep(400);
  const fRecv = waitFor(F.socket, 'challenge-received', 4000);
  G.socket.emit('challenge-send', { toId: F.playerId });
  check('server healthy + F challengeable after stray action', (await fRecv)?.fromId === G.playerId);

  // ════ 7. Bot match disconnect frees the bot ════
  console.log('7. Bot opponent is freed when human disconnects:');
  const H = await makePlayer('H');
  const hMatch = waitFor(H.socket, 'match-found');
  H.socket.emit('challenge-send', { toId: 'bot_rickdeckard' });
  await hMatch;
  H.socket.disconnect();
  await sleep(1200);
  const I = await makePlayer('I');
  const iMatch = waitFor(I.socket, 'match-found', 4000);
  I.socket.emit('challenge-send', { toId: 'bot_rickdeckard' });
  check('bot freed immediately after human disconnect', (await iMatch)?.opponent?.name === 'Rick Deckard');
  const iReset = waitFor(I.socket, 'reset');
  I.socket.emit('leave-table');
  await iReset;

  for (const p of [A, B2, C, D, E, F, G, I]) p.socket.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error('Test crashed:', err); process.exit(1); });
