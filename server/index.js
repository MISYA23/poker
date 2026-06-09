require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const { Pool }   = require('pg');
const { randomUUID } = require('crypto');
const { PokerGame }  = require('./game/PokerGame');
const { redis }      = require('./redis');
const { startHand: logStartHand, logAction, flushHandToDb } = require('./handLogger');
const { enqueue, dequeue, tryPair, calcElo } = require('./matchmaker');

const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const VALID_AVATARS = ['cigar', 'alfie', 'jazz', 'dk', 'diddy'];

// Populated from game_config table on startup — never mutate directly
let cfg = {};

// Populated from ui_config table on startup — client fetches once per session
let uiCfg = {};

// matchId → { id, game, p1, p2, observers, rematchVotes, timers... }
const matches = new Map();

// socketId → { playerId, playerName, avatarId, matchId | null }
const socketPlayers = new Map();

// playerId → { timer, matchId } — players mid-match who lost connection
const pendingDisconnects = new Map();

// playerId → elo — in-memory cache updated after each match
const eloCache = {};

// `${fromId}:${toId}` → { timer } — pending direct challenges
const challenges = new Map();

// ── Match helpers ─────────────────────────────────────────────────────────────

function createMatch(p1, p2) {
  const id = randomUUID();
  const m = {
    id,
    game: new PokerGame(id, { startingChips: cfg.starting_chips, bigBlind: cfg.big_blind, smallBlind: cfg.small_blind }),
    p1, p2,                  // { playerId, playerName, avatarId, socketId }
    observers: new Set(),    // socketIds watching
    rematchVotes: new Set(),
    ended: false,
    autoStartTimer: null, nextHandTimer: null,
    turnTimer: null, timerPlayerId: null, turnDeadline: null,
    handCount: 0, handEventSeq: 0, currentHandUuid: null,
    maxPlayers: 2, name: `match:${id.slice(0, 8)}`, emoji: '♠',
  };
  matches.set(id, m);
  return m;
}

function matchPlayers(m) {
  return [m.p1, m.p2].filter(Boolean);
}


function resetRoom(m) {
  clearTimeout(m.autoStartTimer);
  clearTimeout(m.nextHandTimer);
  clearTimeout(m.turnTimer);
  m.autoStartTimer = m.nextHandTimer = m.turnTimer = null;
  m.timerPlayerId = null;
  m.turnDeadline = null;
  m.rematchVotes = new Set();
  m.game = new PokerGame(m.id, { startingChips: cfg.starting_chips, bigBlind: cfg.big_blind, smallBlind: cfg.small_blind });
}

// ── Turn timer ────────────────────────────────────────────────────────────────

function startTurnTimer(m) {
  const pid = m.game.currentPlayerId;
  if (pid === m.timerPlayerId) return;
  if (m.turnTimer) { clearTimeout(m.turnTimer); m.turnTimer = null; }
  m.timerPlayerId = pid;
  m.turnDeadline  = null;
  if (!pid || m.game.phase === 'waiting' || m.game.phase === 'showdown') return;
  m.turnDeadline = Date.now() + cfg.turn_seconds * 1000;
  m.turnTimer = setTimeout(() => {
    m.turnTimer = null;
    if (m.game.currentPlayerId !== pid) return;
    m.timerPlayerId = null;
    m.turnDeadline  = null;
    try {
      m.game.handleAction(pid, 'fold');
      broadcastMatchState(m);
      if (m.game.phase === 'showdown') scheduleNextHand(m, cfg.inter_hand_delay_ms);
    } catch (e) {}
  }, cfg.turn_seconds * 1000);
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

function broadcastMatchState(m) {
  startTurnTimer(m);
  for (const p of matchPlayers(m)) {
    const sp = socketPlayers.get(p.socketId);
    if (!sp) continue;
    const atTable = m.game.players.some(pl => pl.id === p.playerId);
    const state   = atTable ? m.game.getStateFor(p.playerId) : m.game.getStateFor(null);
    io.to(p.socketId).emit('game-state', {
      ...state, atTable,
      matchId: m.id,
      gameOver: m.game.gameOver || false,
      turnDeadline: m.turnDeadline,
    });
  }
  // Observers see face-down cards
  for (const sid of m.observers) {
    io.to(sid).emit('game-state', {
      ...m.game.getStateFor(null),
      atTable: false, observing: true,
      matchId: m.id, turnDeadline: m.turnDeadline,
    });
  }
}

function broadcastMatchList() {
  const list = [...matches.values()].filter(m => !m.ended).map(m => ({
    id:         m.id,
    player1:    m.p1?.playerName || '?',
    player2:    m.p2?.playerName || '?',
    player1Id:  m.p1?.playerId,
    player2Id:  m.p2?.playerId,
    player1Elo: eloCache[m.p1?.playerId] || 1200,
    player2Elo: eloCache[m.p2?.playerId] || 1200,
    phase:      m.game.phase,
    handCount:  m.handCount || 0,
  }));

  // Deduplicated list of all connected players
  const seen = new Set();
  const online = [];
  for (const sp of socketPlayers.values()) {
    if (sp.playerName && !seen.has(sp.playerId)) {
      seen.add(sp.playerId);
      online.push({ id: sp.playerId, name: sp.playerName, avatarId: sp.avatarId });
    }
  }

  for (const [sid, sp] of socketPlayers.entries()) {
    if (sp.matchId === null) io.to(sid).emit('match-list', { matches: list, onlinePlayers: online });
  }
}

// ── Hand lifecycle ────────────────────────────────────────────────────────────

async function beginHand(m) {
  m.handCount = (m.handCount || 0) + 1;
  m.handEventSeq = 0;
  m.game.startHand();
  m.currentHandUuid = await logStartHand(m, m.game).catch(e => { console.error('[hand] startHand failed:', e.message); return null; });
  console.log('[hand] started uuid:', m.currentHandUuid?.slice(0, 8));
}

function tryAutoStart(m) {
  if (m.autoStartTimer) return;
  const ready = m.game.players.filter(p => p.isActive && p.chips > 0);
  if (ready.length >= 2 && m.game.phase === 'waiting' && !m.game.gameOver) {
    m.autoStartTimer = setTimeout(async () => {
      m.autoStartTimer = null;
      if (m.game.phase === 'waiting' && m.game.canStart()) {
        await beginHand(m);
        broadcastMatchState(m);
      }
    }, cfg.auto_start_delay_ms);
  }
}

function scheduleNextHand(m, delay = 5000) {
  if (m.nextHandTimer) clearTimeout(m.nextHandTimer);
  m.nextHandTimer = setTimeout(async () => {
    m.nextHandTimer = null;
    // flushHandToDb captures currentHandUuid synchronously before its first await — safe to clear immediately after
    flushHandToDb(m, m.game).catch(e => console.error('[hand] flush:', e.message));
    m.currentHandUuid = null;
    m.handEventSeq    = 0;

    const withChips = m.game.players.filter(p => p.isActive && p.chips > 0);
    const active    = m.game.players.filter(p => p.isActive);

    if (active.length >= 2 && withChips.length === 1) {
      // One player is bust — match over
      const winnerId = withChips[0].id;
      m.game.phase   = 'waiting';
      m.game.gameOver = true;
      broadcastMatchState(m);
      await endMatch(m, winnerId);
      return;
    }
    if (withChips.length >= 2 && m.game.canStart()) {
      try { await beginHand(m); } catch { m.game.phase = 'waiting'; }
    } else {
      m.game.phase = 'waiting';
    }
    broadcastMatchState(m);
  }, delay);
}

// ── Match end + ELO ───────────────────────────────────────────────────────────

async function endMatch(m, winnerId) {
  if (m.ended) return;
  m.ended = true;

  const loser  = matchPlayers(m).find(p => p.playerId !== winnerId);
  const winner = matchPlayers(m).find(p => p.playerId === winnerId);
  if (!winner || !loser) return;

  // Use cached ELO — only hit DB on cache miss (first match after server restart)
  const [wElo, lElo] = await Promise.all([
    eloCache[winner.playerId] != null
      ? Promise.resolve(eloCache[winner.playerId])
      : db.query('SELECT elo FROM player_stats WHERE player_id=$1', [winner.playerId])
          .then(r => r.rows[0]?.elo ?? 1200).catch(() => 1200),
    eloCache[loser.playerId] != null
      ? Promise.resolve(eloCache[loser.playerId])
      : db.query('SELECT elo FROM player_stats WHERE player_id=$1', [loser.playerId])
          .then(r => r.rows[0]?.elo ?? 1200).catch(() => 1200),
  ]);

  const { winnerGain, loserLoss } = calcElo(wElo, lElo);
  const wNewElo = wElo + winnerGain;
  const lNewElo = lElo - loserLoss;

  eloCache[winner.playerId] = wNewElo;
  eloCache[loser.playerId]  = lNewElo;

  // Notify players immediately — no waiting for DB
  for (const p of matchPlayers(m)) {
    const isWin = p.playerId === winnerId;
    io.to(p.socketId).emit('match-over', {
      winnerId, winnerName: winner.playerName,
      eloChange: isWin ? +winnerGain : -loserLoss,
      newElo:    isWin ? wNewElo : lNewElo,
    });
  }
  console.log(`[match] ended — winner: ${winner.playerName}, elo: ${wElo}→${wNewElo}`);
  broadcastMatchList();

  // Persist to DB in the background — does not block player-facing events
  persistMatchResult(m, winner, loser, wElo, lElo, wNewElo, lNewElo, winnerId)
    .catch(e => console.error('[match] persist failed:', e.message));
}

async function persistMatchResult(m, winner, loser, wEloBefore, lEloBefore, wEloAfter, lEloAfter, winnerId) {
  await Promise.all([winner, loser].map(p => db.query(
    `INSERT INTO players (id, display_name, avatar_id, is_guest)
     VALUES ($1, $2, 'cigar', true)
     ON CONFLICT (id) DO UPDATE SET display_name=$2, last_seen_at=NOW()`,
    [p.playerId, (p.playerName || 'Player').trim().slice(0, 20)]
  )));

  await Promise.all([
    db.query(
      `INSERT INTO player_stats (player_id, elo, matches_played, matches_won)
       VALUES ($1, $2, 1, 1)
       ON CONFLICT (player_id) DO UPDATE SET
         elo=$2, matches_played=player_stats.matches_played+1,
         matches_won=player_stats.matches_won+1, updated_at=NOW()`,
      [winner.playerId, wEloAfter]
    ),
    db.query(
      `INSERT INTO player_stats (player_id, elo, matches_played, matches_won)
       VALUES ($1, $2, 1, 0)
       ON CONFLICT (player_id) DO UPDATE SET
         elo=$2, matches_played=player_stats.matches_played+1, updated_at=NOW()`,
      [loser.playerId, lEloAfter]
    ),
    db.query(
      `INSERT INTO matches (uuid, player1_id, player2_id, status, ended_at, winner_id,
        player1_elo_before, player2_elo_before, player1_elo_after, player2_elo_after)
       VALUES ($1,$2,$3,'complete',NOW(),$4,$5,$6,$7,$8)
       ON CONFLICT (uuid) DO UPDATE SET
         status='complete', ended_at=NOW(), winner_id=$4,
         player1_elo_before=$5, player2_elo_before=$6,
         player1_elo_after=$7, player2_elo_after=$8`,
      [m.id, winner.playerId, loser.playerId, winnerId, wEloBefore, lEloBefore, wEloAfter, lEloAfter]
    ),
  ]);
}

// ── Socket handlers ───────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('[server] connected:', socket.id);

  socket.on('enter-lobby', async ({ playerId } = {}) => {
    if (playerId) {
      // Load display_name and avatar_id from DB — client never sends these
      let playerName = 'Player', avatarId = 'cigar';
      try {
        const { rows } = await db.query('SELECT display_name, avatar_id FROM players WHERE id=$1', [playerId]);
        if (rows.length) { playerName = rows[0].display_name; avatarId = rows[0].avatar_id; }
      } catch (e) { console.error('[enter-lobby] db lookup failed:', e.message); }

      const existing = socketPlayers.get(socket.id);
      socketPlayers.set(socket.id, {
        matchId: existing?.matchId ?? null,
        ...existing,
        playerId,
        playerName,
        avatarId,
        socketId: socket.id,
      });

      // Rejoin an active match if this player was in a disconnect grace period
      const pending = pendingDisconnects.get(playerId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingDisconnects.delete(playerId);
        const m = matches.get(pending.matchId);
        if (m && !m.ended) {
          const sp = socketPlayers.get(socket.id);
          sp.matchId = m.id;
          const pRef = m.p1?.playerId === playerId ? m.p1 : m.p2;
          pRef.socketId = socket.id;
          const other = matchPlayers(m).find(p => p.playerId !== playerId);
          if (other) io.to(other.socketId).emit('opponent-reconnected');
          io.to(socket.id).emit('match-found', { matchId: m.id, opponent: { name: other?.playerName || '' } });
          broadcastMatchState(m);
          console.log(`[server] ${playerName} reconnected to match ${m.id.slice(0, 8)}`);
          return;
        }
      }
    }
    broadcastMatchList();
  });

  socket.on('find-match', ({ playerId }) => {
    if (!playerId) { socket.emit('error', { message: 'Missing player ID.' }); return; }

    const sp = socketPlayers.get(socket.id);
    if (!sp?.playerName) { socket.emit('error', { message: 'Not in lobby.' }); return; }

    enqueue({ playerId: sp.playerId, playerName: sp.playerName, avatarId: sp.avatarId, socketId: socket.id });

    const pair = tryPair();
    if (pair) {
      const m = createMatch(pair.p1, pair.p2);

      const sp1 = socketPlayers.get(pair.p1.socketId);
      const sp2 = socketPlayers.get(pair.p2.socketId);
      if (sp1) sp1.matchId = m.id;
      if (sp2) sp2.matchId = m.id;

      m.game.addPlayer(pair.p1.playerId, pair.p1.playerName, pair.p1.avatarId);
      m.game.addPlayer(pair.p2.playerId, pair.p2.playerName, pair.p2.avatarId);

      io.to(pair.p1.socketId).emit('match-found', { matchId: m.id, opponent: { name: pair.p2.playerName } });
      io.to(pair.p2.socketId).emit('match-found', { matchId: m.id, opponent: { name: pair.p1.playerName } });

      broadcastMatchState(m);
      broadcastMatchList();
      tryAutoStart(m);
    } else {
      socket.emit('in-queue', {});
    }
  });

  socket.on('cancel-match', () => {
    const sp = socketPlayers.get(socket.id);
    if (sp) { dequeue(sp.playerId); sp.matchId = null; }
    socket.emit('queue-cancelled', {});
  });

  socket.on('observe', ({ matchId }) => {
    const m = matches.get(matchId);
    if (!m) return;
    m.observers.add(socket.id);
    // Send current state immediately
    io.to(socket.id).emit('game-state', {
      ...m.game.getStateFor(null),
      atTable: false, observing: true,
      matchId: m.id, turnDeadline: m.turnDeadline,
    });
  });

  socket.on('unobserve', ({ matchId }) => {
    const m = matches.get(matchId);
    if (m) m.observers.delete(socket.id);
  });

  socket.on('player-action', ({ action, amount }) => {
    const sp = socketPlayers.get(socket.id);
    if (!sp?.matchId) return;
    const m = matches.get(sp.matchId);
    if (!m) return;
    try {
      const prevCC = m.game.communityCards?.length || 0;
      m.game.handleAction(sp.playerId, action, amount);
      logAction(m, m.game, sp.playerId, sp.playerName, action, amount, prevCC)
        .catch(e => console.error('[hand] logAction:', e.message));
      broadcastMatchState(m);
      if (m.game.phase === 'showdown') scheduleNextHand(m, cfg.inter_hand_delay_ms);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('rematch-vote', ({ vote }) => {
    const sp = socketPlayers.get(socket.id);
    if (!sp?.matchId) return;
    const m = matches.get(sp.matchId);
    if (!m || !m.game.gameOver) return;

    if (vote) {
      m.rematchVotes.add(sp.playerId);
      // Notify the other player that this player wants a rematch
      const other = matchPlayers(m).find(p => p.playerId !== sp.playerId);
      if (other) {
        io.to(other.socketId).emit('rematch-pending', { from: sp.playerName });
      }

      if (m.rematchVotes.size >= 2) {
        // Both agreed — create a NEW match (not a reset of the same one)
        const { randomUUID } = require('crypto');
        const newMatchId = randomUUID();
        const newMatch = createMatch(m.p1, m.p2);
        // Override the UUID to our new one and tag the previous match
        matches.delete(newMatch.id);
        newMatch.id = newMatchId;
        newMatch.previousMatchUuid = m.id; // link back for DB
        matches.set(newMatchId, newMatch);

        // Update socketPlayers to point to the new match
        for (const p of matchPlayers(m)) {
          const psp = socketPlayers.get(p.socketId);
          if (psp) psp.matchId = newMatchId;
        }

        // Close out the old match
        m.ended = true;
        matches.delete(m.id);

        // Start the new match
        newMatch.game.addPlayer(m.p1.playerId, m.p1.playerName, m.p1.avatarId);
        newMatch.game.addPlayer(m.p2.playerId, m.p2.playerName, m.p2.avatarId);
        broadcastMatchState(newMatch);
        tryAutoStart(newMatch);
      }
    } else {
      // Player declined — both go back to lobby
      for (const p of matchPlayers(m)) {
        const psp = socketPlayers.get(p.socketId);
        if (psp) psp.matchId = null;
        io.to(p.socketId).emit('reset');
      }
      matches.delete(m.id);
      broadcastMatchList();
    }
  });

  socket.on('leave-table', () => {
    const sp = socketPlayers.get(socket.id);
    if (!sp?.matchId) return;
    const m = matches.get(sp.matchId);
    if (m && !m.ended) {
      const otherId = matchPlayers(m).find(p => p.playerId !== sp.playerId)?.playerId;
      if (otherId) endMatch(m, otherId);
    }
    sp.matchId = null;
    socket.emit('reset');
    broadcastMatchList();
  });

  socket.on('disconnect', () => {
    const sp = socketPlayers.get(socket.id);
    // Always clean socket out of any match observer sets
    for (const m of matches.values()) m.observers.delete(socket.id);
    if (!sp) return;
    socketPlayers.delete(socket.id);
    dequeue(sp.playerId);
    console.log('[server] disconnected:', sp.playerName || socket.id);

    if (sp.matchId) {
      const m = matches.get(sp.matchId);
      if (m && !m.ended) {
        const other = matchPlayers(m).find(p => p.playerId !== sp.playerId);
        if (other) {
          // Give the disconnected player 30s to reconnect before forfeiting
          const deadline = Date.now() + 30000;
          io.to(other.socketId).emit('opponent-disconnected', { deadline });
          const timer = setTimeout(() => {
            pendingDisconnects.delete(sp.playerId);
            const m2 = matches.get(sp.matchId);
            if (m2 && !m2.ended) endMatch(m2, other.playerId);
          }, 30000);
          pendingDisconnects.set(sp.playerId, { timer, matchId: sp.matchId });
          console.log(`[server] ${sp.playerName} mid-match disconnect — 30s grace period`);
        }
      }
    } else {
      broadcastMatchList();
    }
  });

  // Explicit logout — remove from socketPlayers so they disappear from online list
  socket.on('logout', () => {
    const sp = socketPlayers.get(socket.id);
    if (sp) dequeue(sp.playerId);
    socketPlayers.delete(socket.id);
    broadcastMatchList();
  });

  // ── Challenge flow ───────────────────────────────────────────────────────────

  socket.on('challenge-send', ({ toId }) => {
    const sp = socketPlayers.get(socket.id);
    if (!sp) return;
    if (sp.matchId) { socket.emit('error', { message: 'Finish your current match first.' }); return; }

    // Find target socket
    const toSocket = [...socketPlayers.entries()].find(([, s]) => s.playerId === toId);
    if (!toSocket) { socket.emit('error', { message: 'Player is not online.' }); return; }
    const [toSocketId, toSp] = toSocket;
    if (toSp.matchId) { socket.emit('error', { message: 'That player is in a match.' }); return; }

    const key = `${sp.playerId}:${toId}`;
    // Clear any existing challenge
    if (challenges.has(key)) { clearTimeout(challenges.get(key).timer); challenges.delete(key); }

    const timer = setTimeout(() => {
      challenges.delete(key);
      socket.emit('challenge-expired', { toId });
    }, 30000);
    challenges.set(key, { timer, fromSocketId: socket.id, toSocketId });

    io.to(toSocketId).emit('challenge-received', {
      fromId: sp.playerId, fromName: sp.playerName, fromAvatarId: sp.avatarId,
    });
    socket.emit('challenge-sent', { toId, toName: toSp.playerName });
  });

  socket.on('challenge-accept', ({ fromId }) => {
    const sp = socketPlayers.get(socket.id);
    if (!sp) return;
    const key = `${fromId}:${sp.playerId}`;
    const ch  = challenges.get(key);
    if (!ch) { socket.emit('error', { message: 'Challenge expired.' }); return; }

    clearTimeout(ch.timer);
    challenges.delete(key);

    const fromSp = socketPlayers.get(ch.fromSocketId);
    if (!fromSp) { socket.emit('error', { message: 'Challenger disconnected.' }); return; }

    // Create direct match
    const p1 = { playerId: fromSp.playerId, playerName: fromSp.playerName, avatarId: fromSp.avatarId, socketId: ch.fromSocketId };
    const p2 = { playerId: sp.playerId, playerName: sp.playerName, avatarId: sp.avatarId, socketId: socket.id };
    const m  = createMatch(p1, p2);
    fromSp.matchId = m.id;
    sp.matchId     = m.id;
    m.game.addPlayer(p1.playerId, p1.playerName, p1.avatarId);
    m.game.addPlayer(p2.playerId, p2.playerName, p2.avatarId);

    io.to(ch.fromSocketId).emit('match-found', { matchId: m.id, opponent: { name: sp.playerName } });
    io.to(socket.id).emit('match-found', { matchId: m.id, opponent: { name: fromSp.playerName } });
    broadcastMatchState(m);
    tryAutoStart(m);
  });

  socket.on('challenge-decline', ({ fromId }) => {
    const sp  = socketPlayers.get(socket.id);
    const key = `${fromId}:${sp?.playerId}`;
    const ch  = challenges.get(key);
    if (ch) { clearTimeout(ch.timer); challenges.delete(key); }
    if (ch) io.to(ch.fromSocketId).emit('challenge-declined', { byName: sp?.playerName });
  });
});

// ── HTTP routes ───────────────────────────────────────────────────────────────

app.put('/api/player/:playerId/profile', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { displayName, avatarId } = req.body;
    if (!displayName || typeof displayName !== 'string') return res.status(400).json({ error: 'displayName required' });
    const safeName   = displayName.trim().slice(0, 20);
    const safeAvatar = VALID_AVATARS.includes(avatarId) ? avatarId : null;
    if (!safeName) return res.status(400).json({ error: 'displayName cannot be empty' });
    const sets  = ['display_name=$2'];
    const vals  = [playerId, safeName];
    if (safeAvatar) { sets.push(`avatar_id=$${vals.length + 1}`); vals.push(safeAvatar); }
    await db.query(`UPDATE players SET ${sets.join(', ')} WHERE id=$1`, vals);

    // Refresh any connected socket's cached profile
    for (const sp of socketPlayers.values()) {
      if (sp.playerId === playerId) {
        sp.playerName = safeName;
        if (safeAvatar) sp.avatarId = safeAvatar;
      }
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/player/:playerId/profile', async (req, res) => {
  try {
    const { playerId } = req.params;

    const [statsRes, playerRes, histRes] = await Promise.all([
      db.query('SELECT elo, matches_played, matches_won FROM player_stats WHERE player_id=$1', [playerId]),
      db.query('SELECT avatar_id, display_name FROM players WHERE id=$1', [playerId]),
      db.query(
        `SELECT m.uuid, m.started_at,
          CASE WHEN m.player1_id=$1 THEN m.player2_id ELSE m.player1_id END AS opponent_id,
          CASE WHEN m.player1_id=$1 THEN m.player1_elo_after  ELSE m.player2_elo_after  END AS my_elo_after,
          CASE WHEN m.player1_id=$1 THEN m.player1_elo_before ELSE m.player2_elo_before END AS my_elo_before,
          m.winner_id
         FROM matches m
         WHERE (m.player1_id=$1 OR m.player2_id=$1) AND m.status='complete'
         ORDER BY m.started_at DESC LIMIT 20`,
        [playerId]
      ),
    ]);

    // Resolve opponent names from players table (canonical)
    const oppIds = [...new Set(histRes.rows.map(r => r.opponent_id).filter(Boolean))];
    const names = {};
    if (oppIds.length) {
      const { rows } = await db.query('SELECT id, display_name FROM players WHERE id = ANY($1)', [oppIds]);
      rows.forEach(p => { names[p.id] = p.display_name; });
    }

    res.json({
      avatarId:    playerRes.rows[0]?.avatar_id || 'cigar',
      displayName: playerRes.rows[0]?.display_name,
      stats: statsRes.rows[0] || { elo: 1200, matches_played: 0, matches_won: 0 },
      history: histRes.rows.map(r => ({
        matchId:      r.uuid,
        date:         r.started_at,
        opponentId:   r.opponent_id,
        opponentName: names[r.opponent_id] || 'Unknown',
        won:          r.winner_id === playerId,
        eloChange:    (r.my_elo_after || 0) - (r.my_elo_before || 0),
        myEloAfter:   r.my_elo_after,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Full hand-by-hand replay for a match
app.get('/api/match/:matchUuid/replay', async (req, res) => {
  try {
    const { matchUuid } = req.params;
    const { rows: matchRows } = await db.query('SELECT id FROM matches WHERE uuid=$1', [matchUuid]);
    if (!matchRows.length) return res.json([]);
    const matchDbId = matchRows[0].id;

    const { rows: hands } = await db.query(
      `SELECT id, hand_number, hand_uuid, community_cards, winner_id, winning_hand
       FROM hands WHERE match_id=$1 ORDER BY hand_number`,
      [matchDbId]
    );

    // Collect all player IDs across all events for name lookup
    const result = await Promise.all(hands.map(async h => {
      const { rows: events } = await db.query(
        `SELECT sequence_num, event_type, player_id, amount, phase, data
         FROM hand_events WHERE hand_id=$1 ORDER BY sequence_num`,
        [h.id]
      );

      // Resolve player names from players table
      const playerIds = [...new Set(events.map(e => e.player_id).filter(Boolean))];
      const names = {};
      if (playerIds.length) {
        const { rows: pRows } = await db.query(
          `SELECT id, display_name FROM players WHERE id = ANY($1)`, [playerIds]
        );
        pRows.forEach(p => { names[p.id] = p.display_name; });
      }

      return {
        handNumber:     h.hand_number,
        handUuid:       h.hand_uuid,
        communityCards: h.community_cards || [],
        winnerId:       h.winner_id,
        winnerName:     names[h.winner_id] || null,
        winningHand:    h.winning_hand,
        events: events.map(e => ({
          seq:        e.sequence_num,
          type:       e.event_type,
          playerId:   e.player_id,
          playerName: names[e.player_id] || null,
          amount:     e.amount,
          phase:      e.phase,
          data:       e.data || {},
        })),
      };
    }));

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/auth/google/exchange', async (req, res) => {
  const { code, redirectUri, codeVerifier } = req.body;
  const params = new URLSearchParams({
    code,
    client_id: '1056319941649-g1feki5rvo6bm7jltur6eo4oanrn1tvo.apps.googleusercontent.com',
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  if (codeVerifier) params.set('code_verifier', codeVerifier);
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json(data);
  res.json({ access_token: data.access_token });
});

app.get('/health', (_, res) => res.json({
  ok: true,
  matches: matches.size,
  activeMatches: [...matches.values()].filter(m => !m.ended).map(m => ({
    id: m.id, p1: m.p1?.playerName, p2: m.p2?.playerName, phase: m.game.phase,
  })),
}));

app.get('/api/matches', (_, res) => {
  res.json([...matches.values()].filter(m => !m.ended).map(m => ({
    id: m.id, player1: m.p1?.playerName, player2: m.p2?.playerName,
    phase: m.game.phase, handCount: m.handCount,
  })));
});

// Kept for TableSelectScreen backward compat — returns empty
app.get('/api/rooms', (_, res) => res.json([]));

// Leaderboard — all players ranked by ELO
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.display_name, p.avatar_id, p.is_guest,
              COALESCE(ps.elo, 1200) AS elo,
              COALESCE(ps.matches_played, 0) AS matches_played,
              COALESCE(ps.matches_won, 0) AS matches_won
       FROM players p
       LEFT JOIN player_stats ps ON ps.player_id = p.id
       ORDER BY elo DESC, matches_played DESC
       LIMIT 100`
    );
    res.json(rows.map((r, i) => ({
      rank:          i + 1,
      playerId:      r.id,
      displayName:   r.display_name,
      avatarId:      r.avatar_id,
      isGuest:       r.is_guest,
      elo:           r.elo,
      wins:          r.matches_won,
      losses:        r.matches_played - r.matches_won,
      matchesPlayed: r.matches_played,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Friends API ───────────────────────────────────────────────────────────────

// Search players by username
app.get('/api/players/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const { rows } = await db.query(
      `SELECT id, display_name, avatar_id FROM players
       WHERE display_name ILIKE $1 LIMIT 20`,
      [`%${q}%`]
    );
    res.json(rows.map(r => ({ id: r.id, displayName: r.display_name, avatarId: r.avatar_id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get friends + pending requests for a player
app.get('/api/friends/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { rows } = await db.query(
      `SELECT f.id, f.status, f.requester_id, f.addressee_id,
              p.display_name, p.avatar_id,
              COALESCE(ps.elo, 1200) AS elo
       FROM friendships f
       JOIN players p ON p.id = CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END
       LEFT JOIN player_stats ps ON ps.player_id = p.id
       WHERE (f.requester_id=$1 OR f.addressee_id=$1) AND f.status != 'declined'
       ORDER BY f.status, p.display_name`,
      [playerId]
    );
    // Annotate online status
    const onlineIds = new Set([...socketPlayers.values()].map(s => s.playerId));
    res.json(rows.map(r => {
      const friendId = r.requester_id === playerId ? r.addressee_id : r.requester_id;
      return {
        friendshipId: r.id,
        friendId,
        displayName:  r.display_name,
        avatarId:     r.avatar_id,
        elo:          r.elo,
        status:       r.status,
        isRequester:  r.requester_id === playerId,
        online:       onlineIds.has(friendId),
      };
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Send friend request
app.post('/api/friends/request', async (req, res) => {
  try {
    const { requesterId, addresseeId } = req.body;
    if (requesterId === addresseeId) return res.status(400).json({ error: 'Cannot friend yourself.' });
    await db.query(
      `INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)
       ON CONFLICT (requester_id, addressee_id) DO NOTHING`,
      [requesterId, addresseeId]
    );
    // Notify addressee if online
    const target = [...socketPlayers.entries()].find(([, s]) => s.playerId === addresseeId);
    if (target) {
      const requester = [...socketPlayers.values()].find(s => s.playerId === requesterId);
      io.to(target[0]).emit('friend-request', {
        fromId: requesterId, fromName: requester?.playerName || 'Someone', fromAvatarId: requester?.avatarId,
      });
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Accept friend request
app.post('/api/friends/accept', async (req, res) => {
  try {
    const { requesterId, addresseeId } = req.body;
    await db.query(
      `UPDATE friendships SET status='accepted', updated_at=NOW()
       WHERE requester_id=$1 AND addressee_id=$2`,
      [requesterId, addresseeId]
    );
    // Notify requester if online
    const target = [...socketPlayers.entries()].find(([, s]) => s.playerId === requesterId);
    if (target) {
      const accepter = [...socketPlayers.values()].find(s => s.playerId === addresseeId);
      io.to(target[0]).emit('friend-accepted', {
        byId: addresseeId, byName: accepter?.playerName || 'Someone', byAvatarId: accepter?.avatarId,
      });
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Decline / unfriend
app.post('/api/friends/decline', async (req, res) => {
  try {
    const { requesterId, addresseeId } = req.body;
    await db.query(
      `UPDATE friendships SET status='declined', updated_at=NOW()
       WHERE requester_id=$1 AND addressee_id=$2`,
      [requesterId, addresseeId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/friends/:requesterId/:addresseeId', async (req, res) => {
  try {
    const { requesterId, addresseeId } = req.params;
    await db.query(
      `DELETE FROM friendships
       WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,
      [requesterId, addresseeId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Guest registration — upsert into players
app.post('/api/player/guest', async (req, res) => {
  try {
    const { playerId, name, avatarId } = req.body;
    if (!playerId) return res.status(400).json({ error: 'Missing playerId' });
    await db.query(
      `INSERT INTO players (id, display_name, avatar_id, is_guest)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (id) DO UPDATE SET
         display_name=$2, avatar_id=$3, last_seen_at=NOW()`,
      [playerId, (name || 'Guest').trim().slice(0, 20), avatarId || 'cigar']
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Google auth — upsert into players with is_guest=false
app.post('/auth/google', async (req, res) => {
  try {
    const { token } = req.body;
    const r = await fetch('https://www.googleapis.com/userinfo/v2/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const profile = await r.json();
    const playerId = `g_${profile.id}`;
    const name     = profile.given_name || profile.name || '';

    const { rows } = await db.query(
      `INSERT INTO players (id, display_name, avatar_id, is_guest)
       VALUES ($1, $2, 'cigar', false)
       ON CONFLICT (id) DO UPDATE SET
         display_name=$2, last_seen_at=NOW(), is_guest=false
       RETURNING avatar_id`,
      [playerId, name.trim().slice(0, 20)]
    );
    const avatarId = rows[0].avatar_id;
    res.json({ playerId, name, avatarId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function doReset() {
  for (const m of matches.values()) {
    clearTimeout(m.autoStartTimer);
    clearTimeout(m.nextHandTimer);
    clearTimeout(m.turnTimer);
  }
  matches.clear();
  socketPlayers.clear();
  io.emit('reset');
  console.log('[server] full reset');
}

app.get('/reset', (_, res) => { doReset(); res.json({ ok: true }); });
app.post('/admin/reset', (_, res) => { doReset(); res.json({ ok: true }); });

// ── Admin UI ──────────────────────────────────────────────────────────────────

app.get('/api/admin/players', async (_, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.id, p.display_name, p.avatar_id, p.is_guest,
             p.created_at, p.last_seen_at,
             ps.elo, ps.matches_played, ps.matches_won
      FROM players p
      LEFT JOIN player_stats ps ON ps.player_id = p.id
      ORDER BY p.created_at DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/admin/players', (_, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Poker Monkey — Players</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace; min-height: 100vh; padding: 40px 16px; }
    h1 { font-size: 1.4rem; color: #f0c040; margin-bottom: 8px; letter-spacing: 1px; }
    .sub { color: #8b949e; font-size: 0.85rem; margin-bottom: 24px; }
    #auth { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 32px; width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 16px; }
    #auth label { font-size: 0.85rem; color: #8b949e; }
    #auth input { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #e6edf3; font-size: 1rem; padding: 10px 14px; width: 100%; outline: none; }
    #auth input:focus { border-color: #f0c040; }
    #auth button { background: #f0c040; color: #0d1117; border: none; border-radius: 6px; font-weight: 700; font-size: 1rem; padding: 10px; cursor: pointer; }
    #auth .err { color: #f85149; font-size: 0.85rem; display: none; }
    #main { display: none; }
    .nav { margin-bottom: 16px; }
    .nav a { color: #8b949e; font-size: 0.85rem; text-decoration: none; }
    .nav a:hover { color: #e6edf3; }
    .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .toolbar input { background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #e6edf3; font-size: 0.9rem; padding: 7px 12px; width: 260px; outline: none; }
    .toolbar input:focus { border-color: #f0c040; }
    .count { color: #8b949e; font-size: 0.85rem; }
    .wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; background: #161b22; border: 1px solid #30363d; border-radius: 10px; overflow: hidden; font-size: 0.85rem; }
    th { background: #1c2128; color: #8b949e; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 10px 14px; text-align: left; white-space: nowrap; cursor: pointer; user-select: none; }
    th:hover { color: #e6edf3; }
    th.asc::after  { content: ' ↑'; color: #f0c040; }
    th.desc::after { content: ' ↓'; color: #f0c040; }
    td { padding: 9px 14px; border-top: 1px solid #21262d; white-space: nowrap; vertical-align: middle; }
    td.id { font-family: monospace; color: #79c0ff; font-size: 0.78rem; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
    td.guest { color: #8b949e; font-size: 0.8rem; }
    td.elo { font-weight: 700; color: #f0c040; }
    td.name { color: #e6edf3; }
    td.date { color: #8b949e; font-size: 0.8rem; }
    tr:hover td { background: #1c2128; }
  </style>
</head>
<body>
  <h1>♠ Players</h1>

  <div id="auth">
    <label>Password</label>
    <input type="password" id="pw" placeholder="Enter password" />
    <div class="err" id="err">Wrong password</div>
    <button onclick="login()">Enter</button>
  </div>

  <div id="main">
    <div class="nav"><a href="/admin">← Admin home</a></div>
    <div class="toolbar">
      <input type="text" id="search" placeholder="Search name or ID…" oninput="render()" />
      <span class="count" id="count"></span>
    </div>
    <div class="wrap"><table>
      <thead>
        <tr id="thead"></tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table></div>
  </div>

  <script>
    const PASSWORD = '1111';
    const COLS = [
      { key: 'display_name', label: 'Name',     fmt: v => v ?? '—' },
      { key: 'id',           label: 'ID',        fmt: v => v,         cls: 'id' },
      { key: 'is_guest',     label: 'Type',      fmt: v => v ? 'guest' : 'registered', cls: 'guest' },
      { key: 'elo',          label: 'ELO',       fmt: v => v ?? '—',  cls: 'elo' },
      { key: 'matches_played', label: 'Played',  fmt: v => v ?? 0 },
      { key: 'matches_won',  label: 'Won',       fmt: v => v ?? 0 },
      { key: 'created_at',   label: 'Joined',    fmt: v => v ? new Date(v).toLocaleString() : '—', cls: 'date' },
      { key: 'last_seen_at', label: 'Last seen', fmt: v => v ? new Date(v).toLocaleString() : '—', cls: 'date' },
    ];

    let allRows = [], sortCol = 'created_at', sortDir = 'desc';

    document.getElementById('pw').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

    function login() {
      if (document.getElementById('pw').value === PASSWORD) {
        document.getElementById('auth').style.display = 'none';
        document.getElementById('main').style.display = 'block';
        load();
      } else {
        document.getElementById('err').style.display = 'block';
      }
    }

    function buildHeader() {
      const tr = document.getElementById('thead');
      tr.innerHTML = '';
      COLS.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        if (col.key === sortCol) th.className = sortDir;
        th.onclick = () => {
          if (sortCol === col.key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
          else { sortCol = col.key; sortDir = 'asc'; }
          buildHeader();
          render();
        };
        tr.appendChild(th);
      });
    }

    function sortVal(row, key) {
      const v = row[key];
      if (v === null || v === undefined) return '';
      if (key === 'created_at' || key === 'last_seen_at') return new Date(v).getTime();
      if (typeof v === 'boolean') return v ? 1 : 0;
      return v;
    }

    function render() {
      const q = document.getElementById('search').value.toLowerCase();
      let rows = allRows.filter(r =>
        !q || (r.display_name ?? '').toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
      );
      rows.sort((a, b) => {
        const av = sortVal(a, sortCol), bv = sortVal(b, sortCol);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      });
      document.getElementById('count').textContent = rows.length + ' players';
      const tbody = document.getElementById('tbody');
      tbody.innerHTML = '';
      rows.forEach(row => {
        const tr = document.createElement('tr');
        COLS.forEach(col => {
          const td = document.createElement('td');
          if (col.cls) td.className = col.cls;
          td.textContent = col.fmt(row[col.key]);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    async function load() {
      allRows = await fetch('/api/admin/players').then(r => r.json());
      buildHeader();
      render();
    }
  </script>
</body>
</html>`);
});

const ADMIN_SHELL = (title, bodyHtml, scriptHtml = '') => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Poker Monkey — ${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace; min-height: 100vh; padding: 40px 16px; }
    h1 { font-size: 1.4rem; color: #f0c040; margin-bottom: 8px; letter-spacing: 1px; }
    .nav { margin-bottom: 24px; } .nav a { color: #8b949e; font-size: 0.85rem; text-decoration: none; } .nav a:hover { color: #e6edf3; }
    #auth { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 32px; width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 16px; }
    #auth label { font-size: 0.85rem; color: #8b949e; }
    #auth input { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #e6edf3; font-size: 1rem; padding: 10px 14px; width: 100%; outline: none; }
    #auth input:focus { border-color: #f0c040; }
    #auth button { background: #f0c040; color: #0d1117; border: none; border-radius: 6px; font-weight: 700; font-size: 1rem; padding: 10px; cursor: pointer; }
    #auth .err { color: #f85149; font-size: 0.85rem; display: none; }
    #main { display: none; }
    table { width: 100%; border-collapse: collapse; background: #161b22; border: 1px solid #30363d; border-radius: 10px; overflow: hidden; }
    th { background: #1c2128; color: #8b949e; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 16px; text-align: left; }
    td { padding: 12px 16px; border-top: 1px solid #21262d; font-size: 0.9rem; vertical-align: middle; }
    td.key { font-family: monospace; color: #79c0ff; }
    td.desc { color: #8b949e; font-size: 0.8rem; }
    td.val input { background: #0d1117; border: 1px solid #30363d; border-radius: 5px; color: #e6edf3; font-size: 0.9rem; padding: 6px 10px; width: 110px; text-align: right; outline: none; }
    td.val input:focus { border-color: #f0c040; }
    td.action button { background: #238636; color: #fff; border: none; border-radius: 5px; padding: 6px 14px; font-size: 0.8rem; cursor: pointer; font-weight: 600; }
    td.action button:hover { background: #2ea043; }
    td.action button.saved { background: #1f6feb; }
    .reload { margin-top: 16px; text-align: right; }
    .reload button { background: none; border: 1px solid #30363d; color: #8b949e; border-radius: 6px; padding: 6px 14px; font-size: 0.8rem; cursor: pointer; }
    .reload button:hover { color: #e6edf3; border-color: #8b949e; }
  </style>
</head>
<body>
  ${bodyHtml}
  <script>
    const PASSWORD = '1111';
    document.getElementById('pw').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    function login() {
      if (document.getElementById('pw').value === PASSWORD) {
        document.getElementById('auth').style.display = 'none';
        document.getElementById('main').style.display = 'block';
        onLogin();
      } else { document.getElementById('err').style.display = 'block'; }
    }
    ${scriptHtml}
  </script>
</body>
</html>`;

const ADMIN_AUTH_BLOCK = `
  <div id="auth">
    <label>Password</label>
    <input type="password" id="pw" placeholder="Enter password" />
    <div class="err" id="err">Wrong password</div>
    <button onclick="login()">Enter</button>
  </div>`;

app.get('/admin', (_, res) => res.send(ADMIN_SHELL('Admin', `
  <h1>♠ Poker Monkey Admin</h1>
  ${ADMIN_AUTH_BLOCK}
  <div id="main">
    <div style="display:flex;flex-direction:column;gap:12px;max-width:400px;margin-top:8px">
      <a href="/admin/game-config" style="display:block;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px 24px;text-decoration:none;color:#e6edf3">
        <div style="font-size:1rem;font-weight:700;margin-bottom:4px">⚙️ Game Config</div>
        <div style="font-size:0.82rem;color:#8b949e">Blinds, starting chips, turn timer</div>
      </a>
      <a href="/admin/ui-config" style="display:block;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px 24px;text-decoration:none;color:#e6edf3">
        <div style="font-size:1rem;font-weight:700;margin-bottom:4px">🎨 UI Config</div>
        <div style="font-size:0.82rem;color:#8b949e">Animation timings, deal speed, reveal delays</div>
      </a>
      <a href="/admin/players" style="display:block;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px 24px;text-decoration:none;color:#e6edf3">
        <div style="font-size:1rem;font-weight:700;margin-bottom:4px">👥 Players</div>
        <div style="font-size:0.82rem;color:#8b949e">All registered and guest players, ELO, match history</div>
      </a>
    </div>
  </div>`, `function onLogin() {}`)));

app.get('/admin/game-config', (_, res) => res.send(ADMIN_SHELL('Game Config', `
  <h1>♠ Game Config</h1>
  <div class="nav"><a href="/admin">← Admin</a></div>
  ${ADMIN_AUTH_BLOCK}
  <div id="main" style="max-width:680px">
    <table><thead><tr><th>Key</th><th>Value</th><th>Description</th><th></th></tr></thead>
    <tbody id="cfg-body"></tbody></table>
    <div class="reload"><button onclick="load()">↺ Reload</button></div>
  </div>`, `
  async function onLogin() { load(); }
  async function load() {
    const rows = await fetch('/admin/config').then(r => r.json());
    const tbody = document.getElementById('cfg-body');
    tbody.innerHTML = '';
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = \`<td class="key">\${row.key}</td><td class="val"><input type="number" id="val-\${row.key}" value="\${row.value}" /></td><td class="desc">\${row.description||''}</td><td class="action"><button id="btn-\${row.key}" onclick="save('\${row.key}')">Save</button></td>\`;
      tbody.appendChild(tr);
    }
  }
  async function save(key) {
    const btn = document.getElementById('btn-'+key);
    const res = await fetch('/admin/config/'+key, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({value:Number(document.getElementById('val-'+key).value)}) });
    btn.textContent = res.ok ? '✓ Saved' : 'Error';
    if (res.ok) { btn.classList.add('saved'); setTimeout(()=>{btn.textContent='Save';btn.classList.remove('saved');},2000); }
  }`)));

app.get('/admin/ui-config', (_, res) => res.send(ADMIN_SHELL('UI Config', `
  <h1>♠ UI Config</h1>
  <div class="nav"><a href="/admin">← Admin</a></div>
  ${ADMIN_AUTH_BLOCK}
  <div id="main" style="max-width:680px">
    <table><thead><tr><th>Key</th><th>Value</th><th>Description</th><th></th></tr></thead>
    <tbody id="cfg-body"></tbody></table>
    <div class="reload"><button onclick="load()">↺ Reload</button></div>
  </div>`, `
  async function onLogin() { load(); }
  async function load() {
    const rows = await fetch('/api/admin/ui-config').then(r => r.json());
    const tbody = document.getElementById('cfg-body');
    tbody.innerHTML = '';
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = \`<td class="key">\${row.key}</td><td class="val"><input type="number" id="val-\${row.key}" value="\${row.value}" /></td><td class="desc">\${row.description||''}</td><td class="action"><button id="btn-\${row.key}" onclick="save('\${row.key}')">Save</button></td>\`;
      tbody.appendChild(tr);
    }
  }
  async function save(key) {
    const btn = document.getElementById('btn-'+key);
    const res = await fetch('/admin/ui-config/'+key, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({value:Number(document.getElementById('val-'+key).value)}) });
    btn.textContent = res.ok ? '✓ Saved' : 'Error';
    if (res.ok) { btn.classList.add('saved'); setTimeout(()=>{btn.textContent='Save';btn.classList.remove('saved');},2000); }
  }`)));

// ── Game / UI config routes (must be before catch-all) ───────────────────────

app.get('/admin/config', async (_, res) => {
  try {
    const { rows } = await db.query('SELECT key, value, description FROM game_config ORDER BY key');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/admin/config/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined || isNaN(Number(value))) return res.status(400).json({ error: 'numeric value required' });
    const { rowCount } = await db.query('UPDATE game_config SET value=$1 WHERE key=$2', [Number(value), key]);
    if (!rowCount) return res.status(404).json({ error: 'unknown config key' });
    cfg[key] = Number(value);
    res.json({ ok: true, key, value: cfg[key] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/config/ui', (_, res) => res.json(uiCfg));

app.get('/api/admin/ui-config', async (_, res) => {
  try {
    const { rows } = await db.query('SELECT key, value, description FROM ui_config ORDER BY key');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/admin/ui-config/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined || isNaN(Number(value))) return res.status(400).json({ error: 'numeric value required' });
    const { rowCount } = await db.query('UPDATE ui_config SET value=$1 WHERE key=$2', [Number(value), key]);
    if (!rowCount) return res.status(404).json({ error: 'unknown ui_config key' });
    uiCfg[key] = Number(value);
    res.json({ ok: true, key, value: uiCfg[key] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Web client (SPA) ──────────────────────────────────────────────────────────
const distDir = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distDir));
// Catch-all for SPA — but never intercept API, auth, or admin routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/') || req.path.startsWith('/admin/') || req.path.startsWith('/health')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(distDir, 'index.html'));
});

// ── Game config ───────────────────────────────────────────────────────────────

async function loadGameConfig() {
  const defaults = [
    ['starting_chips',     1000, 'Starting chip count per player'],
    ['big_blind',            20, 'Big blind amount'],
    ['small_blind',          10, 'Small blind amount'],
    ['turn_seconds',         20, 'Seconds a player has to act'],
    ['inter_hand_delay_ms', 5000, 'Pause between hands (ms)'],
    ['auto_start_delay_ms', 3000, 'Delay before first hand starts (ms)'],
  ];

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS game_config (
        key         TEXT PRIMARY KEY,
        value       NUMERIC NOT NULL,
        description TEXT
      )
    `);

    for (const [key, value, description] of defaults) {
      await db.query(
        `INSERT INTO game_config (key, value, description) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
        [key, value, description]
      );
    }

    const { rows } = await db.query('SELECT key, value FROM game_config');
    const loaded = {};
    for (const { key, value } of rows) loaded[key] = Number(value);
    console.log('[config] loaded:', loaded);
    return loaded;
  } catch (e) {
    // DB unreachable (e.g. local dev without DATABASE_URL) — fall back to
    // the built-in defaults so the server still boots and is playable.
    const loaded = {};
    for (const [key, value] of defaults) loaded[key] = value;
    console.error('[config] DB unavailable, using defaults:', e.message);
    return loaded;
  }
}

async function loadUiConfig() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ui_config (
      key         TEXT PRIMARY KEY,
      value       NUMERIC NOT NULL,
      description TEXT
    )
  `);

  const defaults = [
    ['card_deal_duration_ms',     500, 'Card deal slide-in animation duration'],
    ['card_deal_stagger_ms',      180, 'Stagger delay between card 1 and card 2'],
    ['action_flash_duration_ms', 2500, 'How long action label shows in nameplate'],
    ['center_action_duration_ms',3000, 'How long center action narration shows'],
    ['community_card_stagger_ms', 500, 'Delay between flop card reveals'],
    ['showdown_card_stagger_ms', 1000, 'Delay between turn/river reveals at showdown'],
    ['winner_reveal_delay_ms',   2000, 'Pause after last CC before winners highlighted'],
    ['pot_flight_duration_ms',    900, 'Pot-to-winner banana flight duration'],
    ['pot_flight_scale_peak_ms',  700, 'Time to peak scale during pot flight'],
    ['pot_flight_fade_start_ms',  700, 'When opacity fade starts during pot flight'],
    ['pot_flight_fade_ms',        200, 'Duration of opacity fade at end of flight'],
    ['win_done_delay_ms',         950, 'Delay after winners shown before chip counts update'],
    ['match_over_elo_pause_ms',     0, 'Extra pause before match-over modal appears'],
    ['rematch_countdown_s',        10, 'Seconds to accept/decline rematch before auto-decline'],
  ];

  for (const [key, value, description] of defaults) {
    await db.query(
      `INSERT INTO ui_config (key, value, description) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
      [key, value, description]
    );
  }

  const { rows } = await db.query('SELECT key, value FROM ui_config');
  const loaded = {};
  for (const { key, value } of rows) loaded[key] = Number(value);
  console.log('[ui-config] loaded:', loaded);
  return loaded;
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3843;

async function start() {
  await redis.connect().catch(e => console.error('[redis] connect failed:', e.message));
  cfg = await loadGameConfig();
  uiCfg = await loadUiConfig();
  server.listen(PORT, () => console.log(`Poker server on port ${PORT}`));
}

start();
