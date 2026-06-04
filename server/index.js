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

const GAME_OPTIONS  = { startingChips: 1000, bigBlind: 20, smallBlind: 10 };
const TURN_SECONDS  = 20;
const VALID_AVATARS = ['dk', 'diddy', 'alfie', 'jazz'];

// matchId → { id, game, p1, p2, observers, rematchVotes, timers... }
const matches = new Map();

// socketId → { playerId, playerName, avatarId, matchId | null }
const socketPlayers = new Map();

// playerId → { timer, matchId } — players mid-match who lost connection
const pendingDisconnects = new Map();

// ── Match helpers ─────────────────────────────────────────────────────────────

function createMatch(p1, p2) {
  const id = randomUUID();
  const m = {
    id,
    game: new PokerGame(id, GAME_OPTIONS),
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
  m.game = new PokerGame(m.id, GAME_OPTIONS);
}

// ── Turn timer ────────────────────────────────────────────────────────────────

function startTurnTimer(m) {
  const pid = m.game.currentPlayerId;
  if (pid === m.timerPlayerId) return;
  if (m.turnTimer) { clearTimeout(m.turnTimer); m.turnTimer = null; }
  m.timerPlayerId = pid;
  m.turnDeadline  = null;
  if (!pid || m.game.phase === 'waiting' || m.game.phase === 'showdown') return;
  m.turnDeadline = Date.now() + TURN_SECONDS * 1000;
  m.turnTimer = setTimeout(() => {
    m.turnTimer = null;
    if (m.game.currentPlayerId !== pid) return;
    m.timerPlayerId = null;
    m.turnDeadline  = null;
    try {
      m.game.handleAction(pid, 'fold');
      broadcastMatchState(m);
      if (m.game.phase === 'showdown') scheduleNextHand(m, 5000);
    } catch (e) {}
  }, TURN_SECONDS * 1000);
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
    id:      m.id,
    player1: m.p1?.playerName || '?',
    player2: m.p2?.playerName || '?',
    phase:   m.game.phase,
    handCount: m.handCount || 0,
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
    }, 3000);
  }
}

function scheduleNextHand(m, delay = 5000) {
  if (m.nextHandTimer) clearTimeout(m.nextHandTimer);
  m.nextHandTimer = setTimeout(async () => {
    m.nextHandTimer = null;
    await flushHandToDb(m, m.game).catch(e => console.error('[hand] flush:', e.message));
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

async function getOrCreateStats(playerId) {
  // Ensure player row exists — only set display_name on first insert, never overwrite
  await db.query(
    `INSERT INTO players (id, display_name, is_guest) VALUES ($1, 'Player', true)
     ON CONFLICT (id) DO UPDATE SET last_seen_at=NOW()`,
    [playerId]
  );
  const { rows } = await db.query(
    `INSERT INTO player_stats (player_id) VALUES ($1)
     ON CONFLICT (player_id) DO UPDATE SET player_id=EXCLUDED.player_id
     RETURNING *`,
    [playerId]
  );
  return rows[0];
}

async function endMatch(m, winnerId) {
  if (m.ended) return;
  m.ended = true;

  const loser = matchPlayers(m).find(p => p.playerId !== winnerId);
  const winner = matchPlayers(m).find(p => p.playerId === winnerId);
  if (!winner || !loser) return;

  try {
    // Ensure both players have real names in the players table
    for (const p of [winner, loser]) {
      await db.query(
        `INSERT INTO players (id, display_name, avatar_id, is_guest)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (id) DO UPDATE SET display_name=$2, avatar_id=$3, last_seen_at=NOW()`,
        [p.playerId, (p.playerName || 'Player').trim().slice(0, 20), p.avatarId || 'dk']
      );
    }

    const [wStats, lStats] = await Promise.all([
      getOrCreateStats(winner.playerId),
      getOrCreateStats(loser.playerId),
    ]);
    const { winnerGain, loserLoss } = calcElo(wStats.elo, lStats.elo);
    const wNewElo = wStats.elo + winnerGain;
    const lNewElo = lStats.elo - loserLoss;

    await Promise.all([
      db.query(
        `UPDATE player_stats SET elo=$1, matches_played=matches_played+1,
         matches_won=matches_won+1, updated_at=NOW() WHERE player_id=$2`,
        [wNewElo, winner.playerId]
      ),
      db.query(
        `UPDATE player_stats SET elo=$1, matches_played=matches_played+1,
         updated_at=NOW() WHERE player_id=$2`,
        [lNewElo, loser.playerId]
      ),
      db.query(
        `INSERT INTO matches (uuid,player1_id,player2_id,status,ended_at,winner_id,
          player1_elo_before,player2_elo_before,player1_elo_after,player2_elo_after)
         VALUES ($1,$2,$3,'complete',NOW(),$4,$5,$6,$7,$8)
         ON CONFLICT (uuid) DO UPDATE SET
           status='complete', ended_at=NOW(), winner_id=$4,
           player1_elo_before=$5, player2_elo_before=$6,
           player1_elo_after=$7, player2_elo_after=$8`,
        [m.id, winner.playerId, loser.playerId, winnerId,
         wStats.elo, lStats.elo, wNewElo, lNewElo]
      ),
    ]);

    // Notify players with ELO changes
    for (const p of matchPlayers(m)) {
      const isWin = p.playerId === winnerId;
      io.to(p.socketId).emit('match-over', {
        winnerId, winnerName: winner.playerName,
        eloChange: isWin ? +winnerGain : -loserLoss,
        newElo:    isWin ? wNewElo : lNewElo,
      });
    }
    console.log(`[match] ended — winner: ${winner.playerName}, elo: ${wStats.elo}→${wNewElo}`);
  } catch (err) {
    console.error('[match] endMatch error:', err.message);
  }
  broadcastMatchList();
}

// ── Socket handlers ───────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('[server] connected:', socket.id);

  socket.on('enter-lobby', ({ playerId, playerName, avatarId } = {}) => {
    if (playerId && playerName) {
      const safeAvatar = VALID_AVATARS.includes(avatarId) ? avatarId : VALID_AVATARS[0];
      const existing = socketPlayers.get(socket.id);
      socketPlayers.set(socket.id, {
        matchId: existing?.matchId ?? null,
        ...existing,
        playerId,
        playerName: playerName.trim().slice(0, 20),
        avatarId: safeAvatar,
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

  socket.on('find-match', ({ playerId, playerName, avatarId }) => {
    if (!playerId) { socket.emit('error', { message: 'Missing player ID.' }); return; }

    const name      = (playerName || 'Player').trim().slice(0, 20);
    const safeAvatar = VALID_AVATARS.includes(avatarId) ? avatarId : VALID_AVATARS[0];

    // Register socket
    socketPlayers.set(socket.id, { playerId, playerName: name, avatarId: safeAvatar, matchId: null, socketId: socket.id });

    // Enqueue
    enqueue({ playerId, playerName: name, avatarId: safeAvatar, socketId: socket.id });

    const pair = tryPair();
    if (pair) {
      const m = createMatch(pair.p1, pair.p2);

      // Link sockets to match
      const sp1 = socketPlayers.get(pair.p1.socketId);
      const sp2 = socketPlayers.get(pair.p2.socketId);
      if (sp1) sp1.matchId = m.id;
      if (sp2) sp2.matchId = m.id;

      // Add players to game
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
      if (m.game.phase === 'showdown') scheduleNextHand(m, 5000);
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
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/player/:playerId/profile', async (req, res) => {
  try {
    const { playerId } = req.params;

    const [statsRes, histRes] = await Promise.all([
      db.query('SELECT elo, matches_played, matches_won FROM player_stats WHERE player_id=$1', [playerId]),
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
      [playerId, (name || 'Guest').trim().slice(0, 20), avatarId || 'dk']
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
    const playerId  = `g_${profile.id}`;
    const name      = profile.given_name || profile.name || '';
    const avatarId  = 'dk';

    await db.query(
      `INSERT INTO players (id, display_name, avatar_id, is_guest)
       VALUES ($1, $2, $3, false)
       ON CONFLICT (id) DO UPDATE SET
         display_name=$2, last_seen_at=NOW(), is_guest=false`,
      [playerId, name.trim().slice(0, 20), avatarId]
    );
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

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3843;
redis.connect().catch(e => console.error('[redis] connect failed:', e.message));
server.listen(PORT, () => console.log(`Poker server on port ${PORT}`));
