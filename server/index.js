require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { PokerGame } = require('./game/PokerGame');
const db = require('./db');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const app = express();
app.use(cors());
app.use(express.json());

const clientBuild = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuild));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const SEAT_MAX = 9;
const GAME_OPTIONS = { startingChips: 1000, bigBlind: 20, smallBlind: 10 };
const TURN_SECONDS = 20;

const BOT_NAMES = [
  'Alex', 'Blake', 'Casey', 'Dana', 'Eli', 'Fran', 'Gray', 'Harper',
  'Indie', 'Jamie', 'Kai', 'Lee', 'Morgan', 'Noel', 'Quinn', 'Remy',
  'Sage', 'Tatum', 'Uri', 'Val',
];
const BOT_AVATARS = ['fox', 'frog', 'lion', 'penguin', 'shark', 'tiger', 'octopus', 'unicorn'];
const VALID_AVATARS = BOT_AVATARS;

// tableId -> { id, game, autoStartTimer, nextHandTimer, turnTimer, timerPlayerId, turnDeadline }
const tables = new Map();

// socketId -> { id, name, avatarId, tableId }
const socketPlayers = new Map();

async function createTable() {
  const id = uuidv4();
  const t = {
    id,
    game: new PokerGame(id, GAME_OPTIONS),
    autoStartTimer: null,
    nextHandTimer: null,
    turnTimer: null,
    timerPlayerId: null,
    turnDeadline: null,
    botTimer: null,
    botIds: new Set(),
    dbTableId: null,
    dbHandId: null,
    handNumber: 0,
    actionSeq: 0,
  };
  tables.set(id, t);
  console.log('[server] table created:', id, '| total tables:', tables.size);
  try { t.dbTableId = await db.createTable(id); } catch (e) { console.error('[db] createTable:', e.message); }
  return t;
}

function destroyTable(tableId) {
  const t = tables.get(tableId);
  if (!t) return;
  clearTimeout(t.autoStartTimer);
  clearTimeout(t.nextHandTimer);
  clearTimeout(t.turnTimer);
  clearTimeout(t.botTimer);
  tables.delete(tableId);
  if (t.dbTableId) db.completeTable(t.id).catch(console.error);
  console.log('[server] table destroyed:', tableId, '| total tables:', tables.size);
}

function dbLog(t, opts) {
  if (!t.dbTableId) return;
  db.logAction(t.dbTableId, t.dbHandId, ++t.actionSeq, opts).catch(console.error);
}

async function dbStartHand(t) {
  if (!t.dbTableId) return;
  t.handNumber += 1;
  t.actionSeq = 0;
  try {
    t.dbHandId = await db.startHand(t.dbTableId, t.handNumber);
    // Log blind posts
    const g = t.game;
    for (const p of g.players) {
      if (p.roundBet > 0) {
        const role = p.isSmallBlind ? 'post_small_blind' : 'post_big_blind';
        dbLog(t, { playerName: p.name, actionType: role, amount: p.roundBet, phase: 'preflop' });
      }
    }
  } catch (e) { console.error('[db] startHand:', e.message); }
}

async function dbCompleteHand(t) {
  if (!t.dbHandId) return;
  const g = t.game;
  const winner = g.winners?.[0];
  try {
    await db.completeHand(t.dbHandId, {
      pot: g.pot,
      communityCards: g.communityCards,
      winnerName: winner ? g.players.find(p => p.id === winner.playerId)?.name : null,
      winningHand: winner?.handName || null,
    });
  } catch (e) { console.error('[db] completeHand:', e.message); }
}

// ── Bot helpers ───────────────────────────────────────────────────────────────

function addBotsToFill(t) {
  // During an active betting phase, newly added players have no cards — mark
  // them inactive so they sit out until the next hand (startHand reactivates).
  const midHand = !['waiting', 'showdown'].includes(t.game.phase);

  // Between hands: evict busted bots so their seats can be refilled.
  if (!midHand) {
    for (const botId of [...t.botIds]) {
      const p = t.game.players.find(pl => pl.id === botId);
      if (p && p.chips === 0) {
        t.botIds.delete(botId);
        const idx = t.game.players.indexOf(p);
        if (idx !== -1) t.game.players.splice(idx, 1);
      }
    }
  }

  let nameIdx = t.botIds.size;
  while (t.game.players.length < SEAT_MAX) {
    const botId = `bot-${uuidv4()}`;
    t.botIds.add(botId);
    try {
      t.game.addPlayer(botId, BOT_NAMES[nameIdx % BOT_NAMES.length], BOT_AVATARS[nameIdx % BOT_AVATARS.length]);
      if (midHand) {
        const p = t.game.players.find(pl => pl.id === botId);
        if (p) p.isActive = false;
      }
    } catch (e) { t.botIds.delete(botId); break; }
    nameIdx++;
  }
}

function bumpBot(t) {
  const [botId] = t.botIds;
  if (!botId) return;
  t.botIds.delete(botId);
  t.game.removePlayer(botId);
}

function getBotAction(game, botId) {
  const player = game.players.find(p => p.id === botId);
  const canCheck = player.roundBet >= game.currentBet;
  const roll = Math.random();
  if (canCheck) {
    if (roll < 0.60) return { action: 'check' };
    const raiseTotal = game.currentBet + game.minRaise;
    if (roll < 0.85) {
      if (raiseTotal <= player.chips + player.roundBet) return { action: 'raise', amount: raiseTotal };
      return { action: 'all-in' };
    }
    return { action: 'fold' };
  } else {
    if (roll < 0.80) return { action: 'fold' };
    if (roll < 0.95) return { action: 'call' };
    const raiseTotal = game.currentBet + game.minRaise;
    if (raiseTotal <= player.chips + player.roundBet) return { action: 'raise', amount: raiseTotal };
    return { action: 'all-in' };
  }
}

function scheduleBotAction(t) {
  if (t.botTimer) { clearTimeout(t.botTimer); t.botTimer = null; }
  const pid = t.game.currentPlayerId;
  if (!pid || !t.botIds.has(pid)) return;
  t.botTimer = setTimeout(async () => {
    t.botTimer = null;
    if (t.game.currentPlayerId !== pid) return;
    try {
      const { action, amount } = getBotAction(t.game, pid);
      t.game.handleAction(pid, action, amount);
      if (t.game.phase === 'showdown') { await dbCompleteHand(t); scheduleNextHand(t, 3000); }
      broadcastTableState(t);
    } catch (e) { console.error('[bot] action error:', e.message); }
  }, 800 + Math.random() * 700);
}

// ─────────────────────────────────────────────────────────────────────────────

function findAvailableTable() {
  for (const t of tables.values()) {
    if (t.botIds.size > 0 || t.game.players.length < SEAT_MAX) return t;
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
      const action = canCheck ? 'check' : 'fold';
      const phaseBefore = t.game.phase;
      t.game.handleAction(pid, action);
      const sp = [...socketPlayers.values()].find(s => s.id === pid);
      dbLog(t, { playerName: player?.name, googleSub: sp?.googleSub, actionType: action, phase: phaseBefore });
      if (t.game.phase === 'showdown') { dbCompleteHand(t).catch(console.error); scheduleNextHand(t, 8000); }
      broadcastTableState(t);
    } catch (e) {}
  }, TURN_SECONDS * 1000);
}

function broadcastTableState(t) {
  startTurnTimer(t);
  scheduleBotAction(t);
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
      tableNumber: t.dbTableId,
      handNumber: t.handNumber,
    });
  }
}

function tryAutoStart(t) {
  if (t.autoStartTimer) return;
  addBotsToFill(t);
  const ready = t.game.players.filter(p => p.isActive && p.chips > 0);
  if (ready.length >= 2 && t.game.phase === 'waiting') {
    t.autoStartTimer = setTimeout(async () => {
      t.autoStartTimer = null;
      if (t.game.phase === 'waiting' && t.game.canStart()) {
        t.game.startHand();
        await dbStartHand(t);
        broadcastTableState(t);
      }
    }, 3000);
  }
}

function scheduleNextHand(t, delay = 8000) {
  if (t.nextHandTimer) { clearTimeout(t.nextHandTimer); }
  t.nextHandTimer = setTimeout(async () => {
    t.nextHandTimer = null;
    addBotsToFill(t);
    const ready = t.game.players.filter(p => p.isActive && p.chips > 0);
    if (ready.length >= 2 && t.game.canStart()) {
      try {
        t.game.startHand();
        await dbStartHand(t);
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

  socket.on('join', async ({ playerName, avatarId, googleSub }) => {
    if (socketPlayers.has(socket.id)) {
      console.log('[server] duplicate join ignored from', socket.id);
      return;
    }
    console.log('[server] join from', socket.id, { playerName, avatarId });
    const name = (playerName || 'Player').trim().slice(0, 20);
    const safeAvatarId = VALID_AVATARS.includes(avatarId) ? avatarId : VALID_AVATARS[0];
    const playerId = uuidv4();

    let t = findAvailableTable();
    if (!t) t = await createTable();

    if (t.game.players.length >= SEAT_MAX) bumpBot(t);

    socketPlayers.set(socket.id, { id: playerId, name, avatarId: safeAvatarId, tableId: t.id, googleSub: googleSub || null });
    t.game.addPlayer(playerId, name, safeAvatarId);

    if (t.dbTableId) {
      db.addPlayer(t.dbTableId, {
        googleSub: googleSub || null,
        name,
        avatarId: safeAvatarId,
        startingChips: GAME_OPTIONS.startingChips,
      }).catch(console.error);
    }

    console.log('[server] player seated at table', t.id, '| seats:', t.game.players.length, '/', SEAT_MAX);
    socket.emit('joined', { playerId, atTable: true });
    broadcastTableState(t);
    if (t.game.phase === 'waiting') addBotsToFill(t);
    tryAutoStart(t);
  });

  socket.on('player-action', async ({ action, amount }) => {
    const player = socketPlayers.get(socket.id);
    if (!player) return;
    const t = tables.get(player.tableId);
    if (!t) return;
    try {
      const phaseBefore = t.game.phase;
      t.game.handleAction(player.id, action, amount);
      dbLog(t, { playerName: player.name, googleSub: player.googleSub, actionType: action, amount: amount || null, phase: phaseBefore });
      if (t.game.phase === 'showdown') {
        await dbCompleteHand(t);
        scheduleNextHand(t, 8000);
      }
      broadcastTableState(t);
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

    const finalChips = t.game.players.find(p => p.id === player.id)?.chips ?? 0;
    t.game.removePlayer(player.id);

    if (t.dbTableId) {
      db.updatePlayerFinal(t.dbTableId, player.name, finalChips).catch(console.error);
    }

    if (t.game.players.length === 0) {
      destroyTable(t.id);
      return;
    }

    broadcastTableState(t);

    if (t.game.phase === 'showdown') {
      scheduleNextHand(t, 8000);
    } else if (t.game.phase === 'waiting') {
      addBotsToFill(t);
      tryAutoStart(t);
    }
  });
});

app.post('/auth/google', async (req, res) => {
  try {
    const { token } = req.body;
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { sub, email, name, picture } = ticket.getPayload();
    res.json({ sub, email, name, picture });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
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
server.listen(PORT, () => {
  console.log(`Poker server on port ${PORT}`);
  db.migrate().catch(e => console.error('[db] migrate failed:', e.message));
});
