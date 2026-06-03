const { randomUUID } = require('crypto');
const { Pool } = require('pg');
const { logEvent, getHandEvents, clearHandEvents, setSnapshot } = require('./redis');

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// roomId → integer table ID in Postgres (cached after first lookup)
const tableIdCache = {};

async function getOrCreateDbTableId(roomUuid) {
  if (tableIdCache[roomUuid]) return tableIdCache[roomUuid];
  const { rows } = await db.query(
    'INSERT INTO tables (uuid, status) VALUES ($1, $2) ON CONFLICT (uuid) DO UPDATE SET status=$2 RETURNING id',
    [roomUuid, 'active']
  );
  tableIdCache[roomUuid] = rows[0].id;
  return rows[0].id;
}

// Called when a new hand starts. Returns a fresh handUuid.
async function startHand(room, game) {
  const handUuid = randomUUID();
  const seq = { n: 0 };
  const next = () => ++seq.n;

  // hand_start
  await logEvent(room.id, handUuid, {
    type: 'hand_start', seq: next(), ts: Date.now(), handUuid,
    players: game.players.map(p => ({ id: p.id, name: p.name, chips: p.chips })),
  });

  // private deals
  for (const p of game.players) {
    if (p.holeCards?.length) {
      await logEvent(room.id, handUuid, {
        type: 'deal', seq: next(), ts: Date.now(),
        playerId: p.id, playerName: p.name,
        cards: p.holeCards.map(c => `${c.rank}${c.suit}`),
      });
    }
  }

  // blinds (inferred from roundBet at start)
  for (const p of game.players) {
    if (p.roundBet > 0) {
      const blindType = p.isSmallBlind ? 'small' : 'big';
      await logEvent(room.id, handUuid, {
        type: 'blind', seq: next(), ts: Date.now(),
        playerId: p.id, playerName: p.name,
        blindType, amount: p.roundBet,
      });
    }
  }

  // snapshot
  await setSnapshot(room.id, buildSnapshot(room, game));

  return handUuid;
}

// Called after every player-action.
async function logAction(room, game, playerId, playerName, action, amount, prevCommunityCount) {
  const handUuid = room.currentHandUuid;
  if (!handUuid) return;

  const seq = room.handEventSeq = (room.handEventSeq || 0) + 1;

  await logEvent(room.id, handUuid, {
    type: 'action', seq, ts: Date.now(),
    playerId, playerName, action,
    amount: amount || 0,
    phase: game.phase,
  });

  // Community cards revealed since last action
  const newCards = game.communityCards.slice(prevCommunityCount);
  if (newCards.length > 0) {
    const commSeq = room.handEventSeq = (room.handEventSeq || 0) + 1;
    await logEvent(room.id, handUuid, {
      type: 'community', seq: commSeq, ts: Date.now(),
      cards: newCards.map(c => `${c.rank}${c.suit}`),
      phase: game.phase,
      allCards: game.communityCards.map(c => `${c.rank}${c.suit}`),
    });
  }

  // Showdown
  if (game.phase === 'showdown' && game.winners?.length) {
    const sdSeq = room.handEventSeq = (room.handEventSeq || 0) + 1;
    await logEvent(room.id, handUuid, {
      type: 'showdown', seq: sdSeq, ts: Date.now(),
      hands: game.players.map(p => ({
        playerId: p.id, playerName: p.name,
        cards: p.holeCards?.map(c => `${c.rank}${c.suit}`) || [],
      })),
      winners: game.winners.map(w => ({
        playerId: w.playerId,
        amount: w.amount,
        handName: w.handName,
      })),
    });
  }

  await setSnapshot(room.id, buildSnapshot(room, game));
}

// Called when hand ends. Flushes Redis log → Postgres.
async function flushHandToDb(room, game) {
  const handUuid = room.currentHandUuid;
  if (!handUuid) return;

  try {
    const tableId = await getOrCreateDbTableId(room.id);
    const events = await getHandEvents(room.id, handUuid);

    const winner = game.winners?.[0];
    const { rows: [hand] } = await db.query(
      `INSERT INTO hands (table_id, room_uuid, hand_uuid, hand_number, ended_at, pot, community_cards, winner_name, winning_hand)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8) RETURNING id`,
      [
        tableId, room.id, handUuid,
        room.handCount || 1,
        game.pot || 0,
        JSON.stringify(game.communityCards?.map(c => `${c.rank}${c.suit}`) || []),
        winner ? (game.players.find(p => p.id === winner.playerId)?.name || '') : null,
        winner?.handName || null,
      ]
    );

    // Bulk insert all events as action rows
    for (const ev of events) {
      if (ev.type === 'action' || ev.type === 'blind') {
        await db.query(
          `INSERT INTO actions (hand_id, table_id, player_id, player_name, action_type, amount, phase, sequence_number, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            hand.id, tableId,
            ev.playerId || null,
            ev.playerName || null,
            ev.type === 'blind' ? `blind_${ev.blindType}` : ev.action,
            ev.amount || 0,
            ev.phase || null,
            ev.seq,
            JSON.stringify(ev),
          ]
        );
      }
    }

    await clearHandEvents(room.id, handUuid);
    console.log(`[hand] flushed ${events.length} events for hand ${handUuid} to DB`);
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
