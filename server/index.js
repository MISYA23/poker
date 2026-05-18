const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { PokerGame } = require('./game/PokerGame');

const app = express();
app.use(cors());
app.use(express.json());

const clientBuild = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuild));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const TABLE_MAX = 2;
const GAME_OPTIONS = { startingChips: 1000, bigBlind: 20, smallBlind: 10 };
const TURN_SECONDS = 20;

// tableId -> { id, game, autoStartTimer, nextHandTimer, turnTimer, timerPlayerId, turnDeadline }
const tables = new Map();

// socketId -> { id, name, avatarId, tableId }
const socketPlayers = new Map();

function createTable() {
  const id = uuidv4();
  const t = {
    id,
    game: new PokerGame(id, GAME_OPTIONS),
    autoStartTimer: null,
    nextHandTimer: null,
    turnTimer: null,
    timerPlayerId: null,
    turnDeadline: null,
  };
  tables.set(id, t);
  console.log('[server] table created:', id, '| total tables:', tables.size);
  return t;
}

function destroyTable(tableId) {
  const t = tables.get(tableId);
  if (!t) return;
  clearTimeout(t.autoStartTimer);
  clearTimeout(t.nextHandTimer);
  clearTimeout(t.turnTimer);
  tables.delete(tableId);
  console.log('[server] table destroyed:', tableId, '| total tables:', tables.size);
}

function findAvailableTable() {
  for (const t of tables.values()) {
    if (t.game.players.length < TABLE_MAX) return t;
  }
  return null;
}

function startTurnTimer(t) {
  const pid = t.game.currentPlayerId;
  if (pid === t.timerPlayerId) return;

  if (t.turnTimer) { clearTimeout(t.turnTimer); t.turnTimer = null; }
  t.timerPlayerId = pid;
  t.turnDeadline = null;

  if (!pid || t.game.phase === 'waiting' || t.game.phase === 'showdown') return;

  t.turnDeadline = Date.now() + TURN_SECONDS * 1000;
  t.turnTimer = setTimeout(() => {
    t.turnTimer = null;
    if (t.game.currentPlayerId !== pid) return;
    t.timerPlayerId = null;
    t.turnDeadline = null;
    try {
      const player = t.game.players.find(p => p.id === pid);
      const canCheck = player && player.roundBet >= t.game.currentBet;
      t.game.handleAction(pid, canCheck ? 'check' : 'fold');
      broadcastTableState(t);
      if (t.game.phase === 'showdown') scheduleNextHand(t, 8000);
    } catch (e) {}
  }, TURN_SECONDS * 1000);
}

function broadcastTableState(t) {
  startTurnTimer(t);
  for (const [socketId, player] of socketPlayers) {
    if (player.tableId !== t.id) continue;
    const atTable = t.game.players.some(p => p.id === player.id);
    const state = atTable ? t.game.getStateFor(player.id) : t.game.getStateFor(null);
    io.to(socketId).emit('game-state', {
      ...state,
      atTable,
      waitlistPosition: null,
      waitlistCount: 0,
      tableCount: t.game.players.length,
      turnDeadline: t.turnDeadline,
    });
  }
}

function tryAutoStart(t) {
  if (t.autoStartTimer) return;
  const ready = t.game.players.filter(p => p.isActive && p.chips > 0);
  if (ready.length >= 2 && t.game.phase === 'waiting') {
    t.autoStartTimer = setTimeout(() => {
      t.autoStartTimer = null;
      if (t.game.phase === 'waiting' && t.game.canStart()) {
        t.game.startHand();
        broadcastTableState(t);
      }
    }, 3000);
  }
}

function scheduleNextHand(t, delay = 8000) {
  if (t.nextHandTimer) { clearTimeout(t.nextHandTimer); }
  t.nextHandTimer = setTimeout(() => {
    t.nextHandTimer = null;
    const ready = t.game.players.filter(p => p.isActive && p.chips > 0);
    if (ready.length >= 2 && t.game.canStart()) {
      try {
        t.game.startHand();
      } catch (err) {
        console.error('[server] startHand failed:', err.message);
        t.game.phase = 'waiting';
      }
    } else {
      t.game.phase = 'waiting';
    }
    broadcastTableState(t);
  }, delay);
}

io.on('connection', (socket) => {
  console.log('[server] socket connected:', socket.id);

  socket.on('join', ({ playerName, avatarId }) => {
    if (socketPlayers.has(socket.id)) {
      console.log('[server] duplicate join ignored from', socket.id);
      return;
    }
    console.log('[server] join from', socket.id, { playerName, avatarId });
    const name = (playerName || 'Player').trim().slice(0, 20);
    const safeAvatarId = ['alfie', 'jazz'].includes(avatarId) ? avatarId : 'alfie';
    const playerId = uuidv4();

    let t = findAvailableTable();
    if (!t) t = createTable();

    socketPlayers.set(socket.id, { id: playerId, name, avatarId: safeAvatarId, tableId: t.id });
    t.game.addPlayer(playerId, name, safeAvatarId);

    console.log('[server] player seated at table', t.id, '| seats:', t.game.players.length, '/', TABLE_MAX);
    socket.emit('joined', { playerId, atTable: true });
    broadcastTableState(t);
    tryAutoStart(t);
  });

  socket.on('player-action', ({ action, amount }) => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    const t = tables.get(player.tableId);
    if (!t) return;
    try {
      t.game.handleAction(player.id, action, amount);
      broadcastTableState(t);
      if (t.game.phase === 'showdown') scheduleNextHand(t, 8000);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    socketPlayers.delete(socket.id);
    console.log('[server] socket disconnected:', socket.id, 'player:', player.name);

    const t = tables.get(player.tableId);
    if (!t) return;

    t.game.removePlayer(player.id);

    if (t.game.players.length === 0) {
      destroyTable(t.id);
      return;
    }

    broadcastTableState(t);

    if (t.game.phase === 'showdown') {
      scheduleNextHand(t, 8000);
    } else if (t.game.phase === 'waiting') {
      tryAutoStart(t);
    }
  });
});

app.get('/health', (_, res) => res.json({
  ok: true,
  tables: [...tables.values()].map(t => ({ id: t.id, players: t.game.players.length, phase: t.game.phase })),
}));

function doReset() {
  for (const t of tables.values()) destroyTable(t.id);
  tables.clear();
  socketPlayers.clear();
  io.emit('reset');
  console.log('[server] full reset');
}

app.get('/reset', (req, res) => { doReset(); res.redirect('/'); });
app.post('/admin/reset', (req, res) => { doReset(); res.json({ ok: true }); });

app.get('*', (_, res) => res.sendFile(path.join(clientBuild, 'index.html')));

const PORT = process.env.PORT || 3843;
server.listen(PORT, () => console.log(`Poker server on port ${PORT}`));
