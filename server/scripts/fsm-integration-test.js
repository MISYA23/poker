// Integration test for the FSM protocol (docs/protocol-fsm.md).
// Drives two real socket clients against a running dev server on :3843 and asserts:
//   1. every snapshot carries `seq` + `lifecycle` + `matchState`
//   2. 2c: turn deadline is null at a fresh decision point, and set after `action-ready`
//   3. 2b: `hand-end-ready` deals the next hand well under the 5s force-deal clamp
//   4. §11: shove both stacks all-in until a bust, and assert the `match-over` event
//           carries `matchState: 'MATCH_OVER'` (the held-showdown edge — see §11 quirk #1)
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

let phase = 'init';          // init → ready → await-deadline → folded → await-next-hand → shoving → done
let readyA = false, readyB = false;
let actorId = null;
let ackSentAt = 0, foldAckAt = 0;
let firstHandNumber = null;
let lifecycleSeen  = new Set();
let matchStateSeen = new Set();
let lastShoveSeq   = -1;       // de-dupe: A and B both receive each snapshot at the same seq
let matchOverChecked = false;

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
  if (st.matchState == null) fail(`snapshot missing matchState (lifecycle=${st.lifecycle})`);
  if (st.lifecycle)  lifecycleSeen.add(st.lifecycle);
  if (st.matchState) matchStateSeen.add(st.matchState);

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
    if (st.matchState === 'IN_MATCH') ok(`matchState=IN_MATCH during live play`);
    else fail(`expected matchState=IN_MATCH mid-hand, got ${st.matchState}`);
    phase = 'shoving';
    // fall through to the shove logic below for this same snapshot
  }

  // §11: ram both stacks all-in every hand until someone busts. The actor opens
  // all-in; whoever faces it calls (calling an all-in puts the caller all-in too),
  // so a full hand resolves with all chips committed → MATCH_OVER in one or two hands.
  if (phase === 'shoving') {
    // Hand resolved without a bust (e.g. a chopped pot) — ack so the next hand deals.
    if (st.lifecycle === 'FOLD' || st.lifecycle === 'SHOWDOWN' || st.lifecycle === 'INTER_HAND') {
      if (st.seq !== lastShoveSeq) { lastShoveSeq = st.seq; A.emit('hand-end-ready', {}); B.emit('hand-end-ready', {}); }
      return;
    }
    if (st.currentPlayerId && st.seq !== lastShoveSeq) {
      lastShoveSeq = st.seq;
      const actor    = st.currentPlayerId;
      const facingAllIn = (st.players || []).some(p => p.id !== actor && p.allIn);
      sock[actor].emit('player-action', facingAllIn ? { action: 'call' } : { action: 'all-in' });
    }
    return;
  }
}

// §11 quirk #1: on a bust the server holds game-state in showdown and delivers the
// outcome via the out-of-band `match-over` event — so the FSM edge must ride on it.
function onMatchOver(who, data) {
  if (matchOverChecked) return;
  matchOverChecked = true;
  if (data.matchState === 'MATCH_OVER') ok(`§11: match-over event carries matchState=MATCH_OVER (to ${who})`);
  else fail(`§11: match-over missing MATCH_OVER (got ${data.matchState}) to ${who}`);
  ok(`lifecycle states observed: ${[...lifecycleSeen].join(', ')}`);
  ok(`matchState states observed: ${[...matchStateSeen].join(', ')}`);
  if (matchStateSeen.has('AWAITING_READY')) ok('matchState=AWAITING_READY seen pre-first-hand');
  else fail('never observed AWAITING_READY before the first hand');
  phase = 'done';
  clearTimeout(hardStop);
  setTimeout(() => done(), 200);
}
A.on('match-over', (d) => onMatchOver('A', d));
B.on('match-over', (d) => onMatchOver('B', d));

A.on('game-state', (st) => handle(idA, st));
B.on('game-state', (st) => handle(idB, st));

function tryReady(id) {
  if (readyA && readyB && phase === 'init') { phase = 'ready'; A.emit('match-ready', {}); B.emit('match-ready', {}); }
}
A.on('match-found', () => { readyA = true; tryReady(); });
B.on('match-found', () => { readyB = true; tryReady(); });
A.on('error', (e) => fail('A error: ' + JSON.stringify(e)));
B.on('error', (e) => fail('B error: ' + JSON.stringify(e)));
