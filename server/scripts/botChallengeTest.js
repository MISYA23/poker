// End-to-end test: bot challenges + match-end/rematch state bugs.
//
// Covers:
//  - challenging a specific bot starts an instant match and the bot actually plays
//  - busy-bot and in-match guards
//  - challenging a bot voids pending human challenges
//  - THE rematch bug: match ends via leave → decline rematch → player must get
//    reset and be able to challenge again (previously stuck "in a match")
//  - zombie-hand regression: no new hand dealt after a match ends mid inter-hand delay
//
// Start a server first, then: SERVER_URL=http://localhost:PORT node server/scripts/botChallengeTest.js

const { io } = require('../../client/node_modules/socket.io-client');

const URL = process.env.SERVER_URL || 'http://localhost:3843';
const BOT_ID = 'bot_johnny5';
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

async function makePlayer(tag) {
  const playerId = `test_bc_${tag}_${Date.now()}`;
  const resp = await fetch(`${URL}/api/player/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, name: `BcTest${tag}`, avatarId: 'cigar' }),
  });
  if (!resp.ok) throw new Error(`guest upsert failed for ${tag}`);
  const socket = io(URL, { transports: ['websocket'] });
  await new Promise(r => socket.on('connect', r));
  socket.emit('enter-lobby', { playerId });
  await sleep(400);
  return { playerId, socket, tag };
}

// Auto-play check/call whenever it's this player's turn. Returns a stop fn.
function autoCheckCall(player) {
  const h = (state) => {
    if (!state.atTable || state.currentPlayerId !== player.playerId) return;
    const me = state.players?.find(p => p.id === player.playerId);
    if (!me) return;
    const action = state.currentBet > (me.roundBet || 0) ? 'call' : 'check';
    player.socket.emit('player-action', { action });
  };
  player.socket.on('game-state', h);
  return () => player.socket.off('game-state', h);
}

(async () => {
  console.log(`Bot challenge + match lifecycle test vs ${URL}\n`);

  // ════ 1. Challenge a specific bot → instant match, bot plays ════
  console.log('1. Challenge Johnny 5 directly:');
  const A = await makePlayer('A');
  const aMatch = waitFor(A.socket, 'match-found');
  A.socket.emit('challenge-send', { toId: BOT_ID });
  const am = await aMatch;
  check('A got instant match-found vs Johnny 5', am?.opponent?.name === 'Johnny 5');

  // Play check/call and watch the hand progress past the flop
  const stopA = autoCheckCall(A);
  const sawFlop = await waitFor(A.socket, 'game-state', 25000,
    (s) => s.atTable && (s.communityCards?.length || 0) >= 3);
  check('hand progressed to the flop (bot is acting)', sawFlop !== null);
  const botActed = (sawFlop?.handActions || []).some(a => a.playerId === BOT_ID);
  check('bot has taken at least one action', botActed);
  stopA();

  // ════ 2. Busy bot guard ════
  console.log('2. Second player challenges the same (busy) bot:');
  const B = await makePlayer('B');
  const bErr = waitFor(B.socket, 'error');
  B.socket.emit('challenge-send', { toId: BOT_ID });
  const e1 = await bErr;
  check('busy bot challenge errors cleanly', /in a match/i.test(e1?.message || ''));

  // ════ 3. In-match player can't challenge a bot ════
  const aErr = waitFor(A.socket, 'error');
  A.socket.emit('challenge-send', { toId: 'bot_hal' });
  check('in-match player blocked from bot challenge', /match/i.test((await aErr)?.message || ''));

  // A leaves the bot match → reset
  const aReset = waitFor(A.socket, 'reset');
  A.socket.emit('leave-table');
  check('A got reset after leaving bot match', (await aReset) !== null);

  // ════ 4. Challenging a bot voids pending human challenges ════
  console.log('4. Bot challenge voids pending human challenges:');
  const bRecv = waitFor(B.socket, 'challenge-received');
  A.socket.emit('challenge-send', { toId: B.playerId });
  await bRecv;
  const bVoid = waitFor(B.socket, 'challenge-voided');
  const aMatch2 = waitFor(A.socket, 'match-found', 8000);
  A.socket.emit('challenge-send', { toId: 'bot_hal' });
  const [bv, am2] = await Promise.all([bVoid, aMatch2]);
  check('A matched with HAL 9000', am2?.opponent?.name === 'HAL 9000');
  check('B notified that A\'s challenge was voided', bv?.otherId === A.playerId);
  const aReset2 = waitFor(A.socket, 'reset');
  A.socket.emit('leave-table');
  await aReset2;

  // ════ 5. THE rematch bug: leave-ended match + decline vote ════
  console.log('5. Rematch-decline after opponent leaves (the stuck-state bug):');
  const C = await makePlayer('C');
  const cRecv = waitFor(C.socket, 'challenge-received');
  A.socket.emit('challenge-send', { toId: C.playerId });
  await cRecv;
  const aMatch3 = waitFor(A.socket, 'match-found');
  const cMatch3 = waitFor(C.socket, 'match-found');
  C.socket.emit('challenge-accept', { fromId: A.playerId });
  await Promise.all([aMatch3, cMatch3]);

  // Wait for the first hand, then whoever is on turn FOLDS → schedules next hand
  const onTurn = await waitFor(A.socket, 'game-state', 20000,
    (s) => s.atTable && s.phase === 'pre-flop' && s.currentPlayerId);
  check('A–C hand started', onTurn !== null);
  const folder = onTurn.currentPlayerId === A.playerId ? A : C;
  folder.socket.emit('player-action', { action: 'fold' });
  await sleep(800); // hand ends by fold; 5s inter-hand timer now pending

  // C leaves while the next-hand timer is pending → endMatch must kill it
  const aOver = waitFor(A.socket, 'match-over', 8000);
  const cReset = waitFor(C.socket, 'reset');
  C.socket.emit('leave-table');
  check('A got match-over when C left', (await aOver) !== null);
  check('C got reset on leave', (await cReset) !== null);

  // Zombie-hand regression: no fresh hand may be dealt on the dead match
  const zombie = await waitFor(A.socket, 'game-state', 7000,
    (s) => s.phase === 'pre-flop' && s.atTable);
  check('no zombie hand dealt after match ended', zombie === null);

  // A declines the rematch → must get reset (was silently swallowed before)
  const aReset3 = waitFor(A.socket, 'reset');
  A.socket.emit('rematch-vote', { vote: false });
  check('A got reset after declining rematch', (await aReset3) !== null);

  // ...and A is free: challenging someone must NOT error
  console.log('6. A is free again after the decline:');
  const cRecv2 = waitFor(C.socket, 'challenge-received');
  const aErr2 = waitFor(A.socket, 'error', 3000);
  A.socket.emit('challenge-send', { toId: C.playerId });
  const [recv2, err2] = await Promise.all([cRecv2, aErr2]);
  check('A\'s new challenge went through (not stuck "in a match")', recv2?.fromId === A.playerId);
  check('no "finish your current match" error', err2 === null);

  // C can also still accept and play — full loop sanity
  const aMatch4 = waitFor(A.socket, 'match-found');
  C.socket.emit('challenge-accept', { fromId: A.playerId });
  check('post-bug-fix match starts normally', (await aMatch4) !== null);

  for (const p of [A, B, C]) p.socket.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error('Test crashed:', err); process.exit(1); });
