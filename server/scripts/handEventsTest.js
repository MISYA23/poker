// hand_events v2 — discrete sequential event stream tests.
//
// Plays scripted matches against a running server, then validates the rows
// flushed to Postgres for every hand:
//  - one global seq per hand: strictly 1..N, no gaps, no duplicate numbers
//  - first row hand_start, last row hand_end; blinds + hole cards before any action
//  - phase = street the event happened ON (the call that closes a street keeps
//    that street's phase, even when it triggers the next deal or showdown)
//  - amount = chips actually committed (a call of a raise is never 0)
//  - data.pot is the exact running pot; sum(amount) == hand_end pot == hands.pot
//  - deal_board one row per street (flop/turn/river) even on all-in runouts
//  - showdown row present iff the hand reached showdown; hand_end.endedBy correct
//  - hand_start stacks are pre-blind and consistent hand-to-hand
//
// Scenarios:
//  H1  betting on every street — limp/check pre, bet+call flop, bet+call turn,
//      check/check river → showdown (4th and 5th street actions + deals)
//  H2  pre-flop raise war ending in a fold (no board, no showdown row)
//  H3  flop all-in + call → split board runout to showdown
//  Bot match — generic invariants on brain-driven hands
//
// Run: SERVER_URL=http://localhost:PORT node server/scripts/handEventsTest.js

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { io } = require('../../client/node_modules/socket.io-client');
const { Pool } = require('pg');

const URL = process.env.SERVER_URL || 'http://localhost:3843';
const db = new Pool({ connectionString: process.env.DATABASE_URL });
let pass = 0, fail = 0;

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ''}`); }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function waitFor(socket, event, timeoutMs = 8000, predicate = null) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { socket.off(event, h); resolve(null); }, timeoutMs);
    const h = (data) => {
      if (predicate && !predicate(data)) return;
      clearTimeout(t); socket.off(event, h); resolve(data ?? {});
    };
    socket.on(event, h);
  });
}

async function makePlayer(tag) {
  const playerId = `test_he_${tag}_${Date.now()}`;
  const resp = await fetch(`${URL}/api/player/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, name: `HeTest${tag}`, avatarId: 'cigar' }),
  });
  if (!resp.ok) throw new Error(`guest upsert failed for ${tag}`);
  const socket = io(URL, { transports: ['websocket'] });
  await new Promise(r => socket.on('connect', r));
  socket.emit('enter-lobby', { playerId });
  await sleep(400);
  const player = { playerId, socket, tag, acted: new Set(), liveRows: [] };
  // live hand-event stream — every batch the server broadcasts to this player
  socket.on('hand-events', (batch) => player.liveRows.push(...(batch.rows || [])));
  return player;
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

// Drives a player: whenever it's their turn, ask the policy for that hand
// number what to do. Dedupes on (handNumber, actions-so-far) so repeated
// broadcasts of the same decision point fire only once.
function attachDriver(player, policies) {
  player.socket.on('game-state', (st) => {
    if (st.phase === 'showdown' || st.phase === 'waiting') return;
    if (st.currentPlayerId !== player.playerId) return;
    const policy = policies[st.handNumber] || policies.any;
    if (!policy) return;
    const key = `${st.handNumber}:${(st.handActions || []).length}`;
    if (player.acted.has(key)) return;
    player.acted.add(key);
    const me = st.players.find(p => p.id === player.playerId);
    const decision = policy(st, me);
    if (decision) setTimeout(() => player.socket.emit('player-action', decision), 60);
  });
}

// ── Scenario policies ─────────────────────────────────────────────────────────

// H1: limp/check pre-flop; flopAgg bets 2bb on the flop, turnAgg bets 3bb on
// the turn, the other calls; river checks down → showdown.
const fullStreetsPolicy = (flopAgg, turnAgg) => (st, me) => {
  const toCall = st.currentBet - me.roundBet;
  if (toCall > 0) return { action: 'call' };
  if (st.phase === 'flop' && flopAgg) return { action: 'raise', amount: st.bigBlind * 2 };
  if (st.phase === 'turn' && turnAgg) return { action: 'raise', amount: st.bigBlind * 3 };
  return { action: 'check' };
};

// H2: raise to 3bb → 3-bet to 9bb → fold. Both players share the policy;
// whoever faces the 9bb folds.
const raiseWarPolicy = () => (st, me) => {
  if (st.phase !== 'pre-flop') return { action: 'check' };
  if (st.currentBet <= st.bigBlind) return { action: 'raise', amount: st.bigBlind * 3 };
  if (st.currentBet <= st.bigBlind * 3) return { action: 'raise', amount: st.bigBlind * 9 };
  return { action: 'fold' };
};

// H3: see the flop cheap, then jammer open-jams and the other calls.
const allInPolicy = (jammer) => (st, me) => {
  const toCall = st.currentBet - me.roundBet;
  if (toCall > 0) return { action: 'call' };
  if (st.phase === 'flop' && jammer) return { action: 'all-in' };
  return { action: 'check' };
};

const checkCallPolicy = () => (st, me) =>
  st.currentBet - me.roundBet > 0 ? { action: 'call' } : { action: 'check' };

// ── Event-stream validation ───────────────────────────────────────────────────

async function fetchHands(matchUuid) {
  const { rows: m } = await db.query('SELECT id FROM matches WHERE uuid=$1', [matchUuid]);
  if (!m.length) return [];
  const { rows: hands } = await db.query(
    'SELECT id, hand_number, pot, community_cards, winner_id FROM hands WHERE match_id=$1 ORDER BY hand_number',
    [m[0].id]
  );
  for (const h of hands) {
    const { rows } = await db.query(
      `SELECT sequence_num AS seq, event_type AS type, player_id, amount, phase, data
       FROM hand_events WHERE hand_id=$1 ORDER BY sequence_num`,
      [h.id]
    );
    h.events = rows;
  }
  return hands;
}

// Invariants every hand must satisfy regardless of how it played out.
function checkHandInvariants(h, label) {
  const evs = h.events;
  const seqs = evs.map(e => e.seq);
  check(`${label}: seq is exactly 1..${evs.length}`,
    seqs.every((s, i) => s === i + 1), `got [${seqs.join(',')}]`);

  check(`${label}: first row is hand_start`, evs[0]?.type === 'hand_start');
  check(`${label}: last row is hand_end`, evs[evs.length - 1]?.type === 'hand_end');

  const start = evs[0]?.data || {};
  const end = evs[evs.length - 1]?.data || {};

  const firstAction = evs.findIndex(e => e.type === 'action');
  const setup = evs.slice(0, firstAction === -1 ? evs.length : firstAction);
  check(`${label}: blinds + hole cards all dealt before any action`,
    setup.filter(e => e.type === 'blind_small').length === 1 &&
    setup.filter(e => e.type === 'blind_big').length === 1 &&
    setup.filter(e => e.type === 'deal_hole').length === (start.players || []).length);

  // phase of every action row must be the street in effect BEFORE the row's
  // own consequences — i.e. the street established by prior deal_board rows
  let street = 'pre-flop';
  let phasesOk = true;
  for (const e of evs) {
    if (e.type === 'action' && e.phase !== street) {
      phasesOk = false;
      check(`${label}: action seq ${e.seq} phase`, false, `expected ${street}, got ${e.phase}`);
    }
    if (e.type === 'deal_board') street = e.data.street;
  }
  if (phasesOk) check(`${label}: every action tagged with the street it happened on`, true);

  // chips: running data.pot is the exact cumulative sum of amounts
  let pot = 0, potOk = true;
  for (const e of evs) {
    if (['blind_small', 'blind_big', 'action'].includes(e.type)) {
      pot += e.amount;
      if (e.data.pot !== pot) {
        potOk = false;
        check(`${label}: running pot at seq ${e.seq}`, false, `expected ${pot}, got ${e.data.pot}`);
      }
    }
  }
  if (potOk) check(`${label}: data.pot tracks the exact running pot`, true);

  const winnersSum = (end.winners || []).reduce((s, w) => s + w.amount, 0);
  check(`${label}: sum(amount) == hand_end pot == winners total == hands.pot`,
    pot === end.pot && winnersSum === end.pot && h.pot === end.pot,
    `committed=${pot} end.pot=${end.pot} winners=${winnersSum} hands.pot=${h.pot}`);

  // board rows: per-street, correct sizes, allCards prefix-consistent
  const boards = evs.filter(e => e.type === 'deal_board');
  const sizes = { flop: 3, turn: 1, river: 1 };
  check(`${label}: deal_board rows well-formed`,
    boards.every((b, i) =>
      b.data.cards.length === sizes[b.data.street] &&
      b.data.allCards.length === ({ flop: 3, turn: 4, river: 5 })[b.data.street] &&
      b.data.allCards.join() === boards.slice(0, i).flatMap(x => x.data.cards).concat(b.data.cards).join()),
    boards.map(b => `${b.data.street}:${b.data.cards.join(' ')}`).join(' | '));

  const sd = evs.filter(e => e.type === 'showdown');
  if (end.endedBy === 'showdown') {
    check(`${label}: showdown reveal right before hand_end`,
      sd.length === 1 && evs[evs.length - 2].type === 'showdown' &&
      sd[0].data.hands.every(hd => hd.cards.length === 2));
  } else {
    check(`${label}: fold-end has no showdown row`, sd.length === 0);
  }

  // every call that faced chips committed something
  const badCalls = evs.filter(e =>
    e.type === 'action' && e.data.action === 'call' && e.amount === 0);
  check(`${label}: no zero-amount calls`, badCalls.length === 0,
    badCalls.map(e => `seq ${e.seq}`).join(','));
}

(async () => {
  console.log(`hand_events v2 tests vs ${URL}\n`);

  // ════ Human vs human: 3 scripted hands ════
  const A = await makePlayer('A');
  const B = await makePlayer('B');

  attachDriver(A, {
    1: fullStreetsPolicy(true, false),
    2: raiseWarPolicy(),
    3: allInPolicy(true),
    any: checkCallPolicy(),
  });
  attachDriver(B, {
    1: fullStreetsPolicy(false, true),
    2: raiseWarPolicy(),
    3: allInPolicy(false),
    any: checkCallPolicy(),
  });

  console.log('Playing scripted match (H1 full streets, H2 fold, H3 all-in runout)...');
  const matchId = await startMatch(A, B);

  // wait until hand 3 reaches showdown (or the match ends on the bust)
  const h3done = await waitFor(A.socket, 'game-state', 90000,
    (st) => st.handNumber >= 3 && st.phase === 'showdown');
  const over = h3done ? await Promise.race([
    waitFor(A.socket, 'match-over', 9000),
    waitFor(B.socket, 'match-over', 9000),
  ]) : null;
  check('scripted match played through hand 3', h3done !== null);

  // not busted → leave deliberately so the match closes
  if (!over) {
    A.socket.emit('enter-lobby', { playerId: A.playerId });
    await sleep(1000);
  }
  await sleep(7000); // let the last flush land (inter_hand_delay_ms = 5s)

  const hands = await fetchHands(matchId);
  check('3 hands flushed to Postgres', hands.length === 3, `got ${hands.length}`);

  const [h1, h2, h3] = hands;

  if (h1) {
    console.log('\nH1 — betting on every street:');
    checkHandInvariants(h1, 'H1');
    const acts = h1.events.filter(e => e.type === 'action');
    const street = (s) => acts.filter(a => a.phase === s);
    check('H1: pre-flop limp + check', street('pre-flop').length === 2);
    const bb = h1.events[0].data.bigBlind;
    const flop = street('flop'), turn = street('turn'), river = street('river');
    check('H1: flop bet + call for the same amount',
      flop.some(a => a.data.action === 'bet' && a.amount === bb * 2 && a.data.to === bb * 2) &&
      flop.some(a => a.data.action === 'call' && a.amount === bb * 2));
    check('H1: turn (4th street) bet + call logged on phase turn',
      turn.some(a => a.data.action === 'bet' && a.amount === bb * 3) &&
      turn.some(a => a.data.action === 'call' && a.amount === bb * 3));
    check('H1: river (5th street) checks logged on phase river',
      river.length === 2 && river.every(a => a.data.action === 'check' && a.amount === 0));
    check('H1: board dealt as flop/turn/river rows',
      h1.events.filter(e => e.type === 'deal_board').map(e => e.data.street).join() === 'flop,turn,river');
    check('H1: ended by showdown', h1.events[h1.events.length - 1].data.endedBy === 'showdown');
  }

  if (h2) {
    console.log('\nH2 — pre-flop raise war + fold:');
    checkHandInvariants(h2, 'H2');
    const acts = h2.events.filter(e => e.type === 'action');
    const bb = h2.events[0].data.bigBlind;
    check('H2: raise → 3-bet → fold', acts.map(a => a.data.action).join() === 'raise,raise,fold');
    // committed = raise-to minus the blind that player already posted
    const posted = (pid) => h2.events.find(e =>
      ['blind_small', 'blind_big'].includes(e.type) && e.player_id === pid)?.amount || 0;
    check('H2: raise committed = to − blind already posted',
      acts[0].data.to === bb * 3 && acts[0].amount === bb * 3 - posted(acts[0].player_id) &&
      acts[1].data.to === bb * 9 && acts[1].amount === bb * 9 - posted(acts[1].player_id),
      acts.slice(0, 2).map(a => `${a.data.action} to=${a.data.to} committed=${a.amount}`).join(' | '));
    check('H2: all action on pre-flop, no board, fold-end',
      acts.every(a => a.phase === 'pre-flop') &&
      h2.events.filter(e => e.type === 'deal_board').length === 0 &&
      h2.events[h2.events.length - 1].data.endedBy === 'fold');
    check('H2: fold committed 0', acts[2].amount === 0);
  }

  if (h3) {
    console.log('\nH3 — flop all-in + call, runout:');
    checkHandInvariants(h3, 'H3');
    const acts = h3.events.filter(e => e.type === 'action');
    const jam = acts.find(a => a.data.action === 'all-in');
    const callIdx = acts.findIndex(a => a.data.action === 'call' && a.phase === 'flop' && a.amount > 0);
    check('H3: all-in on flop with raise-to recorded', jam?.phase === 'flop' && jam?.data.to > 0);
    check('H3: the call of the all-in is phase flop with real chips', callIdx !== -1);
    const boards = h3.events.filter(e => e.type === 'deal_board').map(e => e.data.street);
    check('H3: runout split into separate turn + river rows', boards.join() === 'flop,turn,river');
    const jamSeq = h3.events.find(e => e.type === 'action' && e.data.action === 'all-in').seq;
    const turnSeq = h3.events.find(e => e.type === 'deal_board' && e.data.street === 'turn').seq;
    check('H3: turn/river dealt after the call, before showdown',
      turnSeq > jamSeq && h3.events[h3.events.length - 2].type === 'showdown');
    check('H3: ended by showdown', h3.events[h3.events.length - 1].data.endedBy === 'showdown');
  }

  // ════ Live hand-events stream (drives in-game animations) ════
  console.log('\nLive hand-events stream:');
  check('live rows broadcast to players', A.liveRows.length > 0, `got ${A.liveRows.length}`);
  check('live deal_hole rows are redacted (no hole-card leak)',
    A.liveRows.filter(r => r.type === 'deal_hole').length > 0 &&
    A.liveRows.every(r => r.type !== 'deal_hole' || !r.data?.cards));
  if (h1) {
    // A's live rows for hand 1 must mirror the DB rows exactly
    const starts = A.liveRows
      .map((r, i) => (r.type === 'hand_start' ? { i, n: r.data?.handNumber } : null))
      .filter(Boolean);
    const s1 = starts.find(x => x.n === 1);
    const s2 = starts.find(x => x.n === 2);
    const live1 = s1 ? A.liveRows.slice(s1.i, s2 ? s2.i : undefined) : [];
    const sig = (type, seq, pid, amount, phase) => `${seq}|${type}|${pid || ''}|${amount || 0}|${phase || ''}`;
    const liveSig = live1.map(r => sig(r.type, r.seq, r.type === 'deal_hole' ? '' : r.playerId, r.amount, r.phase));
    const dbSig = h1.events.map(e => sig(e.type, e.seq, e.type === 'deal_hole' ? '' : e.player_id, e.amount, e.phase));
    check('live stream for H1 mirrors the DB rows (same seq/type/player/amount/phase)',
      liveSig.join('\n') === dbSig.join('\n'),
      `live=${liveSig.length} db=${dbSig.length}`);
  }

  // ════ Stack continuity across hands ════
  console.log('\nStack continuity:');
  let contOk = hands.length === 3;
  for (let i = 1; i < hands.length && contOk; i++) {
    const prev = hands[i - 1], cur = hands[i];
    const committed = {}, won = {};
    for (const e of prev.events) {
      if (['blind_small', 'blind_big', 'action'].includes(e.type)) {
        committed[e.player_id] = (committed[e.player_id] || 0) + e.amount;
      }
      if (e.type === 'hand_end') for (const w of e.data.winners) won[w.playerId] = (won[w.playerId] || 0) + w.amount;
    }
    for (const p of cur.events[0].data.players) {
      const before = prev.events[0].data.players.find(x => x.id === p.id);
      const expected = before.chips - (committed[p.id] || 0) + (won[p.id] || 0);
      if (p.chips !== expected) {
        contOk = false;
        check(`stacks: ${p.name} hand ${cur.hand_number}`, false, `expected ${expected}, got ${p.chips}`);
      }
    }
  }
  check('hand_start stacks = previous stacks − committed + won, every hand', contOk);

  // ════ Bot match: generic invariants on brain-driven hands ════
  console.log('\nBot match (vs HAL 9000):');
  const preElo = await db.query("SELECT player_id, elo FROM player_stats WHERE player_id='bot_hal'");
  const C = await makePlayer('C');
  attachDriver(C, { any: checkCallPolicy() });
  const botFound = waitFor(C.socket, 'match-found');
  C.socket.emit('challenge-send', { toId: 'bot_hal' });
  const botMatch = await botFound;
  check('bot match started', botMatch !== null);

  if (botMatch) {
    // play until hand 3 starts (hands 1–2 fully flushed) or the match ends
    await Promise.race([
      waitFor(C.socket, 'game-state', 120000, (st) => st.handNumber >= 3),
      waitFor(C.socket, 'match-over', 120000),
    ]);
    C.socket.emit('enter-lobby', { playerId: C.playerId });
    await sleep(7000);

    const botHands = await fetchHands(botMatch.matchId);
    check('bot hands flushed', botHands.length >= 1, `got ${botHands.length}`);
    for (const h of botHands.slice(0, 2)) checkHandInvariants(h, `Bot H${h.hand_number}`);
  }

  // restore the bot's ELO — this suite shouldn't move prod ratings
  if (preElo.rows.length) {
    await db.query('UPDATE player_stats SET elo=$1 WHERE player_id=$2',
      [preElo.rows[0].elo, 'bot_hal']);
  }

  // ════ Cleanup ════ (KEEP_ROWS=1 leaves the test hands in the DB for inspection)
  if (process.env.KEEP_ROWS) {
    console.log(`\nKEEP_ROWS set — test hands left in DB (match ${matchId})`);
    console.log(`\n${pass} passed, ${fail} failed`);
    [A, B, C].forEach(p => p.socket.disconnect());
    await db.end();
    process.exit(fail ? 1 : 0);
  }
  console.log('\nCleaning up test rows...');
  await db.query(`DELETE FROM hand_events WHERE hand_id IN
    (SELECT h.id FROM hands h JOIN matches m ON m.id=h.match_id
     WHERE m.player1_id LIKE 'test_he_%' OR m.player2_id LIKE 'test_he_%')`);
  await db.query(`DELETE FROM hands WHERE match_id IN
    (SELECT id FROM matches WHERE player1_id LIKE 'test_he_%' OR player2_id LIKE 'test_he_%')`);
  await db.query(`DELETE FROM matches WHERE player1_id LIKE 'test_he_%' OR player2_id LIKE 'test_he_%'`);
  await db.query(`DELETE FROM player_stats WHERE player_id LIKE 'test_he_%'`);
  await db.query(`DELETE FROM players WHERE id LIKE 'test_he_%'`);

  console.log(`\n${pass} passed, ${fail} failed`);
  [A, B, C].forEach(p => p.socket.disconnect());
  await db.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
