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

const TABLE_MAX = 9;
const GAME_OPTIONS = { startingChips: 1000, bigBlind: 20, smallBlind: 10 };
let game = new PokerGame('table', GAME_OPTIONS);

// socketId -> { id, name }
const socketPlayers = new Map();

// [{ socketId, id, name }]
const waitlist = [];

let autoStartTimer = null;
let nextHandTimer = null;
let turnTimer = null;
let timerPlayerId = null;
let turnDeadline = null;

const TURN_SECONDS = 20;

function startTurnTimer() {
  const pid = game.currentPlayerId;
  if (pid === timerPlayerId) return;

  if (turnTimer) { clearTimeout(turnTimer); turnTimer = null; }
  timerPlayerId = pid;
  turnDeadline = null;

  if (!pid || game.phase === 'waiting' || game.phase === 'showdown') return;

  turnDeadline = Date.now() + TURN_SECONDS * 1000;
  turnTimer = setTimeout(() => {
    turnTimer = null;
    if (game.currentPlayerId !== pid) return;
    timerPlayerId = null;
    turnDeadline = null;
    try {
      game.handleAction(pid, 'fold');
      broadcastState();
      if (game.phase === 'showdown') scheduleNextHand(3000);
    } catch (e) {}
  }, TURN_SECONDS * 1000);
}

function broadcastState() {
  const allSocketIds = [...socketPlayers.keys()];
  for (const socketId of allSocketIds) {
    const player = socketPlayers.get(socketId);
    const atTable = game.players.some(p => p.id === player.id);
    const waitlistPos = waitlist.findIndex(w => w.id === player.id);

    const state = atTable
      ? game.getStateFor(player.id)
      : game.getStateFor(null);

    io.to(socketId).emit('game-state', {
      ...state,
      atTable,
      waitlistPosition: waitlistPos >= 0 ? waitlistPos + 1 : null,
      waitlistCount: waitlist.length,
      tableCount: game.players.length,
      turnDeadline,
    });
  }
  startTurnTimer();
}

function tryAutoStart() {
  if (autoStartTimer) return;
  const ready = game.players.filter(p => p.isActive && p.chips > 0);
  if (ready.length >= 2 && game.phase === 'waiting') {
    autoStartTimer = setTimeout(() => {
      autoStartTimer = null;
      if (game.phase === 'waiting' && game.canStart()) {
        game.startHand();
        broadcastState();
      }
    }, 3000);
  }
}

function scheduleNextHand(delay = 5000) {
  if (nextHandTimer) { clearTimeout(nextHandTimer); }
  nextHandTimer = setTimeout(() => {
    nextHandTimer = null;
    while (waitlist.length > 0 && game.players.length < TABLE_MAX) {
      const next = waitlist.shift();
      game.addPlayer(next.id, next.name);
    }

    const ready = game.players.filter(p => p.chips > 0);
    if (ready.length >= 2) {
      game.startHand();
      broadcastState();
    } else {
      game.phase = 'waiting';
      broadcastState();
    }
  }, delay);
}

io.on('connection', (socket) => {
  socket.on('join', ({ playerName }) => {
    const name = (playerName || 'Player').trim().slice(0, 20);
    const playerId = uuidv4();

    socketPlayers.set(socket.id, { id: playerId, name });

    if (game.players.length < TABLE_MAX) {
      game.addPlayer(playerId, name);
      socket.emit('joined', { playerId, atTable: true });
      broadcastState();
      tryAutoStart();
    } else {
      waitlist.push({ socketId: socket.id, id: playerId, name });
      socket.emit('joined', { playerId, atTable: false });
      broadcastState();
    }
  });

  socket.on('player-action', ({ action, amount }) => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    try {
      game.handleAction(player.id, action, amount);
      broadcastState();
      if (game.phase === 'showdown') {
        scheduleNextHand(3000);
      }
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    socketPlayers.delete(socket.id);

    const waitlistIdx = waitlist.findIndex(w => w.socketId === socket.id);
    if (waitlistIdx >= 0) {
      waitlist.splice(waitlistIdx, 1);
      broadcastState();
      return;
    }

    const wasInGame = game.players.some(p => p.id === player.id);
    if (wasInGame) {
      game.removePlayer(player.id);

      // Fill the vacated seat from waitlist
      if (waitlist.length > 0 && game.players.length < TABLE_MAX) {
        const next = waitlist.shift();
        game.addPlayer(next.id, next.name);
      }

      broadcastState();

      if (game.phase === 'showdown') {
        scheduleNextHand(3000);
      } else if (game.phase === 'waiting') {
        tryAutoStart();
      }
    }
  });
});

app.get('/health', (_, res) => res.json({ ok: true, players: game.players.length, waitlist: waitlist.length }));

function doReset() {
  if (turnTimer)     { clearTimeout(turnTimer);     turnTimer = null; }
  if (autoStartTimer){ clearTimeout(autoStartTimer); autoStartTimer = null; }
  if (nextHandTimer) { clearTimeout(nextHandTimer);  nextHandTimer = null; }
  timerPlayerId = null;
  turnDeadline  = null;
  game = new PokerGame('table', GAME_OPTIONS);
  waitlist.length = 0;
  socketPlayers.clear();
  io.emit('reset');
}

app.get('/reset', (req, res) => {
  doReset();
  res.redirect('/');
});

app.post('/admin/reset', (req, res) => {
  doReset();
  res.json({ ok: true });
});

app.get('*', (_, res) => res.sendFile(path.join(clientBuild, 'index.html')));

const PORT = process.env.PORT || 3843;
server.listen(PORT, () => console.log(`Poker server on port ${PORT}`));
