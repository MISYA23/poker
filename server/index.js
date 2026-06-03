require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const { PokerGame } = require('./game/PokerGame');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (_, res) => res.json({ status: 'ok', service: 'poker-server' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const GAME_OPTIONS = { startingChips: 1000, bigBlind: 20, smallBlind: 10 };
const TURN_SECONDS = 20;
const VALID_AVATARS = ['dk', 'diddy', 'alfie', 'jazz'];

// roomId (uuid from DB) -> { id, name, emoji, maxPlayers, game, rematchVotes,
//                            autoStartTimer, nextHandTimer, turnTimer, timerPlayerId, turnDeadline }
const rooms = new Map();

// socketId -> { id, name, avatarId, roomId }
const socketPlayers = new Map();

async function loadRooms() {
  const { rows } = await db.query('SELECT uuid, name, emoji, max_players FROM rooms ORDER BY id');
  for (const row of rows) {
    if (rooms.has(row.uuid)) continue;
    rooms.set(row.uuid, {
      id: row.uuid,
      name: row.name,
      emoji: row.emoji,
      maxPlayers: row.max_players,
      game: new PokerGame(row.uuid, GAME_OPTIONS),
      rematchVotes: new Set(),
      autoStartTimer: null,
      nextHandTimer: null,
      turnTimer: null,
      timerPlayerId: null,
      turnDeadline: null,
    });
    console.log('[server] room loaded:', row.name);
  }
  console.log('[server] rooms ready:', rooms.size);
}

function resetRoom(r) {
  clearTimeout(r.autoStartTimer);
  clearTimeout(r.nextHandTimer);
  clearTimeout(r.turnTimer);
  r.autoStartTimer = null;
  r.nextHandTimer = null;
  r.turnTimer = null;
  r.timerPlayerId = null;
  r.turnDeadline = null;
  r.rematchVotes = new Set();
  r.game = new PokerGame(r.id, GAME_OPTIONS);
}

function startTurnTimer(r) {
  const pid = r.game.currentPlayerId;
  if (pid === r.timerPlayerId) return;
  if (r.turnTimer) { clearTimeout(r.turnTimer); r.turnTimer = null; }
  r.timerPlayerId = pid;
  r.turnDeadline = null;
  if (!pid || r.game.phase === 'waiting' || r.game.phase === 'showdown') return;
  r.turnDeadline = Date.now() + TURN_SECONDS * 1000;
  r.turnTimer = setTimeout(() => {
    r.turnTimer = null;
    if (r.game.currentPlayerId !== pid) return;
    r.timerPlayerId = null;
    r.turnDeadline = null;
    try {
      r.game.handleAction(pid, 'fold');
      broadcastRoomState(r);
      if (r.game.phase === 'showdown') scheduleNextHand(r, 5000);
    } catch (e) {}
  }, TURN_SECONDS * 1000);
}

function broadcastRoomState(r) {
  startTurnTimer(r);
  for (const [socketId, player] of socketPlayers) {
    if (player.roomId !== r.id) continue;
    const atTable = r.game.players.some(p => p.id === player.id);
    const state = atTable ? r.game.getStateFor(player.id) : r.game.getStateFor(null);
    io.to(socketId).emit('game-state', {
      ...state,
      atTable,
      gameOver: r.game.gameOver || false,
      waitlistCount: 0,
      tableCount: r.game.players.length,
      turnDeadline: r.turnDeadline,
    });
  }
  broadcastAllLobbyState();
}

function broadcastAllLobbyState() {
  const tableList = [...rooms.values()].map(r => ({
    id: r.id, name: r.name, emoji: r.emoji,
    playerCount: r.game.players.length, phase: r.game.phase, maxPlayers: r.maxPlayers,
  }));
  io.emit('lobby-state', { tables: tableList, activeSeats: [] });
}

function broadcastLobbyState(socketId) {
  const tableList = [...rooms.values()].map(r => ({
    id: r.id, name: r.name, emoji: r.emoji,
    playerCount: r.game.players.length, phase: r.game.phase, maxPlayers: r.maxPlayers,
  }));
  io.to(socketId).emit('lobby-state', { tables: tableList, activeSeats: [] });
}

function tryAutoStart(r) {
  if (r.autoStartTimer) return;
  const ready = r.game.players.filter(p => p.isActive && p.chips > 0);
  if (ready.length >= 2 && r.game.phase === 'waiting' && !r.game.gameOver) {
    r.autoStartTimer = setTimeout(() => {
      r.autoStartTimer = null;
      if (r.game.phase === 'waiting' && r.game.canStart()) {
        r.game.startHand();
        broadcastRoomState(r);
      }
    }, 3000);
  }
}

function scheduleNextHand(r, delay = 5000) {
  if (r.nextHandTimer) { clearTimeout(r.nextHandTimer); }
  r.nextHandTimer = setTimeout(() => {
    r.nextHandTimer = null;
    const withChips = r.game.players.filter(p => p.isActive && p.chips > 0);
    const activePlayers = r.game.players.filter(p => p.isActive);
    // Game over: only one player has chips left
    if (activePlayers.length >= 2 && withChips.length === 1) {
      r.game.phase = 'waiting';
      r.game.gameOver = true;
      r.rematchVotes = new Set();
      broadcastRoomState(r);
      return;
    }
    if (withChips.length >= 2 && r.game.canStart()) {
      try { r.game.startHand(); } catch (err) { r.game.phase = 'waiting'; }
    } else {
      r.game.phase = 'waiting';
    }
    broadcastRoomState(r);
  }, delay);
}

io.on('connection', (socket) => {
  console.log('[server] socket connected:', socket.id);

  socket.on('enter-lobby', ({ playerId } = {}) => {
    broadcastLobbyState(socket.id);
  });

  socket.on('join', ({ playerId, playerName, avatarId, tableId }) => {
    if (!playerId) { socket.emit('error', { message: 'Missing player ID.' }); return; }

    const r = rooms.get(tableId);
    if (!r) { socket.emit('error', { message: 'Table not found.' }); return; }
    if (r.game.players.length >= r.maxPlayers) { socket.emit('error', { message: 'Table is full.' }); return; }

    // Remove from old room if switching
    const existing = socketPlayers.get(socket.id);
    if (existing && existing.roomId !== tableId) {
      const oldRoom = rooms.get(existing.roomId);
      if (oldRoom) { oldRoom.game.removePlayer(existing.id); broadcastRoomState(oldRoom); }
    }

    const name = (playerName || 'Player').trim().slice(0, 20);
    const safeAvatarId = VALID_AVATARS.includes(avatarId) ? avatarId : VALID_AVATARS[0];

    socketPlayers.set(socket.id, { id: playerId, name, avatarId: safeAvatarId, roomId: tableId });
    r.game.addPlayer(playerId, name, safeAvatarId);

    console.log('[server] player joined', r.name, '| seats:', r.game.players.length, '/', r.maxPlayers);
    socket.emit('joined', { playerId, tableId });
    broadcastRoomState(r);
    tryAutoStart(r);
  });

  socket.on('leave-table', () => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    const r = rooms.get(player.roomId);
    if (r) { r.game.removePlayer(player.id); broadcastRoomState(r); }
    socketPlayers.delete(socket.id);
    broadcastLobbyState(socket.id);
  });

  socket.on('player-action', ({ action, amount }) => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    const r = rooms.get(player.roomId);
    if (!r) return;
    try {
      r.game.handleAction(player.id, action, amount);
      broadcastRoomState(r);
      if (r.game.phase === 'showdown') scheduleNextHand(r, 5000);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('rematch-vote', ({ vote }) => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    const r = rooms.get(player.roomId);
    if (!r || !r.game.gameOver) return;

    if (vote) {
      r.rematchVotes.add(player.id);
      const activePlayers = r.game.players.filter(p => p.isActive);
      // All active players voted yes — start rematch
      if (r.rematchVotes.size >= activePlayers.length && activePlayers.length >= 2) {
        r.game.gameOver = false;
        // Give everyone back starting chips
        for (const p of r.game.players) { p.chips = GAME_OPTIONS.startingChips; p.isActive = true; }
        r.rematchVotes = new Set();
        tryAutoStart(r);
        broadcastRoomState(r);
      }
    } else {
      // Player said no — remove them from the table
      r.game.removePlayer(player.id);
      socketPlayers.delete(socket.id);
      socket.emit('reset');
      broadcastRoomState(r);
    }
  });

  socket.on('disconnect', () => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    socketPlayers.delete(socket.id);
    console.log('[server] disconnected:', socket.id, player.name);
    const r = rooms.get(player.roomId);
    if (!r) return;
    r.game.removePlayer(player.id);
    broadcastRoomState(r);
    if (r.game.phase === 'showdown') scheduleNextHand(r, 5000);
    else if (r.game.phase === 'waiting') tryAutoStart(r);
  });
});

app.get('/api/rooms', async (_, res) => {
  try {
    const { rows } = await db.query('SELECT uuid, name, emoji, max_players FROM rooms ORDER BY id');
    const result = rows.map(row => {
      const r = rooms.get(row.uuid);
      return {
        id: row.uuid, name: row.name, emoji: row.emoji, maxPlayers: row.max_players,
        playerCount: r ? r.game.players.length : 0,
        phase: r ? r.game.phase : 'waiting',
      };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/health', (_, res) => res.json({
  ok: true,
  rooms: [...rooms.values()].map(r => ({ id: r.id, name: r.name, players: r.game.players.length, phase: r.game.phase })),
}));

function doReset() {
  for (const r of rooms.values()) resetRoom(r);
  socketPlayers.clear();
  io.emit('reset');
  io.sockets.sockets.forEach(s => broadcastLobbyState(s.id));
  console.log('[server] full reset — rooms preserved');
}

app.get('/reset', (_, res) => { doReset(); res.json({ ok: true }); });
app.post('/admin/reset', (_, res) => { doReset(); res.json({ ok: true }); });

// Guest player registration — fire-and-forget from client, just acknowledge
app.post('/api/player/guest', (req, res) => {
  res.json({ ok: true });
});

// Google auth — validates access token and returns playerId
app.post('/auth/google', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing token' });
  try {
    const profile = await fetch('https://www.googleapis.com/userinfo/v2/me', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    if (!profile.id) return res.status(401).json({ error: 'Invalid token' });
    const playerId = 'g_' + profile.id;
    const name = profile.given_name || profile.name || '';
    res.json({ playerId, name, avatarId: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3843;
loadRooms()
  .then(() => server.listen(PORT, () => console.log(`Poker server on port ${PORT}`)))
  .catch(err => {
    console.error('[server] DB load failed:', err.message, '— starting anyway');
    server.listen(PORT, () => console.log(`Poker server on port ${PORT}`));
  });
