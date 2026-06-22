// Integration test for the FSM protocol (docs/protocol-fsm.md).
// Drives two real socket clients against a running dev server on :3843 and asserts:
//   1. every snapshot carries `seq` + `lifecycle`
//   2. 2c: turn deadline is null at a fresh decision point, and set after `action-ready`
//   3. 2b: `hand-end-ready` deals the next hand well under the 5s force-deal clamp
//
// Run with the dev server already up:  node server/scripts/fsm-integration-test.js
const { io } = require('../../client/node_modules/socket.io-client');

const URL = 'http://localhost:3843';
const idA = 'fsmtest_' + Math.random().toString(36).slice(2, 10);
const idB = 'fsmtest_' + Math.random().toString(36).slice(2, 10);

const results = [];
const ok   = (m) => { results.push(['PASS', m]); console.log('  ✅', m); };
const fail = (m) => { results.push(['FAIL', m]); console.log('  ❌', m); };

function done(code) {
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'} — ${results.length - failed}/${results.length} checks passed`);
  A.disconnect(); B.disconnect();
  process.exit(code != null ? code : (failed ? 1 : 0));
}
const hardStop = setTimeout(() => { fail('timed out before completing flow'); done(1); }, 25000);

const A = io(URL, { transports: ['websocket'], forceNew: true });
const B = io(URL, { transports: ['websocket'], forceNew: true });
const sock = { [idA]: A, [idB]: B };

let phase = 'init';          // init → ready → await-deadline → folded → await-next-hand → done
let readyA = false, readyB = false;
let actorId = null;
let ackSentAt = 0, foldAckAt = 0;
let firstHandNumber = null;
let lifecycleSeen = new Set();

function bothConnected(cb) {
  let n = 0; const tick = () => (++n === 2) && cb();
  A.on('connect', tick); B.on('connect', tick);
}

bothConnected(() => {
  for (const [id, s] of Object.entries(sock)) {
    s.emit('session', { playerId: id });
    s.emit('enter-lobby', { playerId: id });
  }
  setTimeout(() => { A.emit('find-match', { playerId: idA }); B.emit('find-match', { playerId: idB }); }, 300);
});

function handle(myId, st) {
  if (st.seq == null) fail(`snapshot missing seq (lifecycle=${st.lifecycle})`);
  if (st.lifecycle == null) fail('snapshot missing lifecycle');
  if (st.lifecycle) lifecycleSeen.add(st.lifecycle);

  // First hand started
  if (phase === 'ready' && st.phase === 'pre-flop') {
    phase = 'await-deadline';
    actorId = st.currentPlayerId;
    ok(`first hand dealt; lifecycle=${st.lifecycle}, actor=${actorId === idA ? 'A' : 'B'}`);
    if (st.lifecycle !== 'WAITING_FOR_ACTION') fail(`expected WAITING_FOR_ACTION, got ${st.lifecycle}`);
    // 2c: at a fresh decision point the clock has NOT started
    if (st.turnDeadline == null) ok('2c: turnDeadline is null before action-ready');
    else fail(`2c: turnDeadline already set (${st.turnDeadline}) before any ack`);
    // Actor acks readiness → clock should start
    ackSentAt = Date.now();
    sock[actorId].emit('action-ready', {});
    return;
  }

  // 2c: after action-ready, the actor's snapshot should carry a live deadline
  if (phase === 'await-deadline' && myId === actorId && st.turnDeadline != null) {
    const dt = Date.now() - ackSentAt;
    ok(`2c: turnDeadline set ${dt}ms after action-ready (clock started on ack)`);
    firstHandNumber = st.handNumber;
    phase = 'folded';
    foldAckAt = Date.now();
    sock[actorId].emit('player-action', { action: 'fold' });
    return;
  }

  // Hand ended → both clients signal hand-end animation complete
  if (phase === 'folded' && (st.lifecycle === 'FOLD' || st.lifecycle === 'SHOWDOWN' || st.lifecycle === 'INTER_HAND')) {
    phase = 'await-next-hand';
    foldAckAt = Date.now();
    ok(`fold resolved hand; lifecycle=${st.lifecycle}`);
    A.emit('hand-end-ready', {}); B.emit('hand-end-ready', {});
    return;
  }

  // 2b: next hand should deal quickly (well under the 5000ms clamp)
  if (phase === 'await-next-hand' && st.phase === 'pre-flop' && st.handNumber !== firstHandNumber) {
    const dt = Date.now() - foldAckAt;
    if (dt < 2000) ok(`2b: next hand dealt ${dt}ms after hand-end-ready (beat the 5s clamp)`);
    else fail(`2b: next hand took ${dt}ms — clamp may not have been bypassed`);
    ok(`lifecycle states observed: ${[...lifecycleSeen].join(', ')}`);
    phase = 'done';
    clearTimeout(hardStop);
    setTimeout(() => done(), 200);
    return;
  }
}

A.on('game-state', (st) => handle(idA, st));
B.on('game-state', (st) => handle(idB, st));

function tryReady(id) {
  if (readyA && readyB && phase === 'init') { phase = 'ready'; A.emit('match-ready', {}); B.emit('match-ready', {}); }
}
A.on('match-found', () => { readyA = true; tryReady(); });
B.on('match-found', () => { readyB = true; tryReady(); });
A.on('error', (e) => fail('A error: ' + JSON.stringify(e)));
B.on('error', (e) => fail('B error: ' + JSON.stringify(e)));
