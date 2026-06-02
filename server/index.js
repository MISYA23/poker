require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const { PokerGame } = require('./game/PokerGame');
const db = require('./db');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const db = new Pool({ connectionString: process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL });

const TABLE_MAX = 2;
const GAME_OPTIONS = { startingChips: 1000, bigBlind: 20, smallBlind: 10 };
const TURN_SECONDS = 20;

// roomId (uuid from DB) -> { id, name, emoji, game, autoStartTimer, nextHandTimer, turnTimer, timerPlayerId, turnDeadline }
const rooms = new Map();

// socketId -> { id, name, avatarId, roomId }
const socketPlayers = new Map();

// Load rooms from DB and create in-memory game state for each
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
      autoStartTimer: null,
      nextHandTimer: null,
      turnTimer: null,
      timerPlayerId: null,
      turnDeadline: null,
    });
    console.log('[server] room loaded:', row.name, row.uuid);
  }
  console.log('[server] rooms loaded:', rooms.size);
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
      waitlistPosition: null,
      waitlistCount: 0,
      tableCount: r.game.players.length,
      turnDeadline: r.turnDeadline,
    });
  }
}

function tryAutoStart(r) {
  if (r.autoStartTimer) return;
  const ready = r.game.players.filter(p => p.isActive && p.chips > 0);
  if (ready.length >= 2 && r.game.phase === 'waiting') {
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
    const ready = r.game.players.filter(p => p.isActive && p.chips > 0);
    if (ready.length >= 2 && r.game.canStart()) {
      try { r.game.startHand(); } catch (err) { r.game.phase = 'waiting'; }
    } else {
      r.game.phase = 'waiting';
    }
    broadcastRoomState(r);
  }, delay);
}

function broadcastLobbyState(socketId) {
  const tableList = [...rooms.values()].map(r => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    playerCount: r.game.players.length,
    phase: r.game.phase,
    maxPlayers: r.maxPlayers,
  }));
  const target = socketId ? io.to(socketId) : io;
  target.emit('lobby-state', { tables: tableList, activeSeats: [] });
}

io.on('connection', (socket) => {
  console.log('[server] socket connected:', socket.id);

  socket.on('enter-lobby', ({ playerId } = {}) => {
    console.log('[server] enter-lobby from', socket.id, { playerId });
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
      if (oldRoom) {
        oldRoom.game.removePlayer(existing.id);
        broadcastRoomState(oldRoom);
      }
    }

    const name = (playerName || 'Player').trim().slice(0, 20);
    const safeAvatarId = ['dk', 'diddy'].includes(avatarId) ? avatarId : 'dk';

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

  socket.on('player-action', async ({ action, amount }) => {
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

  socket.on('leave-table', () => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    socketPlayers.delete(socket.id);
    const t = tables.get(player.tableId);
    if (t) evictPlayer(player, t);
    lobbySockets.add(socket.id);
    socket.emit('lobby-state', getLobbyState());
    console.log('[server] player left table:', player.name);
  });

  socket.on('set-timers', ({ enabled }) => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    const t = tables.get(player.tableId);
    if (!t) return;
    t.timersEnabled = !!enabled;
    if (!t.timersEnabled) {
      clearTimeout(t.turnTimer);
      t.turnTimer = null;
      t.timerPlayerId = null;
      t.turnDeadline = null;
    }
    broadcastTableState(t);
  });

  socket.on('add-bot', () => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    const t = tables.get(player.tableId);
    if (!t || t.game.players.length >= SEAT_MAX) return;
    const midHand = !['waiting', 'showdown'].includes(t.game.phase);
    const botId = `bot-${uuidv4()}`;
    t.botIds.add(botId);
    try {
      t.game.addPlayer(botId, BOT_NAMES[t.botIds.size % BOT_NAMES.length], BOT_AVATARS[t.botIds.size % BOT_AVATARS.length]);
      if (midHand) { const p = t.game.players.find(pl => pl.id === botId); if (p) p.isActive = false; }
    } catch { t.botIds.delete(botId); return; }
    tryAutoStart(t);
    broadcastTableState(t);
    broadcastLobbyState();
  });

  socket.on('remove-bot', () => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    const t = tables.get(player.tableId);
    if (!t || t.botIds.size === 0) return;
    bumpBot(t);
    if (t.botIds.size === 0) t.botsEnabled = false;
    broadcastTableState(t);
    broadcastLobbyState();
  });

  socket.on('disconnect', () => {
    lobbySockets.delete(socket.id);
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

// REST: rooms list with live state (reads from DB + memory)
app.get('/api/rooms', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT uuid, name, emoji, max_players FROM rooms ORDER BY id');
    const result = rows.map(row => {
      const r = rooms.get(row.uuid);
      return {
        id: row.uuid,
        name: row.name,
        emoji: row.emoji,
        maxPlayers: row.max_players,
        playerCount: r ? r.game.players.length : 0,
        phase: r ? r.game.phase : 'waiting',
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_, res) => res.json({
  ok: true,
  rooms: [...rooms.values()].map(r => ({ id: r.id, name: r.name, players: r.game.players.length, phase: r.game.phase })),
}));

app.get('/', (req, res) => res.json({ status: 'ok', service: 'poker-server' }));

function doReset() {
  // Reset game state for all rooms but KEEP rooms in DB and memory
  for (const r of rooms.values()) resetRoom(r);
  socketPlayers.clear();
  for (const { timer } of disconnectedPlayers.values()) clearTimeout(timer);
  disconnectedPlayers.clear();
  io.emit('reset');
  // Re-broadcast lobby state to all connected sockets
  io.sockets.sockets.forEach((s) => broadcastLobbyState(s.id));
  console.log('[server] full reset — rooms preserved');
}

app.get('/reset', (req, res) => { doReset(); res.json({ ok: true }); });
app.post('/admin/reset', (req, res) => { doReset(); res.json({ ok: true }); });

const PORT = process.env.PORT || 3843;

loadRooms()
  .then(() => server.listen(PORT, () => console.log(`Poker server on port ${PORT}`)))
  .catch(err => {
    console.error('[server] failed to load rooms:', err.message);
    server.listen(PORT, () => console.log(`Poker server on port ${PORT} (no DB rooms)`));
  });
