const { randomUUID } = require('crypto');
const { Pool } = require('pg');
const { logEvent, getHandEvents, clearHandEvents, setSnapshot } = require('./redis');

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// matchUuid → integer matches.id (cached)
const matchIdCache = {};

async function getOrCreateMatchRow(matchUuid, p1Id, p2Id) {
  if (matchIdCache[matchUuid]) return matchIdCache[matchUuid];
  const { rows } = await db.query(
    `INSERT INTO matches (uuid, player1_id, player2_id, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (uuid) DO UPDATE SET status='active'
     RETURNING id`,
    [matchUuid, p1Id, p2Id]
  );
  matchIdCache[matchUuid] = rows[0].id;
  return rows[0].id;
}

// Called when a new hand starts. Returns a fresh handUuid.
async function startHand(room, game) {
  const handUuid = randomUUID();
  const seq = { n: 0 };
  const next = () => ++seq.n;

  await logEvent(room.id, handUuid, {
    type: 'hand_start', seq: next(), ts: Date.now(), handUuid,
    players: game.players.map(p => ({ id: p.id, name: p.name, chips: p.chips })),
  });

  for (const p of game.players) {
    if (p.holeCards?.length) {
      await logEvent(room.id, handUuid, {
        type: 'deal', seq: next(), ts: Date.now(),
        playerId: p.id,
        cards: p.holeCards.map(c => `${c.rank}${c.suit}`),
      });
    }
  }

  for (const p of game.players) {
    if (p.roundBet > 0) {
      await logEvent(room.id, handUuid, {
        type: p.isSmallBlind ? 'blind_small' : 'blind_big',
        seq: next(), ts: Date.now(),
        playerId: p.id, amount: p.roundBet,
      });
    }
  }

  await setSnapshot(room.id, buildSnapshot(room, game));
  return handUuid;
}

// Called after every player-action.
async function logAction(room, game, playerId, action, amount, prevCommunityCount) {
  const handUuid = room.currentHandUuid;
  if (!handUuid) return;

  const seq = room.handEventSeq = (room.handEventSeq || 0) + 1;

  await logEvent(room.id, handUuid, {
    type: 'action', seq, ts: Date.now(),
    playerId, action,
    amount: amount || 0,
    phase: game.phase,
    data: { action, amount: amount || 0 },
  });

  // Community cards newly revealed
  const newCards = game.communityCards.slice(prevCommunityCount);
  if (newCards.length > 0) {
    const commSeq = room.handEventSeq = (room.handEventSeq || 0) + 1;
    await logEvent(room.id, handUuid, {
      type: 'community', seq: commSeq, ts: Date.now(),
      phase: game.phase,
      data: {
        cards: newCards.map(c => `${c.rank}${c.suit}`),
        allCards: game.communityCards.map(c => `${c.rank}${c.suit}`),
        phase: game.phase,
      },
    });
  }

  // Showdown
  if (game.phase === 'showdown' && game.winners?.length) {
    const sdSeq = room.handEventSeq = (room.handEventSeq || 0) + 1;
    await logEvent(room.id, handUuid, {
      type: 'showdown', seq: sdSeq, ts: Date.now(),
      data: {
        hands: game.players.map(p => ({
          playerId: p.id,
          cards: p.holeCards?.map(c => `${c.rank}${c.suit}`) || [],
        })),
        winners: game.winners.map(w => ({
          playerId: w.playerId,
          amount: w.amount,
          handName: w.handName,
        })),
      },
    });
  }

  await setSnapshot(room.id, buildSnapshot(room, game));
}

// Called when hand ends — flush Redis log → Postgres.
async function flushHandToDb(room, game) {
  const handUuid = room.currentHandUuid;
  if (!handUuid) return;

  try {
    const events = await getHandEvents(room.id, handUuid);

    // Determine player IDs from the hand
    const p1Id = room.p1?.playerId;
    const p2Id = room.p2?.playerId;
    if (!p1Id || !p2Id) { await clearHandEvents(room.id, handUuid); return; }

    const matchDbId = await getOrCreateMatchRow(room.id, p1Id, p2Id);
    const winner = game.winners?.[0];

    const { rows: [hand] } = await db.query(
      `INSERT INTO hands (match_id, hand_uuid, hand_number, ended_at, pot, community_cards, winner_id, winning_hand)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7) RETURNING id`,
      [
        matchDbId, handUuid, room.handCount || 1,
        game.pot || 0,
        JSON.stringify(game.communityCards?.map(c => `${c.rank}${c.suit}`) || []),
        winner?.playerId || null,
        winner?.handName || null,
      ]
    );

    // Bulk insert events — player_id only, no name
    for (const ev of events) {
      if (['action', 'blind_small', 'blind_big', 'deal', 'community', 'showdown', 'hand_start'].includes(ev.type)) {
        await db.query(
          `INSERT INTO hand_events (hand_id, sequence_num, event_type, player_id, amount, phase, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            hand.id, ev.seq || 0, ev.type,
            ev.playerId || null,
            ev.amount || 0,
            ev.phase || null,
            JSON.stringify(ev.data || ev),
          ]
        );
      }
    }

    await clearHandEvents(room.id, handUuid);
    console.log(`[hand] flushed ${events.length} events → DB (hand ${handUuid.slice(0, 8)})`);
  } catch (err) {
    console.error('[hand] flush failed:', err.message);
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

module.exports = { startHand, logAction, flushHandToDb, buildSnapshot };
