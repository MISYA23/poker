const { randomUUID } = require('crypto');
const { Pool } = require('pg');
const { logEvent, getHandEvents, clearHandEvents, setSnapshot } = require('./redis');

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// matchUuid → integer matches.id (cached)
const matchIdCache = {};

// ── Hand event log ────────────────────────────────────────────────────────────
// Every hand is one flat, strictly-sequential stream of discrete events sharing
// a single per-hand seq counter (room.handEventSeq). Each row:
//   phase  = the street the event happened ON (captured before the action
//            mutates the game — a call that closes pre-flop is still pre-flop)
//   amount = chips that physically moved into the pot with this event
//
// Vocabulary:
//   hand_start   players w/ pre-blind stacks, dealer/blind seats, blind sizes
//   blind_small  amount = chips posted, data.pot = running pot
//   blind_big    "
//   deal_hole    one per player, data.cards
//   action       one per decision: data {action, to?, allIn?, pot}
//                action ∈ fold|check|call|bet|raise|all-in (engine label),
//                to = raise-to total, pot = running pot after this action
//   deal_board   one per street even on all-in runouts: data {street, cards, allCards}
//   showdown     hole-card reveal (omitted when the hand ends by fold)
//   hand_end     always the final row: data {endedBy, pot, winners}
//
// Rows are constructed synchronously before any await so a fast follow-up
// action can never interleave seq assignment.

async function ensurePlayers(players) {
  for (const p of players) {
    if (!p.id || !p.name) continue;
    await db.query(
      `INSERT INTO players (id, display_name, avatar_id, is_guest)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (id) DO UPDATE SET
         display_name=$2, avatar_id=$3, last_seen_at=NOW()`,
      [p.id, (p.name || 'Player').trim().slice(0, 20), p.avatarId || 'dk']
    );
  }
}

async function getOrCreateMatchRow(matchUuid, p1, p2, previousMatchUuid) {
  if (matchIdCache[matchUuid]) return matchIdCache[matchUuid];
  await ensurePlayers([p1, p2]);

  // Resolve previous match DB id if this is a rematch
  let prevDbId = null;
  if (previousMatchUuid) {
    const { rows } = await db.query('SELECT id FROM matches WHERE uuid=$1', [previousMatchUuid]);
    prevDbId = rows[0]?.id || null;
  }

  const { rows } = await db.query(
    `INSERT INTO matches (uuid, player1_id, player2_id, status, previous_match_id)
     VALUES ($1, $2, $3, 'active', $4)
     ON CONFLICT (uuid) DO UPDATE SET status='active'
     RETURNING id`,
    [matchUuid, p1.id, p2.id, prevDbId]
  );
  matchIdCache[matchUuid] = rows[0].id;
  return rows[0].id;
}

const fmtCards = (cards) => (cards || []).map(c => `${c.rank}${c.suit}`);
const nextSeq = (room) => (room.handEventSeq = (room.handEventSeq || 0) + 1);

// Board reveals + terminal events implied by the game's current state.
// prevCommunityCount = board size before the triggering mutation; an all-in
// runout that fills the board in one step still gets one deal_board per street.
// endPhase = street the triggering action happened on (used for fold-ends).
function progressRows(room, game, prevCommunityCount, endPhase) {
  const rows = [];
  const all = fmtCards(game.communityCards);

  for (const [street, start, end] of [['flop', 0, 3], ['turn', 3, 4], ['river', 4, 5]]) {
    if (prevCommunityCount < end && all.length >= end) {
      rows.push({
        type: 'deal_board', seq: nextSeq(room), ts: Date.now(), phase: street,
        data: { street, cards: all.slice(start, end), allCards: all.slice(0, end) },
      });
    }
  }

  if (game.phase === 'showdown' && game.winners?.length) {
    if (!game.handEndedByFold) {
      rows.push({
        type: 'showdown', seq: nextSeq(room), ts: Date.now(), phase: 'showdown',
        data: {
          hands: game.players
            .filter(p => !p.folded && p.holeCards?.length)
            .map(p => ({ playerId: p.id, name: p.name, cards: fmtCards(p.holeCards) })),
        },
      });
    }
    const pot = game.winners.reduce((s, w) => s + (w.amount || 0), 0);
    rows.push({
      type: 'hand_end', seq: nextSeq(room), ts: Date.now(),
      phase: game.handEndedByFold ? endPhase : 'showdown',
      data: {
        endedBy: game.handEndedByFold ? 'fold' : 'showdown',
        pot,
        winners: game.winners.map(w => ({
          playerId: w.playerId, name: w.playerName,
          amount: w.amount, handName: w.handName,
        })),
      },
    });
  }

  return rows;
}

// Called when a new hand starts. stacksBefore = [{id, chips}] captured before
// game.startHand() posted the blinds, so hand_start records true pre-blind
// stacks even if posting the blinds auto-ran the hand to showdown.
// Synchronous — returns { handUuid, rows } so the caller can both persist the
// rows and broadcast them live before the next game-state goes out.
function buildStartRows(room, game, stacksBefore = null) {
  const handUuid = randomUUID();
  room.handEventSeq = 0;
  const st = game.getStateFor(null);
  const stackOf = (p) => stacksBefore?.find(s => s.id === p.id)?.chips ?? (p.chips + p.totalBet);
  const rows = [];

  rows.push({
    type: 'hand_start', seq: nextSeq(room), ts: Date.now(), phase: 'pre-flop',
    data: {
      handUuid,
      handNumber: room.handCount || 1,
      players: game.players
        .filter(p => p.holeCards?.length)
        .map(p => ({ id: p.id, name: p.name, avatarId: p.avatarId, chips: stackOf(p) })),
      dealerId: st.dealerId,
      smallBlindId: st.smallBlindId,
      bigBlindId: st.bigBlindId,
      smallBlind: game.smallBlind,
      bigBlind: game.bigBlind,
    },
  });

  let pot = 0;
  for (const [pid, type] of [[st.smallBlindId, 'blind_small'], [st.bigBlindId, 'blind_big']]) {
    const p = game.players.find(pl => pl.id === pid);
    if (p && p.totalBet > 0) {
      pot += p.totalBet;
      rows.push({
        type, seq: nextSeq(room), ts: Date.now(),
        playerId: p.id, amount: p.totalBet, phase: 'pre-flop',
        data: { pot },
      });
    }
  }

  for (const p of game.players) {
    if (p.holeCards?.length) {
      rows.push({
        type: 'deal_hole', seq: nextSeq(room), ts: Date.now(),
        playerId: p.id, phase: 'pre-flop',
        data: { cards: fmtCards(p.holeCards) },
      });
    }
  }

  // Posting the blinds can settle all betting (blind all-in already covered) —
  // the engine then runs straight to showdown before anyone acts.
  rows.push(...progressRows(room, game, 0, 'pre-flop'));

  return { handUuid, rows };
}

// Persist a batch of rows to the Redis hand log + refresh the live snapshot.
async function writeHandRows(room, game, handUuid, rows) {
  if (!handUuid || !rows?.length) return;
  for (const row of rows) await logEvent(room.id, handUuid, row);
  await setSnapshot(room.id, buildSnapshot(room, game));
}

// Capture BEFORE game.handleAction() — the logger needs the pre-action street,
// pot, board size and the actor's chips already committed this hand.
function preActionState(game, playerId) {
  const p = game.players.find(pl => pl.id === playerId);
  return {
    playerId,
    phase: game.phase,
    pot: game.pot,
    communityCount: game.communityCards?.length || 0,
    totalBet: p?.totalBet || 0,
  };
}

// Called after every player-action (human, bot, or turn-timeout fold).
// Synchronous — returns the rows; the caller persists them via writeHandRows
// and broadcasts them live.
function buildActionRows(room, game, pre) {
  if (!room.currentHandUuid) return [];

  const player = game.players.find(p => p.id === pre.playerId);
  // game.lastAction holds the engine's truth: real call amounts, and the
  // bet/raise/all-in label it actually applied (not the client's raw input)
  const la = game.lastAction?.playerId === pre.playerId ? game.lastAction : null;
  const label = la?.action || 'fold';
  const committed = Math.max(0, (player?.totalBet || 0) - pre.totalBet);

  const data = { action: label, pot: pre.pot + committed };
  if (['bet', 'raise', 'all-in'].includes(label) && la?.amount != null) data.to = la.amount;
  if (player?.allIn && label !== 'all-in') data.allIn = true;

  const rows = [{
    type: 'action', seq: nextSeq(room), ts: Date.now(),
    playerId: pre.playerId, amount: committed, phase: pre.phase, data,
  }];
  rows.push(...progressRows(room, game, pre.communityCount, pre.phase));

  return rows;
}

const EVENT_TYPES = [
  'hand_start', 'blind_small', 'blind_big', 'deal_hole',
  'action', 'deal_board', 'showdown', 'hand_end',
];

// Called when hand ends — flush Redis log → Postgres.
// checkHandAchievement(winnerId, handName) is optional — passed from index.js.
async function flushHandToDb(room, game, checkHandAchievement = null) {
  const handUuid = room.currentHandUuid;
  if (!handUuid) return;

  // Everything below must be captured synchronously — the next hand can begin
  // (and reset winners/communityCards/pot) while the awaits are in flight
  const winner = game.winners?.[0];
  const summary = {
    handNumber: room.handCount || 1,
    // game.pot zeroes when the pot is awarded — the winners' total is the pot
    pot: game.winners?.reduce((s, w) => s + (w.amount || 0), 0) || 0,
    communityCards: JSON.stringify(fmtCards(game.communityCards)),
    winnerId: winner?.playerId || null,
    winningHand: winner?.handName || null,
  };

  try {
    const events = await getHandEvents(room.id, handUuid);

    const p1 = room.p1 ? { id: room.p1.playerId, name: room.p1.playerName, avatarId: room.p1.avatarId } : null;
    const p2 = room.p2 ? { id: room.p2.playerId, name: room.p2.playerName, avatarId: room.p2.avatarId } : null;
    if (!p1?.id || !p2?.id) { await clearHandEvents(room.id, handUuid); return; }

    const matchDbId = await getOrCreateMatchRow(room.id, p1, p2, room.previousMatchUuid);

    const { rows: [hand] } = await db.query(
      `INSERT INTO hands (match_id, hand_uuid, hand_number, ended_at, pot, community_cards, winner_id, winning_hand)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7) RETURNING id`,
      [
        matchDbId, handUuid, summary.handNumber,
        summary.pot,
        summary.communityCards,
        summary.winnerId,
        summary.winningHand,
      ]
    );

    for (const ev of events) {
      if (EVENT_TYPES.includes(ev.type)) {
        await db.query(
          `INSERT INTO hand_events (hand_id, sequence_num, event_type, player_id, amount, phase, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            hand.id, ev.seq || 0, ev.type,
            ev.playerId || null,
            ev.amount || 0,
            ev.phase || null,
            JSON.stringify(ev.data || {}),
          ]
        );
      }
    }

    await clearHandEvents(room.id, handUuid);
    console.log(`[hand] flushed ${events.length} events → DB (hand ${handUuid.slice(0, 8)})`);

    if (checkHandAchievement && summary.winnerId && summary.winningHand) {
      checkHandAchievement(summary.winnerId, summary.winningHand);
    }
  } catch (err) {
    console.error('[hand] flush failed:', err.message, err.stack?.split('\n')[1]);
  }
}

function buildSnapshot(room, game) {
  return {
    roomId: room.id,
    phase: game.phase,
    pot: game.pot,
    currentBet: game.currentBet,
    currentPlayerId: game.currentPlayerId,
    communityCards: game.communityCards,
    players: game.players.map(p => ({
      id: p.id, name: p.name, avatarId: p.avatarId,
      chips: p.chips, roundBet: p.roundBet,
      folded: p.folded, allIn: p.allIn, isActive: p.isActive,
      holeCards: p.holeCards,
    })),
    turnDeadline: room.turnDeadline,
    handUuid: room.currentHandUuid,
    ts: Date.now(),
  };
}

module.exports = { buildStartRows, buildActionRows, writeHandRows, preActionState, flushHandToDb, buildSnapshot };
