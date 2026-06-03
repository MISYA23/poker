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

const app = express();
app.use(cors());
app.use(express.json());
app.get('/', (_, res) => res.json({ status: 'ok', service: 'poker-server' }));

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
  broadcastMatchList();
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

  io.emit('match-list', { matches: list, onlinePlayers: online });
}

// ── Hand lifecycle ────────────────────────────────────────────────────────────

async function beginHand(m) {
  m.handCount = (m.handCount || 0) + 1;
  m.handEventSeq = 0;
  m.game.startHand();
  m.currentHandUuid = await logStartHand(m, m.game).catch(() => null);
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
         ON CONFLICT (uuid) DO NOTHING`,
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
}

// ── Socket handlers ───────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('[server] connected:', socket.id);

  socket.on('enter-lobby', () => {
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
      if (m.rematchVotes.size >= 2) {
        // Both agreed — restart
        resetRoom(m);
        m.game.gameOver = false;
        m.ended = false;
        for (const p of matchPlayers(m)) {
          m.game.addPlayer(p.playerId, p.playerName, p.avatarId);
        }
        broadcastMatchState(m);
        tryAutoStart(m);
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
        const otherId = matchPlayers(m).find(p => p.playerId !== sp.playerId)?.playerId;
        if (otherId) endMatch(m, otherId);
      }
    }
  });
});

// ── HTTP routes ───────────────────────────────────────────────────────────────

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

app.post('/api/player/guest', (_, res) => res.json({ ok: true }));

app.post('/auth/google', async (req, res) => {
  try {
    const { token } = req.body;
    const r = await fetch(`https://www.googleapis.com/userinfo/v2/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const profile = await r.json();
    const playerId = `g_${profile.id}`;
    const name = profile.given_name || profile.name || '';
    res.json({ playerId, name, avatarId: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3843;
redis.connect().catch(e => console.error('[redis] connect failed:', e.message));
server.listen(PORT, () => console.log(`Poker server on port ${PORT}`));
