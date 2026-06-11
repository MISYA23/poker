// End-to-end test: Quick Match broadcast-ask model.
//
// Covers:
//  - find-match with nobody queued broadcasts a challenge to every idle human
//  - declining a broadcast copy is silent (no challenge-declined to searcher)
//    and that person isn't re-asked this session
//  - a player who logs in mid-search gets the outstanding ask
//  - 5s fallback: searcher drops into a bot game, broadcast survives
//  - accepting a broadcast ask pulls the searcher OUT of the fallback bot game
//    (bot match voided) and starts the human match
//  - declining an ask while in a bot game flips botRefused in the match-list
//
// Start a server first, then: SERVER_URL=http://localhost:PORT node server/scripts/broadcastTest.js

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

async function makePlayer(tag, { enterLobby = true } = {}) {
  const playerId = `test_bcast_${tag}_${Date.now()}`;
  const resp = await fetch(`${URL}/api/player/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, name: `Bcast${tag}`, avatarId: 'cigar' }),
  });
  if (!resp.ok) throw new Error(`guest upsert failed for ${tag}`);
  const socket = io(URL, { transports: ['websocket'] });
  await new Promise(r => socket.on('connect', r));
  if (enterLobby) {
    socket.emit('enter-lobby', { playerId });
    await sleep(400);
  }
  return { playerId, socket, tag };
}

(async () => {
  console.log(`Broadcast-ask model test vs ${URL}\n`);

  // ════ 1. Quick Match broadcasts to idle humans ════
  console.log('1. A quick-matches with B idle in the lobby:');
  const A = await makePlayer('A');
  const B = await makePlayer('B');

  const bAsk = waitFor(B.socket, 'challenge-received', 4000, d => d.fromId === A.playerId);
  A.socket.emit('find-match', { playerId: A.playerId });
  const ask1 = await bAsk;
  check('B received broadcast ask from A', !!ask1);
  check('lobby ask carries 5-min expiry', ask1?.expiresIn === 300);

  // ════ 2. Broadcast decline is silent + sticky for the session ════
  console.log('2. B declines the broadcast copy:');
  const aDeclined = waitFor(A.socket, 'challenge-declined', 1500, d => d.byId === B.playerId);
  B.socket.emit('challenge-decline', { fromId: A.playerId });
  check('A was NOT notified of the decline', (await aDeclined) === null);

  // ════ 3. A drops into the fallback bot game; broadcast keeps running ════
  console.log('3. A falls back to a bot after 5s:');
  const aFallback = await waitFor(A.socket, 'match-found', 8000);
  check('A got the fallback bot game', aFallback?.fallback === true);

  // ════ 4. Newcomer C gets the outstanding ask; B is not re-asked ════
  console.log('4. C logs in mid-search:');
  const bReAsk = waitFor(B.socket, 'challenge-received', 2500, d => d.fromId === A.playerId);
  // Listen before enter-lobby — the ask fires during the lobby handshake
  const C = await makePlayer('C', { enterLobby: false });
  const cAskP = waitFor(C.socket, 'challenge-received', 4000, d => d.fromId === A.playerId);
  C.socket.emit('enter-lobby', { playerId: C.playerId });
  const cAsk = await cAskP;
  check('C received the outstanding ask from A', !!cAsk);
  check('declined B was not re-asked', (await bReAsk) === null);

  // ════ 5. C accepts → A swaps out of the bot game into the human match ════
  console.log('5. C accepts the ask:');
  const aHuman = waitFor(A.socket, 'match-found', 4000, d => !d.fallback);
  const cMatch = waitFor(C.socket, 'match-found', 4000);
  C.socket.emit('challenge-accept', { fromId: A.playerId });
  const [am, cm] = [await aHuman, await cMatch];
  check('A got match-found vs C (out of the bot game)', am?.opponent?.name === `Bcast${C.tag}`);
  check('C got match-found vs A', cm?.opponent?.name === `Bcast${A.tag}`);

  // ════ 6. botRefused: declining an ask while in a bot game flips status ════
  console.log('6. D in a bot game declines B\'s search:');
  const D = await makePlayer('D');
  D.socket.emit('find-match', { playerId: D.playerId });        // nobody free → bot
  const dFallback = await waitFor(D.socket, 'match-found', 8000);
  check('D got their own fallback bot game', dFallback?.fallback === true);

  const dAsk = waitFor(D.socket, 'challenge-received', 4000, d => d.fromId === B.playerId);
  B.socket.emit('find-match', { playerId: B.playerId });
  const ask2 = await dAsk;
  check('D (in bot game) received B\'s ask with 15s expiry', ask2?.expiresIn === 15);

  const bSeesRefusal = waitFor(B.socket, 'match-list', 4000, d =>
    (d.onlinePlayers || []).some(p => p.id === D.playerId && p.botRefused === true));
  D.socket.emit('challenge-decline', { fromId: B.playerId });
  check('match-list flips D to botRefused after the decline', (await bSeesRefusal) !== null);
  B.socket.emit('cancel-match', {});

  // ════ cleanup ════
  for (const p of [A, B, C, D]) p.socket.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('test crashed:', e); process.exit(1); });
