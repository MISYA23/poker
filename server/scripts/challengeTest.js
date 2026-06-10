// End-to-end test of the challenge flow against a locally running server.
// Covers: send, receive, multiple outgoing/incoming, accept → match-found,
// void-on-accept for third parties, decline, and challenge-while-in-match.
//
// Start the server first (cd server && node index.js), then:
//   node server/scripts/challengeTest.js

const { io } = require('../../client/node_modules/socket.io-client');

const URL = process.env.SERVER_URL || 'http://localhost:3843';
let pass = 0, fail = 0;

function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name}`); }
}

function waitFor(socket, event, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (data) => { clearTimeout(t); resolve(data ?? {}); });
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function makePlayer(tag) {
  const playerId = `test_ch_${tag}_${Date.now()}`;
  const resp = await fetch(`${URL}/api/player/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, name: `ChTest${tag}`, avatarId: 'cigar' }),
  });
  if (!resp.ok) throw new Error(`guest upsert failed for ${tag}`);
  const socket = io(URL, { transports: ['websocket'] });
  await new Promise(r => socket.on('connect', r));
  socket.emit('enter-lobby', { playerId });
  await sleep(400); // let enter-lobby resolve the DB lookup
  return { playerId, socket, tag };
}

(async () => {
  console.log(`Challenge flow test vs ${URL}\n`);
  const A = await makePlayer('A');
  const B = await makePlayer('B');
  const C = await makePlayer('C');

  // ── A challenges B ──
  console.log('A challenges B:');
  const bReceives = waitFor(B.socket, 'challenge-received');
  const aSent = waitFor(A.socket, 'challenge-sent');
  A.socket.emit('challenge-send', { toId: B.playerId });
  const [recv, sent] = await Promise.all([bReceives, aSent]);
  check('B received challenge from A', recv?.fromId === A.playerId);
  check('A got challenge-sent with B name', sent?.toId === B.playerId && sent?.toName === 'ChTestB');

  // ── C also challenges B (multiple incoming for B) ──
  console.log('C challenges B (B now has 2 incoming):');
  const bReceives2 = waitFor(B.socket, 'challenge-received');
  C.socket.emit('challenge-send', { toId: B.playerId });
  const recv2 = await bReceives2;
  check('B received challenge from C too', recv2?.fromId === C.playerId);

  // ── A also challenges C (A has 2 outgoing) ──
  console.log('A challenges C (A now has 2 outgoing):');
  const cReceives = waitFor(C.socket, 'challenge-received');
  A.socket.emit('challenge-send', { toId: C.playerId });
  check('C received challenge from A', (await cReceives)?.fromId === A.playerId);

  // ── B accepts A's challenge → match starts, everything else voids ──
  console.log("B accepts A's challenge:");
  const aMatch = waitFor(A.socket, 'match-found');
  const bMatch = waitFor(B.socket, 'match-found');
  const cVoid = waitFor(C.socket, 'challenge-voided');
  B.socket.emit('challenge-accept', { fromId: A.playerId });
  const [am, bm, cv] = await Promise.all([aMatch, bMatch, cVoid]);
  check('A got match-found vs B', am?.opponent?.name === 'ChTestB');
  check('B got match-found vs A', bm?.opponent?.name === 'ChTestA');
  check("C notified that a challenge was voided", cv !== null);

  // ── C→B challenge should be dead now (B is in a match) ──
  console.log('C tries to accept nothing / re-challenge B mid-match:');
  const cErr = waitFor(C.socket, 'error');
  C.socket.emit('challenge-send', { toId: B.playerId });
  const e1 = await cErr;
  check('challenging an in-match player errors', /match/i.test(e1?.message || ''));

  // ── A (in a match) tries to challenge C ──
  const aErr = waitFor(A.socket, 'error');
  A.socket.emit('challenge-send', { toId: C.playerId });
  const e2 = await aErr;
  check('challenging while in a match errors', /match/i.test(e2?.message || ''));

  // ── B's stale accept of C's (voided) challenge errors ──
  const bErr = waitFor(B.socket, 'error');
  B.socket.emit('challenge-accept', { fromId: C.playerId });
  const e3 = await bErr;
  check('accepting a voided challenge errors', !!e3?.message);

  // ── Decline flow: clean pair D→C, C declines ──
  console.log('Decline flow:');
  const D = await makePlayer('D');
  const cReceives2 = waitFor(C.socket, 'challenge-received');
  D.socket.emit('challenge-send', { toId: C.playerId });
  await cReceives2;
  const dDeclined = waitFor(D.socket, 'challenge-declined');
  C.socket.emit('challenge-decline', { fromId: D.playerId });
  const dec = await dDeclined;
  check('challenger notified of decline with byId', dec?.byId === C.playerId);

  // ── Withdraw flow: D challenges C, then withdraws ──
  console.log('Withdraw flow:');
  const cReceivesW = waitFor(C.socket, 'challenge-received');
  D.socket.emit('challenge-send', { toId: C.playerId });
  await cReceivesW;
  const cVoidW = waitFor(C.socket, 'challenge-voided');
  const dVoidW = waitFor(D.socket, 'challenge-voided');
  D.socket.emit('challenge-withdraw', { toId: C.playerId });
  const [cvw, dvw] = await Promise.all([cVoidW, dVoidW]);
  check('target notified when challenge withdrawn', cvw?.otherId === D.playerId);
  check('challenger gets void ack on withdraw', dvw?.otherId === C.playerId);

  // ── Disconnect voids: D challenges C again, then D disconnects ──
  console.log('Disconnect voids outgoing challenges:');
  const cReceives3 = waitFor(C.socket, 'challenge-received');
  D.socket.emit('challenge-send', { toId: C.playerId });
  await cReceives3;
  const cVoid2 = waitFor(C.socket, 'challenge-voided');
  D.socket.disconnect();
  const cv2 = await cVoid2;
  check('C notified of void when D disconnected', cv2?.otherId === D.playerId);

  // Cleanup: leave the A–B match so it ends, then drop sockets
  A.socket.emit('leave-table');
  await sleep(500);
  for (const p of [A, B, C]) p.socket.disconnect();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error('Test crashed:', err); process.exit(1); });
