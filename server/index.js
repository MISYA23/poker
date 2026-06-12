require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const { Pool }   = require('pg');
const { randomUUID } = require('crypto');
const { PokerGame }  = require('./game/PokerGame');
const { redis }      = require('./redis');
const { startHand: logStartHand, logAction, preActionState, flushHandToDb } = require('./handLogger');
const { enqueue, dequeue, tryPair, calcElo } = require('./matchmaker');
const { decideAction, stateFromGame } = require('./bot/botBrain');
const { getProfile } = require('./bot/profiles');
const { DEFAULT_FORMAT, parseLevels, serializeLevels, levelForHand, blindsForHand } = require('./matchFormat');

const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Populated from avatars table on startup
let validAvatars = ['cigar', 'queen'];

// Populated from game_config table on startup — never mutate directly
let cfg = {};

// Populated from ui_config table on startup — client fetches once per session
let uiCfg = {};

// Populated from match_format table on startup — { handsPerLevel, levels: [{sb,bb}] }
let fmt = DEFAULT_FORMAT;

// matchId → { id, game, p1, p2, observers, rematchVotes, timers... }
const matches = new Map();

// socketId → { playerId, playerName, avatarId, matchId | null }
const socketPlayers = new Map();

// playerId → elo — in-memory cache updated after each match
const eloCache = {};

// `${fromId}:${toId}` → { timer } — pending direct challenges
const challenges = new Map();

// Quick Match funnel: how long a searcher waits before dropping into a bot game
const QUICK_MATCH_WAIT_MS = 5000;

// playerId → setTimeout — the search window between find-match and bot fallback
const fallbackTimers = new Map();

// playerId → { playerId, since, declined:Set } — active broadcast sessions.
// Quick Match with nobody to pair = "challenge everyone": every eligible human
// gets an ordinary challenge from this player (broadcast:true on the entry).
// The session lives while the player searches / kills time in the fallback bot
// game; it ends (voiding all copies) on match start, cancel, lobby, disconnect.
const broadcasts = new Map();

// ip → 2-letter country code (or null) — avoids re-hitting the geo API
const ipCountryCache = new Map();

function socketIp(socket) {
  const fwd = (socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim();
  // Strip IPv4-mapped-IPv6 prefix so private-range checks below actually match
  return (fwd || socket.handshake.address || '').replace(/^::ffff:/i, '');
}

function isPrivateIp(ip) {
  return !ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') ||
    ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.toLowerCase().startsWith('fd') || ip.toLowerCase().startsWith('fe80');
}

async function lookupCountry(ip) {
  if (isPrivateIp(ip)) { console.log('[geo] skipping private/empty ip:', ip || '(none)'); return null; }
  if (ipCountryCache.has(ip)) return ipCountryCache.get(ip);
  try {
    // ip-api.com free tier: no key, 45 req/min, HTTP only — fine server-side, the IP is the only payload.
    // (ipwho.is rejects Node fetch with a bogus "CORS not supported" error — never worked from the server.)
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode`);
    const j = await r.json();
    const cc = j?.status === 'success' && j.countryCode ? j.countryCode : null;
    // Only cache definitive answers — a transient API failure shouldn't pin null for this IP
    if (cc) ipCountryCache.set(ip, cc);
    else console.log('[geo] no result for', ip, JSON.stringify(j));
    return cc;
  } catch (e) { console.log('[geo] lookup failed for', ip, e.message); return null; }
}

// ── Bot opponents ─────────────────────────────────────────────────────────────
// Always shown online in the lobby. Each has a fixed personality profile.

const BOTS = {
  bot_rickdeckard: { name: 'Rick Deckard', avatarId: 'cigar', country: 'US', profile: getProfile('tag') },     // tight-aggressive pro
  bot_hal:         { name: 'HAL 9000',     avatarId: 'queen', country: 'US', profile: getProfile('nit') },     // cold, patient, only moves with the goods
  bot_johnny5:     { name: 'Johnny 5',     avatarId: 'cigar', country: 'US', profile: getProfile('maniac') },  // any two cards, max pressure
};

function botInMatch(botId) {
  return [...matches.values()].some(m => !m.ended && m.botId === botId);
}

function pickFreeBot() {
  const free = Object.keys(BOTS).filter(id => !botInMatch(id));
  const pool = free.length ? free : Object.keys(BOTS);
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Match helpers ─────────────────────────────────────────────────────────────

function createMatch(p1, p2) {
  const id = randomUUID();
  const m = {
    id,
    game: new PokerGame(id, { startingChips: cfg.starting_chips, smallBlind: fmt.levels[0].sb, bigBlind: fmt.levels[0].bb }),
    p1, p2,                  // { playerId, playerName, avatarId, socketId }
    observers: new Set(),    // socketIds watching
    rematchVotes: new Set(),
    ended: false,
    autoStartTimer: null, nextHandTimer: null,
    turnTimer: null, timerPlayerId: null, turnDeadline: null,
    botTimer: null, isBotMatch: false, botId: null, graceTimer: null,
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
  clearTimeout(m.botTimer);
  m.autoStartTimer = m.nextHandTimer = m.turnTimer = m.botTimer = null;
  m.timerPlayerId = null;
  m.turnDeadline = null;
  m.rematchVotes = new Set();
  m.game = new PokerGame(m.id, { startingChips: cfg.starting_chips, smallBlind: fmt.levels[0].sb, bigBlind: fmt.levels[0].bb });
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
      const pre = preActionState(m.game, pid);
      // Auto-action on timeout: only fold when actually facing a bet; otherwise
      // check (no reason to surrender the hand when checking is free).
      const player   = m.game.players.find(p => p.id === pid);
      const canCheck = player && m.game.currentBet <= (player.roundBet || 0);
      m.game.handleAction(pid, canCheck ? 'check' : 'fold');
      logAction(m, m.game, pre)
        .catch(e => console.error('[timer] logAction:', e.message));
      broadcastMatchState(m);
      if (m.game.phase === 'showdown') scheduleNextHand(m, cfg.inter_hand_delay_ms);
    } catch (e) {}
  }, cfg.turn_seconds * 1000);
}

// ── Bot play ──────────────────────────────────────────────────────────────────

// Decisions come from the bot brain (Monte Carlo equity + personality profile).
// Scheduled from broadcastMatchState so every state change (hand start, human
// action, next hand) gives the bot its turn. If the brain errors or picks an
// illegal action, fall back to check/call so the match never stalls.
function maybeScheduleBotAction(m) {
  if (!m.isBotMatch || m.ended || m.botTimer) return;
  if (m.game.currentPlayerId !== m.botId) return;
  m.botTimer = setTimeout(() => {
    m.botTimer = null;
    if (m.ended || m.game.currentPlayerId !== m.botId) return;
    const bot = m.game.players.find(p => p.id === m.botId);
    if (!bot) return;
    const fallback = () => ({ action: bot.roundBet >= m.game.currentBet ? 'check' : 'call' });
    let d;
    try {
      d = decideAction(stateFromGame(m.game, m.botId), m.botProfile || getProfile('tag'));
      console.log(`[bot] ${BOTS[m.botId]?.name} (${m.botProfile?.name || 'tag'}): ${d.action}${d.amount ? ' to ' + d.amount : ''}`, JSON.stringify(d.meta));
    } catch (e) {
      console.error('[bot] brain error, using check/call:', e.message);
      d = fallback();
    }
    try {
      const pre = preActionState(m.game, m.botId);
      try {
        m.game.handleAction(m.botId, d.action, d.amount);
      } catch (e) {
        console.error(`[bot] ${d.action} rejected (${e.message}) — using check/call`);
        d = fallback();
        m.game.handleAction(m.botId, d.action);
      }
      logAction(m, m.game, pre)
        .catch(e => console.error('[bot] logAction:', e.message));
      broadcastMatchState(m);
      if (m.game.phase === 'showdown') scheduleNextHand(m, cfg.inter_hand_delay_ms);
    } catch (err) {
      console.error('[bot] action failed:', err.message);
    }
  }, 600 + Math.floor(Math.random() * 900));
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

function broadcastMatchState(m) {
  startTurnTimer(m);
  maybeScheduleBotAction(m);
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
      handNumber: m.handCount,
    });
  }
  // Observers see face-down cards
  for (const sid of m.observers) {
    io.to(sid).emit('game-state', {
      ...m.game.getStateFor(null),
      atTable: false, observing: true,
      matchId: m.id, turnDeadline: m.turnDeadline,
      handNumber: m.handCount,
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
    isBotMatch: !!m.isBotMatch,
  }));

  // Deduplicated list of all connected players
  const seen = new Set();
  const online = [];
  for (const sp of socketPlayers.values()) {
    if (sp.playerName && !seen.has(sp.playerId)) {
      seen.add(sp.playerId);
      const live = liveMatchOf(sp);
      online.push({
        id: sp.playerId, name: sp.playerName, avatarId: sp.avatarId,
        inMatch: !!live, inBotMatch: !!(live && live.isBotMatch),
        botRefused: !!(live && live.isBotMatch && live.humanRefused),
        elo: eloCache[sp.playerId] || 1200, country: sp.country || null,
      });
    }
  }

  // Bots are always online
  for (const [botId, b] of Object.entries(BOTS)) {
    online.push({ id: botId, name: b.name, avatarId: b.avatarId, inMatch: botInMatch(botId), isBot: true, elo: eloCache[botId] || 1200, country: b.country || null });
  }

  for (const [sid, sp] of socketPlayers.entries()) {
    if (!liveMatchOf(sp)) io.to(sid).emit('match-list', { matches: list, onlinePlayers: online });
  }
}

// ── Seating ───────────────────────────────────────────────────────────────────
// The matches map is the single source of truth for match state. sp.matchId is
// only a pointer to the table a player is sitting at — which may be a live
// match or the match-over screen of an ended one. "Is this player in a match"
// is always answered by liveMatchOf, never by reading sp.matchId directly.
function liveMatchOf(sp) {
  const m = sp?.matchId ? matches.get(sp.matchId) : null;
  return m && !m.ended ? m : null;
}

// ── Challenges ────────────────────────────────────────────────────────────────

// Void every pending challenge involving this player (both directions) and
// notify both parties so their UIs drop pending/incoming entries. Called when
// a player enters any match, disconnects, or logs out — you can't accept a
// challenge from (or keep one pending with) someone who is already playing.
// keepOwnBroadcast: entering a fallback bot game is part of an ongoing search,
// so the player's own broadcast asks survive it.
function voidChallengesFor(playerId, { keepOwnBroadcast = false } = {}) {
  for (const [key, ch] of [...challenges.entries()]) {
    if (ch.fromId !== playerId && ch.toId !== playerId) continue;
    if (keepOwnBroadcast && ch.broadcast && ch.fromId === playerId) continue;
    clearTimeout(ch.timer);
    challenges.delete(key);
    io.to(ch.fromSocketId).emit('challenge-voided', { otherId: ch.toId });
    io.to(ch.toSocketId).emit('challenge-voided', { otherId: ch.fromId });
  }
}

// ── Hand lifecycle ────────────────────────────────────────────────────────────

async function beginHand(m) {
  m.handCount = (m.handCount || 0) + 1;
  m.handEventSeq = 0;
  // Escalating blinds — every fmt.handsPerLevel hands move to the next level.
  // Must be set before startHand(), which posts blinds from game.smallBlind/bigBlind.
  const blinds = blindsForHand(m.handCount, fmt);
  m.game.smallBlind = blinds.sb;
  m.game.bigBlind   = blinds.bb;
  // Pre-blind stacks captured here — startHand() posts the blinds (and can
  // even auto-run the hand to showdown), so the logger can't recover them
  const stacksBefore = m.game.players.map(p => ({ id: p.id, chips: p.chips }));
  m.game.startHand();
  m.currentHandUuid = await logStartHand(m, m.game, stacksBefore).catch(e => { console.error('[hand] startHand failed:', e.message); return null; });
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

// ── Quick Match funnel ────────────────────────────────────────────────────────

// Stop searching: kill the bot-fallback timer and the broadcast session
function clearSearchFor(playerId) {
  const t = fallbackTimers.get(playerId);
  if (t) { clearTimeout(t); fallbackTimers.delete(playerId); }
  endBroadcast(playerId);
}

function socketIdOf(playerId) {
  for (const [sid, sp] of socketPlayers.entries()) {
    if (sp.playerId === playerId) return sid;
  }
  return null;
}

function spOf(playerId) {
  const sid = socketIdOf(playerId);
  return sid ? socketPlayers.get(sid) : null;
}

// End a match with NO rating effect — used when a player swaps out of a bot
// game (human arrived / challenge accepted). The voided match disappears; the
// caller is responsible for putting both players somewhere sensible next.
// TODO(Brian): later, pause the bot match and make it recoverable instead.
function voidMatch(m) {
  if (m.ended) return;
  m.ended = true;
  clearTimeout(m.autoStartTimer); clearTimeout(m.nextHandTimer);
  clearTimeout(m.turnTimer);      clearTimeout(m.botTimer);
  clearTimeout(m.graceTimer);     clearTimeout(m.cleanupTimer);
  m.autoStartTimer = m.nextHandTimer = m.turnTimer = m.botTimer = m.graceTimer = null;
  m.timerPlayerId = null;
  m.turnDeadline  = null;
  matches.delete(m.id);
  for (const p of matchPlayers(m)) {
    clearSearchFor(p.playerId);
    for (const sp of socketPlayers.values()) {
      if (sp.playerId === p.playerId && sp.matchId === m.id) sp.matchId = null;
    }
  }
  for (const sid of m.observers) io.to(sid).emit('reset');
  // A matches row only exists if a hand was already flushed — mark it void
  db.query(`UPDATE matches SET status='void', ended_at=NOW() WHERE uuid=$1`, [m.id]).catch(() => {});
  console.log(`[match] voided ${m.id.slice(0, 8)} (no rating effect)`);
}

// Shared by queue pairing, challenge accepts, and human-arrived swaps.
// p1/p2: { playerId, playerName, avatarId, socketId }
function startHumanMatch(p1, p2) {
  clearSearchFor(p1.playerId);
  clearSearchFor(p2.playerId);
  voidChallengesFor(p1.playerId);
  voidChallengesFor(p2.playerId);

  const m = createMatch(p1, p2);
  const sp1 = socketPlayers.get(p1.socketId);
  const sp2 = socketPlayers.get(p2.socketId);
  if (sp1) sp1.matchId = m.id;
  if (sp2) sp2.matchId = m.id;

  m.game.addPlayer(p1.playerId, p1.playerName, p1.avatarId);
  m.game.addPlayer(p2.playerId, p2.playerName, p2.avatarId);

  io.to(p1.socketId).emit('match-found', { matchId: m.id, opponent: opponentInfo(p2) });
  io.to(p2.socketId).emit('match-found', { matchId: m.id, opponent: opponentInfo(p1) });

  broadcastMatchState(m);
  broadcastMatchList();
  tryAutoStart(m);
  return m;
}

function opponentInfo(p) {
  return {
    name: p.playerName, avatarId: p.avatarId,
    elo: eloCache[p.playerId] || 1200,
    country: socketPlayers.get(p.socketId)?.country || null,
  };
}

// ── Broadcast sessions ────────────────────────────────────────────────────────

// Who can receive a broadcast copy: humans who aren't the broadcaster, aren't
// in a human match, haven't refused a human during their current bot game, and
// haven't already declined this session.
function eligibleForBroadcast(toSp, session) {
  if (!toSp.playerName) return false;
  if (toSp.playerId === session.playerId) return false;
  if (session.declined.has(toSp.playerId)) return false;
  const m = liveMatchOf(toSp);
  if (m && !m.isBotMatch) return false;
  if (m && m.humanRefused) return false;
  return true;
}

// One challenge entry, shared by manual VS and broadcast asks. The caller has
// already verified the target is reachable (not in a human match).
function createChallenge(fromSp, fromSocketId, toSp, toSocketId, { broadcast = false } = {}) {
  const targetMatch = liveMatchOf(toSp);
  const expiresMs = targetMatch ? 15000 : 300000; // in-game: 15s · lobby: 5 min

  const key = `${fromSp.playerId}:${toSp.playerId}`;
  if (challenges.has(key)) { clearTimeout(challenges.get(key).timer); challenges.delete(key); }

  const timer = setTimeout(() => {
    challenges.delete(key);
    if (broadcast) {
      // Letting a broadcast copy lapse = declined for this session, silently
      broadcasts.get(fromSp.playerId)?.declined.add(toSp.playerId);
    } else {
      io.to(fromSocketId).emit('challenge-expired', { toId: toSp.playerId });
    }
    io.to(toSocketId).emit('challenge-voided', { otherId: fromSp.playerId });
    // Lapsing the 15s in-game prompt counts as refusing a human
    const cur = spOf(toSp.playerId);
    if (cur) markHumanRefused(cur);
  }, expiresMs);
  challenges.set(key, { timer, fromId: fromSp.playerId, toId: toSp.playerId, fromSocketId, toSocketId, broadcast });

  io.to(toSocketId).emit('challenge-received', {
    fromId: fromSp.playerId, fromName: fromSp.playerName, fromAvatarId: fromSp.avatarId,
    fromElo: eloCache[fromSp.playerId] || 1200, fromCountry: fromSp.country || null,
    expiresIn: expiresMs / 1000,
  });
  // Broadcast copies don't clutter the sender's outgoing-challenge UI
  if (!broadcast) io.to(fromSocketId).emit('challenge-sent', { toId: toSp.playerId, toName: toSp.playerName });
}

function startBroadcast(sp, socketId) {
  broadcasts.set(sp.playerId, { playerId: sp.playerId, since: Date.now(), declined: new Set() });
  issueBroadcastAsks(sp, socketId);
}

function issueBroadcastAsks(fromSp, fromSocketId) {
  const session = broadcasts.get(fromSp.playerId);
  if (!session) return;
  const seen = new Set();
  for (const [sid, toSp] of socketPlayers.entries()) {
    if (!toSp.playerId || seen.has(toSp.playerId)) continue;
    seen.add(toSp.playerId);
    if (!eligibleForBroadcast(toSp, session)) continue;
    if (challenges.has(`${fromSp.playerId}:${toSp.playerId}`)) continue;
    createChallenge(fromSp, fromSocketId, toSp, sid, { broadcast: true });
  }
}

// Newly-eligible players (fresh login, bot match over) get the outstanding asks
function refreshBroadcasts() {
  for (const session of broadcasts.values()) {
    const sid = socketIdOf(session.playerId);
    const sp  = sid ? socketPlayers.get(sid) : null;
    if (sp) issueBroadcastAsks(sp, sid);
  }
}

function endBroadcast(playerId) {
  if (!broadcasts.delete(playerId)) return;
  for (const [key, ch] of [...challenges.entries()]) {
    if (ch.fromId !== playerId || !ch.broadcast) continue;
    clearTimeout(ch.timer);
    challenges.delete(key);
    io.to(ch.toSocketId).emit('challenge-voided', { otherId: ch.fromId });
  }
}

// Refusing (or ignoring) a challenge during a bot game flips the lobby status
// from "Looking to play" to "Playing a bot" — still challengeable, just not
// advertised as available. Resets naturally when the bot match ends.
function markHumanRefused(sp) {
  const m = liveMatchOf(sp);
  if (m && m.isBotMatch && !m.humanRefused) {
    m.humanRefused = true;
    broadcastMatchList();
  }
}

// ── Match end + ELO ───────────────────────────────────────────────────────────

async function endMatch(m, winnerId) {
  if (m.ended) return;
  m.ended = true;
  // Kill every pending timer — a leftover nextHandTimer would deal a zombie
  // hand on this ended match and keep spamming game-state at the players
  clearTimeout(m.autoStartTimer); m.autoStartTimer = null;
  clearTimeout(m.nextHandTimer);  m.nextHandTimer  = null;
  clearTimeout(m.turnTimer);      m.turnTimer      = null;
  clearTimeout(m.botTimer);       m.botTimer       = null;
  clearTimeout(m.graceTimer);     m.graceTimer     = null;
  m.timerPlayerId = null;
  m.turnDeadline  = null;
  m.game.gameOver = true; // every end path counts as game over, not just busts

  // Any way a match ends, its players are done waiting for humans
  for (const p of matchPlayers(m)) clearSearchFor(p.playerId);

  // If nobody rematches within 90s, reap the match and free both players
  m.cleanupTimer = setTimeout(() => {
    if (!matches.has(m.id)) return;
    matches.delete(m.id);
    for (const p of matchPlayers(m)) {
      for (const sp of socketPlayers.values()) {
        if (sp.playerId === p.playerId && sp.matchId === m.id) sp.matchId = null;
      }
    }
    broadcastMatchList();
  }, 90000);

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

  // Bot matches are rated like any other — bots live or die by their ELO
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
  // Observers get the result too — without it they'd sit on a frozen table forever
  for (const sid of m.observers) {
    io.to(sid).emit('match-over', { winnerId, winnerName: winner.playerName, observer: true });
  }
  console.log(`[match] ended — winner: ${winner.playerName}, elo: ${wElo}→${wNewElo}`);
  broadcastMatchList();
  // Both players just became reachable again — outstanding searches ask them
  refreshBroadcasts();

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
      // Load display_name, avatar_id, ELO and country from DB — client never sends these
      let playerName = 'Player', avatarId = 'cigar', country = null;
      try {
        const { rows } = await db.query(
          `SELECT p.display_name, p.avatar_id, p.country, s.elo
             FROM players p LEFT JOIN player_stats s ON s.player_id = p.id
            WHERE p.id=$1`, [playerId]);
        if (rows.length) {
          playerName = rows[0].display_name;
          avatarId = rows[0].avatar_id;
          country = rows[0].country;
          if (rows[0].elo != null && eloCache[playerId] == null) eloCache[playerId] = rows[0].elo;
        }
      } catch (e) { console.error('[enter-lobby] db lookup failed:', e.message); }

      const existing = socketPlayers.get(socket.id);
      socketPlayers.set(socket.id, {
        matchId: existing?.matchId ?? null,
        ...existing,
        playerId,
        playerName,
        avatarId,
        country,
        socketId: socket.id,
      });
      // First sight of this player: geolocate their IP in the background
      if (!country) {
        lookupCountry(socketIp(socket)).then(cc => {
          if (!cc) return;
          db.query('UPDATE players SET country=$1 WHERE id=$2', [cc, playerId]).catch(() => {});
          const cur = socketPlayers.get(socket.id);
          if (cur && cur.playerId === playerId) { cur.country = cc; broadcastMatchList(); }
        });
      }

      // A live match holding a vacant seat for this identity takes priority
      // over the lobby — re-seat the new socket and send them to the table.
      // (Refresh / connection-blip recovery.)
      for (const m of matches.values()) {
        if (m.ended) continue;
        const seat = matchPlayers(m).find(p => p.playerId === playerId && p.vacant);
        if (!seat) continue;
        seat.vacant = false;
        seat.socketId = socket.id;
        socketPlayers.get(socket.id).matchId = m.id;
        if (!matchPlayers(m).some(p => p.vacant)) { clearTimeout(m.graceTimer); m.graceTimer = null; }
        const other = matchPlayers(m).find(p => p.playerId !== playerId);
        if (other) io.to(other.socketId).emit('opponent-reconnected');
        io.to(socket.id).emit('match-found', { matchId: m.id, opponent: { name: other?.playerName || '' } });
        broadcastMatchState(m);
        broadcastMatchList();
        console.log(`[match] ${playerName} re-seated at ${m.id.slice(0, 8)} after reconnect`);
        return;
      }

      // Lobby and table are mutually exclusive. If this socket is still seated
      // at a live match, arriving at the lobby means they abandoned it —
      // opponent wins. (A freshly reconnected socket is seated at nothing, so
      // refreshes can never trip this.)
      const sp = socketPlayers.get(socket.id);
      const live = liveMatchOf(sp);
      if (live) {
        const otherId = matchPlayers(live).find(p => p.playerId !== playerId)?.playerId;
        endMatch(live, otherId ?? playerId);
      }
      sp.matchId = null;
      // Arriving at the lobby always means "not searching anymore"
      dequeue(playerId);
      clearSearchFor(playerId);
    }
    broadcastMatchList();
    // Anyone mid-search asks this fresh arrival too
    refreshBroadcasts();
  });

  // Re-read display name / avatar after a profile edit. Deliberately separate
  // from enter-lobby: arriving at the lobby has match-forfeit semantics, a
  // profile save must not.
  socket.on('refresh-profile', async () => {
    const sp = socketPlayers.get(socket.id);
    if (!sp?.playerId) return;
    try {
      const { rows } = await db.query('SELECT display_name, avatar_id FROM players WHERE id=$1', [sp.playerId]);
      if (rows.length) { sp.playerName = rows[0].display_name; sp.avatarId = rows[0].avatar_id; }
    } catch (e) { console.error('[refresh-profile] db lookup failed:', e.message); }
    broadcastMatchList();
  });

  socket.on('find-match', ({ playerId }) => {
    if (!playerId) { socket.emit('error', { message: 'Missing player ID.' }); return; }

    const sp = socketPlayers.get(socket.id);
    if (!sp?.playerName) { socket.emit('error', { message: 'Not in lobby.' }); return; }
    if (liveMatchOf(sp)) { socket.emit('error', { message: 'Finish your current match first.' }); return; }

    enqueue({ playerId: sp.playerId, playerName: sp.playerName, avatarId: sp.avatarId, socketId: socket.id });

    const pair = tryPair();
    if (pair) {
      startHumanMatch(pair.p1, pair.p2);
    } else {
      socket.emit('in-queue', {});
      scheduleFallback(sp.playerId);
      // Quick Match = challenge everyone: every eligible human gets the ask
      startBroadcast(sp, socket.id);
    }
  });

  // After QUICK_MATCH_WAIT_MS with no human, drop the searcher into a bot game.
  // They stay registered as waiting — the queue keeps running underneath.
  function scheduleFallback(playerId) {
    clearTimeout(fallbackTimers.get(playerId));
    fallbackTimers.set(playerId, setTimeout(() => {
      fallbackTimers.delete(playerId);
      const cur = socketPlayers.get(socket.id);
      if (!cur || cur.playerId !== playerId) return; // socket gone or re-identified
      if (liveMatchOf(cur)) return;                  // already playing something
      if (!dequeue(playerId)) return;                // paired or cancelled meanwhile
      startBotMatch(cur, pickFreeBot(), { fallback: true });
    }, QUICK_MATCH_WAIT_MS));
  }

  // Start a bot match for this player vs a specific bot. Shared by the
  // Quick Match fallback and direct bot challenges.
  function startBotMatch(sp, botId, { fallback = false } = {}) {
    const bot = BOTS[botId];

    dequeue(sp.playerId); // in case they were sitting in the matchmaking queue
    // A fallback bot game is part of an ongoing search — the player's own
    // broadcast asks must survive it. Everything else voids as usual.
    voidChallengesFor(sp.playerId, { keepOwnBroadcast: fallback });

    const p1 = { playerId: sp.playerId, playerName: sp.playerName, avatarId: sp.avatarId, socketId: socket.id };
    // Bot gets a fake socketId — io.to() on an empty room is a harmless no-op
    const p2 = { playerId: botId, playerName: bot.name, avatarId: bot.avatarId, socketId: `bot:${randomUUID()}` };
    const m = createMatch(p1, p2);
    m.isBotMatch = true;
    m.botId = botId;
    m.botProfile = bot.profile;
    console.log(`[bot] new bot match vs ${sp.playerName} — ${bot.name} (${bot.profile.name})`);
    sp.matchId = m.id;

    if (fallback) {
      m.isFallback = true;
      console.log(`[funnel] ${sp.playerName} dropped into fallback bot game — broadcast keeps running`);
    }

    m.game.addPlayer(p1.playerId, p1.playerName, p1.avatarId);
    m.game.addPlayer(p2.playerId, p2.playerName, p2.avatarId);

    socket.emit('match-found', { matchId: m.id, opponent: { name: bot.name }, fallback });
    broadcastMatchState(m);
    broadcastMatchList();
    // Other searchers re-ask this player in their new in-game (15s) context
    refreshBroadcasts();
    tryAutoStart(m);
  }

  socket.on('play-bot', ({ playerId }) => {
    if (!playerId) { socket.emit('error', { message: 'Missing player ID.' }); return; }

    const sp = socketPlayers.get(socket.id);
    if (!sp?.playerName) { socket.emit('error', { message: 'Not in lobby.' }); return; }
    if (liveMatchOf(sp)) { socket.emit('error', { message: 'Finish your current match first.' }); return; }

    startBotMatch(sp, pickFreeBot());
  });

  socket.on('cancel-match', () => {
    // Queue-only concern — never touches match state
    const sp = socketPlayers.get(socket.id);
    if (sp) { dequeue(sp.playerId); clearSearchFor(sp.playerId); }
    socket.emit('queue-cancelled', {});
  });

  socket.on('observe', ({ matchId }) => {
    const m = matches.get(matchId);
    // Ended matches linger in the map for the 90s rematch window — never let
    // anyone start observing a dead table.
    if (!m || m.ended) { socket.emit('observe-rejected', { matchId }); return; }
    m.observers.add(socket.id);
    // Send current state immediately
    io.to(socket.id).emit('game-state', {
      ...m.game.getStateFor(null),
      atTable: false, observing: true,
      matchId: m.id, turnDeadline: m.turnDeadline,
      handNumber: m.handCount,
    });
  });

  socket.on('unobserve', ({ matchId }) => {
    const m = matches.get(matchId);
    if (m) m.observers.delete(socket.id);
  });

  socket.on('player-action', ({ action, amount }) => {
    const sp = socketPlayers.get(socket.id);
    const m = liveMatchOf(sp);
    if (!m) return;
    try {
      const pre = preActionState(m.game, sp.playerId);
      m.game.handleAction(sp.playerId, action, amount);
      logAction(m, m.game, pre)
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
    // Table already reaped — nothing to vote on, send them back to the lobby
    if (!m) { sp.matchId = null; socket.emit('reset'); return; }
    // Rematch votes only exist after the match has ended (any end path)
    if (!m.ended) return;

    if (vote) {
      m.rematchVotes.add(sp.playerId);
      if (m.isBotMatch) m.rematchVotes.add(m.botId); // bot always accepts a rematch
      // Notify the other player that this player wants a rematch
      const other = matchPlayers(m).find(p => p.playerId !== sp.playerId);
      if (other) {
        io.to(other.socketId).emit('rematch-pending', { from: sp.playerName });
      }

      if (m.rematchVotes.size >= 2) {
        // Both agreed — but a rematch needs both humans still connected
        const seated = matchPlayers(m).filter(p =>
          (m.isBotMatch && p.playerId === m.botId) || socketPlayers.has(p.socketId));
        if (seated.length < 2) {
          sp.matchId = null;
          socket.emit('reset');
          return;
        }
        // Create a NEW match (not a reset of the same one)
        const { randomUUID } = require('crypto');
        const newMatchId = randomUUID();
        const newMatch = createMatch(m.p1, m.p2);
        // Override the UUID to our new one and tag the previous match
        matches.delete(newMatch.id);
        newMatch.id = newMatchId;
        newMatch.previousMatchUuid = m.id; // link back for DB
        newMatch.isBotMatch = m.isBotMatch;
        newMatch.botProfile = m.botProfile;
        newMatch.botId = m.botId;
        matches.set(newMatchId, newMatch);

        // Update socketPlayers to point to the new match
        for (const p of matchPlayers(m)) {
          const psp = socketPlayers.get(p.socketId);
          if (psp) psp.matchId = newMatchId;
        }

        // Close out the old match
        m.ended = true;
        clearTimeout(m.cleanupTimer);
        matches.delete(m.id);

        // Start the new match
        newMatch.game.addPlayer(m.p1.playerId, m.p1.playerName, m.p1.avatarId);
        newMatch.game.addPlayer(m.p2.playerId, m.p2.playerName, m.p2.avatarId);
        broadcastMatchState(newMatch);
        tryAutoStart(newMatch);
      }
    } else {
      // Player declined — both go back to lobby
      clearTimeout(m.cleanupTimer);
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
    clearSearchFor(sp.playerId);
    voidChallengesFor(sp.playerId);
    console.log('[server] disconnected:', sp.playerName || socket.id);

    // A dropped connection vacates the seat but doesn't end the match: the
    // player has one grace window (per disconnect) to come back via
    // enter-lobby, which re-seats them. The grace timer lives on the match, so
    // endMatch reaps it along with every other timer.
    const m = liveMatchOf(sp);
    if (m) {
      const seat  = matchPlayers(m).find(p => p.playerId === sp.playerId);
      const other = matchPlayers(m).find(p => p.playerId !== sp.playerId);
      if (other?.vacant) {
        // Both seats empty — nobody is at the table, close it now.
        // The player who stayed longer (this one) takes the win.
        endMatch(m, sp.playerId);
      } else if (seat) {
        seat.vacant = true;
        const graceMs = parseInt(process.env.DISCONNECT_GRACE_MS, 10) || cfg.disconnect_grace_ms || 20000;
        if (other) io.to(other.socketId).emit('opponent-disconnected', { deadline: Date.now() + graceMs });
        m.graceTimer = setTimeout(() => {
          m.graceTimer = null;
          if (m.ended) return;
          const present = matchPlayers(m).find(p => !p.vacant);
          endMatch(m, present?.playerId ?? sp.playerId);
        }, graceMs);
        console.log(`[match] ${sp.playerName} vacated seat at ${m.id.slice(0, 8)} — ${graceMs / 1000}s grace`);
      }
    }
    broadcastMatchList();
  });

  // Explicit logout — remove from socketPlayers so they disappear from online list
  socket.on('logout', () => {
    const sp = socketPlayers.get(socket.id);
    if (sp) {
      dequeue(sp.playerId);
      clearSearchFor(sp.playerId);
      voidChallengesFor(sp.playerId);
      // Logging out is deliberate — no grace, any live match is forfeited
      const m = liveMatchOf(sp);
      if (m) {
        const otherId = matchPlayers(m).find(p => p.playerId !== sp.playerId)?.playerId;
        endMatch(m, otherId ?? sp.playerId);
      }
    }
    socketPlayers.delete(socket.id);
    broadcastMatchList();
  });

  // ── Challenge flow ───────────────────────────────────────────────────────────

  socket.on('challenge-send', ({ toId }) => {
    const sp = socketPlayers.get(socket.id);
    if (!sp) return;
    if (liveMatchOf(sp)) { socket.emit('error', { message: 'Finish your current match first.' }); return; }

    // Challenging a bot: no handshake — the bot auto-accepts and the match starts now
    if (BOTS[toId]) {
      if (!sp.playerName) { socket.emit('error', { message: 'Not in lobby.' }); return; }
      if (botInMatch(toId)) { socket.emit('error', { message: `${BOTS[toId].name} is in a match. Try again soon.` }); return; }
      startBotMatch(sp, toId);
      return;
    }

    // Find target socket
    const toSocket = [...socketPlayers.entries()].find(([, s]) => s.playerId === toId);
    if (!toSocket) { socket.emit('error', { message: 'Player is not online.' }); return; }
    const [toSocketId, toSp] = toSocket;

    // Humans mid-match: bot games can be interrupted (15s to answer, then
    // auto-decline); human-vs-human games refuse instantly.
    const targetMatch = liveMatchOf(toSp);
    if (targetMatch && !targetMatch.isBotMatch) { socket.emit('error', { message: 'That player is in a match.' }); return; }

    createChallenge(sp, socket.id, toSp, toSocketId);
  });

  socket.on('challenge-accept', ({ fromId }) => {
    const sp = socketPlayers.get(socket.id);
    if (!sp) return;
    // Accepting from inside a bot game is allowed — the bot game ends, unrated.
    // A human match still blocks.
    const myMatch = liveMatchOf(sp);
    if (myMatch && !myMatch.isBotMatch) { socket.emit('error', { message: 'Finish your current match first.' }); return; }
    const key = `${fromId}:${sp.playerId}`;
    const ch  = challenges.get(key);
    if (!ch) { socket.emit('error', { message: 'Challenge expired.' }); return; }

    clearTimeout(ch.timer);
    challenges.delete(key);

    const fromSp = socketPlayers.get(ch.fromSocketId);
    if (!fromSp) { socket.emit('error', { message: 'Challenger disconnected.' }); return; }
    // The challenger may be killing time in a fallback bot game (broadcast
    // ask) — that game voids, unrated. A human match still blocks.
    const fromMatch = liveMatchOf(fromSp);
    if (fromMatch && !fromMatch.isBotMatch) { socket.emit('error', { message: 'Challenger is already in a match.' }); return; }

    dequeue(sp.playerId);
    dequeue(fromSp.playerId);
    if (myMatch) voidMatch(myMatch);
    if (fromMatch) voidMatch(fromMatch);

    // startHumanMatch voids every other challenge either player has going
    startHumanMatch(
      { playerId: fromSp.playerId, playerName: fromSp.playerName, avatarId: fromSp.avatarId, socketId: ch.fromSocketId },
      { playerId: sp.playerId,     playerName: sp.playerName,     avatarId: sp.avatarId,     socketId: socket.id },
    );
  });

  // Challenger withdraws their own pending challenge
  socket.on('challenge-withdraw', ({ toId }) => {
    const sp = socketPlayers.get(socket.id);
    if (!sp) return;
    const key = `${sp.playerId}:${toId}`;
    const ch  = challenges.get(key);
    if (!ch) return;
    clearTimeout(ch.timer);
    challenges.delete(key);
    io.to(ch.toSocketId).emit('challenge-voided', { otherId: sp.playerId });
    socket.emit('challenge-voided', { otherId: toId });
  });

  socket.on('challenge-decline', ({ fromId }) => {
    const sp  = socketPlayers.get(socket.id);
    const key = `${fromId}:${sp?.playerId}`;
    const ch  = challenges.get(key);
    if (!ch) return;
    clearTimeout(ch.timer);
    challenges.delete(key);
    if (ch.broadcast) {
      // Silent for the searcher; just don't ask this person again this session
      broadcasts.get(fromId)?.declined.add(sp.playerId);
    } else {
      io.to(ch.fromSocketId).emit('challenge-declined', { byId: sp?.playerId, byName: sp?.playerName });
    }
    if (sp) markHumanRefused(sp);
  });
});

// ── HTTP routes ───────────────────────────────────────────────────────────────

app.put('/api/player/:playerId/profile', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { displayName, avatarId } = req.body;
    if (!displayName || typeof displayName !== 'string') return res.status(400).json({ error: 'displayName required' });
    const safeName   = displayName.trim().slice(0, 20);
    const safeAvatar = validAvatars.includes(avatarId) ? avatarId : null;
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
      `SELECT p.id, p.display_name, p.avatar_id, p.is_guest, p.country,
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
      country:       r.country,
      isBot:         r.id.startsWith('bot_'),
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

// Facebook auth — upsert into players with is_guest=false
app.post('/auth/facebook', async (req, res) => {
  try {
    const { token } = req.body;
    const r = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${token}`);
    const profile = await r.json();
    if (profile.error) return res.status(401).json({ error: profile.error.message });

    const playerId = `fb_${profile.id}`;
    const name     = (profile.name || '').trim().slice(0, 20);

    const { rows } = await db.query(
      `INSERT INTO players (id, display_name, avatar_id, is_guest)
       VALUES ($1, $2, 'cigar', false)
       ON CONFLICT (id) DO UPDATE SET
         display_name=$2, last_seen_at=NOW(), is_guest=false
       RETURNING avatar_id`,
      [playerId, name]
    );
    res.json({ playerId, name, email: profile.email || null, avatarId: rows[0].avatar_id });
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

// ── In-game feedback ──────────────────────────────────────────────────────────
const FEEDBACK_TYPES = ['bug', 'game_issue', 'feedback'];

app.post('/api/feedback', async (req, res) => {
  try {
    const { type, details, playerId, playerName } = req.body || {};
    if (!FEEDBACK_TYPES.includes(type)) return res.status(400).json({ error: 'invalid type' });
    const text = (details || '').trim();
    if (!text) return res.status(400).json({ error: 'details required' });
    await db.query(
      `INSERT INTO feedback (type, details, player_id, player_name) VALUES ($1, $2, $3, $4)`,
      [type, text.slice(0, 5000), playerId || null, playerName || null]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/feedback', async (_, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, type, details, player_id, player_name, created_at
      FROM feedback ORDER BY created_at DESC
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

app.get('/admin/feedback', (_, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Poker Monkey — In-Game Feedback</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace; min-height: 100vh; padding: 40px 16px; }
    h1 { font-size: 1.4rem; color: #f0c040; margin-bottom: 8px; letter-spacing: 1px; }
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
    .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .toolbar select, .toolbar input { background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #e6edf3; font-size: 0.9rem; padding: 7px 12px; outline: none; }
    .toolbar input { width: 260px; }
    .toolbar select:focus, .toolbar input:focus { border-color: #f0c040; }
    .count { color: #8b949e; font-size: 0.85rem; }
    .wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; background: #161b22; border: 1px solid #30363d; border-radius: 10px; overflow: hidden; font-size: 0.85rem; }
    th { background: #1c2128; color: #8b949e; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 10px 14px; text-align: left; white-space: nowrap; cursor: pointer; user-select: none; }
    th:hover { color: #e6edf3; }
    th.asc::after  { content: ' ↑'; color: #f0c040; }
    th.desc::after { content: ' ↓'; color: #f0c040; }
    td { padding: 9px 14px; border-top: 1px solid #21262d; vertical-align: top; }
    td.date { color: #8b949e; font-size: 0.8rem; white-space: nowrap; }
    td.name { color: #e6edf3; white-space: nowrap; }
    td.details { color: #e6edf3; white-space: pre-wrap; min-width: 320px; max-width: 640px; }
    .badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; }
    .badge.bug        { background: #3d1518; color: #ff7b72; }
    .badge.game_issue { background: #3d2e15; color: #f0c040; }
    .badge.feedback   { background: #16321f; color: #56d364; }
    tr:hover td { background: #1c2128; }
  </style>
</head>
<body>
  <h1>💬 In-Game Feedback</h1>

  <div id="auth">
    <label>Password</label>
    <input type="password" id="pw" placeholder="Enter password" />
    <div class="err" id="err">Wrong password</div>
    <button onclick="login()">Enter</button>
  </div>

  <div id="main">
    <div class="nav"><a href="/admin">← Admin home</a></div>
    <div class="toolbar">
      <select id="typeFilter" onchange="render()">
        <option value="">All types</option>
        <option value="bug">Bug</option>
        <option value="game_issue">Game issue</option>
        <option value="feedback">Feedback</option>
      </select>
      <input type="text" id="search" placeholder="Search details or player…" oninput="render()" />
      <span class="count" id="count"></span>
    </div>
    <div class="wrap"><table>
      <thead><tr id="thead"></tr></thead>
      <tbody id="tbody"></tbody>
    </table></div>
  </div>

  <script>
    const PASSWORD = '1111';
    const TYPE_LABELS = { bug: 'Bug', game_issue: 'Game issue', feedback: 'Feedback' };
    const COLS = [
      { key: 'type',        label: 'Type' },
      { key: 'details',     label: 'Details',  cls: 'details' },
      { key: 'player_name', label: 'Player',   cls: 'name', fmt: v => v ?? '—' },
      { key: 'created_at',  label: 'Received', cls: 'date', fmt: v => v ? new Date(v).toLocaleString() : '—' },
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
      if (key === 'created_at') return new Date(v).getTime();
      return ('' + v).toLowerCase();
    }

    function render() {
      const q = document.getElementById('search').value.toLowerCase();
      const typeF = document.getElementById('typeFilter').value;
      let rows = allRows.filter(r =>
        (!typeF || r.type === typeF) &&
        (!q || (r.details ?? '').toLowerCase().includes(q) || (r.player_name ?? '').toLowerCase().includes(q))
      );
      rows.sort((a, b) => {
        const av = sortVal(a, sortCol), bv = sortVal(b, sortCol);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      });
      document.getElementById('count').textContent = rows.length + ' report' + (rows.length === 1 ? '' : 's');
      const tbody = document.getElementById('tbody');
      tbody.innerHTML = '';
      rows.forEach(row => {
        const tr = document.createElement('tr');
        COLS.forEach(col => {
          const td = document.createElement('td');
          if (col.cls) td.className = col.cls;
          if (col.key === 'type') {
            const span = document.createElement('span');
            span.className = 'badge ' + row.type;
            span.textContent = TYPE_LABELS[row.type] || row.type;
            td.appendChild(span);
          } else {
            td.textContent = col.fmt ? col.fmt(row[col.key]) : (row[col.key] ?? '');
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    async function load() {
      allRows = await fetch('/api/admin/feedback').then(r => r.json());
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
        sessionStorage.setItem('adminAuth', '1');
        showMain();
      } else { document.getElementById('err').style.display = 'block'; }
    }
    function showMain() {
      document.getElementById('auth').style.display = 'none';
      document.getElementById('main').style.display = 'block';
      onLogin();
    }
    if (sessionStorage.getItem('adminAuth') === '1') showMain();
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
        <div style="font-size:0.82rem;color:#8b949e">Starting chips, turn timer, hand delays</div>
      </a>
      <a href="/admin/match-format" style="display:block;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px 24px;text-decoration:none;color:#e6edf3">
        <div style="font-size:1rem;font-weight:700;margin-bottom:4px">🏁 Match Format</div>
        <div style="font-size:0.82rem;color:#8b949e">Blind escalation schedule — hands per level, blind levels</div>
      </a>
      <a href="/admin/ui-config" style="display:block;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px 24px;text-decoration:none;color:#e6edf3">
        <div style="font-size:1rem;font-weight:700;margin-bottom:4px">🎨 UI Config</div>
        <div style="font-size:0.82rem;color:#8b949e">Animation timings, deal speed, reveal delays</div>
      </a>
      <a href="/admin/music" style="display:block;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px 24px;text-decoration:none;color:#e6edf3">
        <div style="font-size:1rem;font-weight:700;margin-bottom:4px">♪ Music</div>
        <div style="font-size:0.82rem;color:#8b949e">Enable/disable each track per interface — menu vs in-game</div>
      </a>
      <a href="/admin/players" style="display:block;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px 24px;text-decoration:none;color:#e6edf3">
        <div style="font-size:1rem;font-weight:700;margin-bottom:4px">👥 Players</div>
        <div style="font-size:0.82rem;color:#8b949e">All registered and guest players, ELO, match history</div>
      </a>
      <a href="/admin/feedback" style="display:block;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px 24px;text-decoration:none;color:#e6edf3">
        <div style="font-size:1rem;font-weight:700;margin-bottom:4px">💬 In-Game Feedback</div>
        <div style="font-size:0.82rem;color:#8b949e">Player-submitted bug reports, game issues, and feedback</div>
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

app.get('/admin/match-format', (_, res) => res.send(ADMIN_SHELL('Match Format', `
  <h1>♠ Match Format</h1>
  <div class="nav"><a href="/admin">← Admin</a></div>
  ${ADMIN_AUTH_BLOCK}
  <div id="main" style="max-width:680px">
    <div style="background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px 20px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <span style="font-size:0.9rem">Blinds increase every</span>
      <input type="number" id="hands-per-level" min="1" oninput="render()" style="background:#0d1117;border:1px solid #30363d;border-radius:5px;color:#e6edf3;font-size:0.9rem;padding:6px 10px;width:70px;text-align:right;outline:none" />
      <span style="font-size:0.9rem">hands</span>
    </div>
    <table><thead><tr><th>Level</th><th>Hand #</th><th>Small blind</th><th>Big blind</th><th>Stack depth</th><th></th></tr></thead>
    <tbody id="fmt-body"></tbody></table>
    <div style="display:flex;justify-content:space-between;margin-top:16px">
      <button onclick="addLevel()" style="background:none;border:1px solid #30363d;color:#8b949e;border-radius:6px;padding:6px 14px;font-size:0.8rem;cursor:pointer">+ Add level</button>
      <button id="save-btn" onclick="saveAll()" style="background:#238636;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:0.85rem;cursor:pointer;font-weight:600">Save</button>
    </div>
    <div id="fmt-err" style="color:#f85149;font-size:0.85rem;margin-top:10px;display:none"></div>
  </div>`, `
  let levels = [];
  let startingChips = 1000;
  async function onLogin() { load(); }
  async function load() {
    const f = await fetch('/api/admin/match-format').then(r => r.json());
    levels = f.levels;
    startingChips = f.startingChips;
    document.getElementById('hands-per-level').value = f.handsPerLevel;
    render();
  }
  function render() {
    const per = Math.max(1, Number(document.getElementById('hands-per-level').value) || 1);
    const tbody = document.getElementById('fmt-body');
    tbody.innerHTML = '';
    levels.forEach((l, i) => {
      const last = i === levels.length - 1;
      const range = (i * per + 1) + '\\u2013' + ((i + 1) * per) + (last ? '+' : '');
      const depth = l.bb > 0 ? Math.round(startingChips / l.bb) + ' BB' : '\\u2014';
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="key">' + (i + 1) + '</td>'
        + '<td class="desc">' + range + '</td>'
        + '<td class="val"><input type="number" min="1" value="' + l.sb + '" oninput="levels[' + i + '].sb=Number(this.value);renderDepths()" /></td>'
        + '<td class="val"><input type="number" min="1" value="' + l.bb + '" oninput="levels[' + i + '].bb=Number(this.value);renderDepths()" /></td>'
        + '<td class="desc" id="depth-' + i + '">' + depth + '</td>'
        + '<td class="action">' + (levels.length > 1 ? '<button style="background:#da3633" onclick="removeLevel(' + i + ')">\\u2715</button>' : '') + '</td>';
      tbody.appendChild(tr);
    });
  }
  function renderDepths() {
    levels.forEach((l, i) => {
      const el = document.getElementById('depth-' + i);
      if (el) el.textContent = l.bb > 0 ? Math.round(startingChips / l.bb) + ' BB' : '\\u2014';
    });
  }
  function addLevel() {
    const last = levels[levels.length - 1] || { sb: 10, bb: 20 };
    levels.push({ sb: last.sb * 2, bb: last.bb * 2 });
    render();
  }
  function removeLevel(i) { levels.splice(i, 1); render(); }
  async function saveAll() {
    const btn = document.getElementById('save-btn');
    const err = document.getElementById('fmt-err');
    err.style.display = 'none';
    const res = await fetch('/admin/match-format', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handsPerLevel: Number(document.getElementById('hands-per-level').value), levels }),
    });
    if (res.ok) {
      btn.textContent = '\\u2713 Saved';
      setTimeout(() => { btn.textContent = 'Save'; }, 2000);
      load();
    } else {
      const j = await res.json().catch(() => ({}));
      err.textContent = j.error || 'Save failed';
      err.style.display = 'block';
    }
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

app.get('/api/admin/match-format', (_, res) => {
  res.json({ handsPerLevel: fmt.handsPerLevel, levels: fmt.levels, startingChips: cfg.starting_chips });
});

app.put('/admin/match-format', async (req, res) => {
  try {
    const { handsPerLevel, levels } = req.body;
    const per = Number(handsPerLevel);
    if (!Number.isInteger(per) || per < 1) return res.status(400).json({ error: 'handsPerLevel must be a positive integer' });
    if (!Array.isArray(levels) || !levels.length) return res.status(400).json({ error: 'at least one blind level required' });
    for (const l of levels) {
      if (!Number.isInteger(l?.sb) || !Number.isInteger(l?.bb) || l.sb < 1 || l.bb < l.sb) {
        return res.status(400).json({ error: 'each level needs integer blinds with 1 <= small blind <= big blind' });
      }
    }
    const clean = levels.map(l => ({ sb: l.sb, bb: l.bb }));
    await db.query('UPDATE match_format SET value=$1 WHERE key=$2', [String(per), 'hands_per_level']);
    await db.query('UPDATE match_format SET value=$1 WHERE key=$2', [serializeLevels(clean), 'blind_levels']);
    fmt = { handsPerLevel: per, levels: clean };
    res.json({ ok: true, ...fmt });
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

// ── Legal pages ───────────────────────────────────────────────────────────────
app.get('/privacy-policy', (_, res) => res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Privacy Policy — Poker Monkey</title>
<style>body{font-family:sans-serif;max-width:680px;margin:40px auto;padding:0 20px;color:#222;line-height:1.6}h1{font-size:1.6rem}h2{font-size:1.1rem;margin-top:2rem}a{color:#0066cc}</style>
</head><body>
<h1>Privacy Policy</h1>
<p><strong>Last updated: June 2025</strong></p>
<p>Poker Monkey ("we", "us") operates the Poker Monkey mobile and web application. This policy explains what data we collect and how we use it.</p>
<h2>Information We Collect</h2>
<ul>
  <li><strong>Google Sign-In:</strong> When you log in with Google, we receive your Google user ID, display name, and profile photo URL. We do not receive your email address or password.</li>
  <li><strong>Guest accounts:</strong> If you play as a guest, we generate a random identifier stored on your device. No personal information is collected.</li>
  <li><strong>Gameplay data:</strong> We store match history, hand history, and ELO ratings associated with your account.</li>
</ul>
<h2>How We Use Your Data</h2>
<p>We use your data solely to operate the game: to identify you across sessions, track your match history, and calculate your ELO rating. We do not sell, share, or use your data for advertising.</p>
<h2>Data Retention</h2>
<p>Your data is retained as long as your account exists. You may request deletion at any time via our <a href="/data-deletion">data deletion page</a>.</p>
<h2>Contact</h2>
<p>Questions? Email us at <a href="mailto:brian.danilo@gmail.com">brian.danilo@gmail.com</a>.</p>
</body></html>`));

app.get('/data-deletion', (_, res) => res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Data Deletion — Poker Monkey</title>
<style>body{font-family:sans-serif;max-width:680px;margin:40px auto;padding:0 20px;color:#222;line-height:1.6}h1{font-size:1.6rem}h2{font-size:1.1rem;margin-top:2rem}a{color:#0066cc}</style>
</head><body>
<h1>Data Deletion Request</h1>
<p>You can request deletion of all data associated with your Poker Monkey account at any time.</p>
<h2>What gets deleted</h2>
<ul>
  <li>Your player profile (display name, avatar)</li>
  <li>Your match and hand history</li>
  <li>Your ELO rating</li>
  <li>Any association between your Google account and Poker Monkey</li>
</ul>
<h2>How to request deletion</h2>
<p>Send an email to <a href="mailto:brian.danilo@gmail.com">brian.danilo@gmail.com</a> with the subject line <strong>"Data Deletion Request"</strong> and include your in-game username or Google account email. We will process your request within 7 days and confirm by reply.</p>
</body></html>`));

app.get('/terms', (_, res) => res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Terms of Service — Poker Monkey</title>
<style>body{font-family:sans-serif;max-width:680px;margin:40px auto;padding:0 20px;color:#222;line-height:1.6}h1{font-size:1.6rem}h2{font-size:1.1rem;margin-top:2rem}a{color:#0066cc}</style>
</head><body>
<h1>Terms of Service</h1>
<p><strong>Last updated: June 2025</strong></p>
<p>By accessing or using Poker Monkey ("the App"), you agree to these Terms of Service. If you do not agree, do not use the App.</p>
<h2>1. Use of the App</h2>
<p>Poker Monkey is a free-to-play online poker game. You must be at least 13 years old to use the App. No real money is wagered — all chips are virtual and have no monetary value.</p>
<h2>2. Accounts</h2>
<p>You are responsible for maintaining the confidentiality of your account. You agree not to share your account, impersonate others, or use the App in any way that violates applicable law.</p>
<h2>3. Acceptable Use</h2>
<p>You agree not to cheat, use bots or automated tools, exploit bugs, harass other players, or attempt to disrupt the service. We reserve the right to suspend or terminate accounts that violate these terms.</p>
<h2>4. Intellectual Property</h2>
<p>All content in the App — including graphics, code, and game mechanics — is owned by or licensed to Poker Monkey. You may not copy, modify, or distribute any part of the App without written permission.</p>
<h2>5. Disclaimers</h2>
<p>The App is provided "as is" without warranties of any kind. We do not guarantee uninterrupted or error-free operation. Your use of the App is at your own risk.</p>
<h2>6. Limitation of Liability</h2>
<p>To the fullest extent permitted by law, Poker Monkey shall not be liable for any indirect, incidental, or consequential damages arising from your use of the App.</p>
<h2>7. Changes to These Terms</h2>
<p>We may update these Terms at any time. Continued use of the App after changes constitutes acceptance of the revised Terms.</p>
<h2>8. Contact</h2>
<p>Questions? Email us at <a href="mailto:brian.danilo@gmail.com">brian.danilo@gmail.com</a>.</p>
</body></html>`));

// ── Music config routes (must be before catch-all) ───────────────────────────

// Public — the client builds its menu/in-game playlists from this
app.get('/api/music-config', async (_, res) => {
  try {
    const { rows } = await db.query('SELECT track_key, menu, game FROM music_tracks ORDER BY sort, track_key');
    res.json({
      menu: rows.filter(r => r.menu).map(r => r.track_key),
      game: rows.filter(r => r.game).map(r => r.track_key),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin — full list with per-interface flags
app.get('/api/admin/music', async (_, res) => {
  try {
    const { rows } = await db.query('SELECT track_key, label, menu, game FROM music_tracks ORDER BY sort, track_key');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin — save which tracks are active per interface
app.post('/admin/music', async (req, res) => {
  try {
    const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks : [];
    for (const t of tracks) {
      if (!t || typeof t.track_key !== 'string') continue;
      await db.query('UPDATE music_tracks SET menu=$1, game=$2 WHERE track_key=$3',
        [!!t.menu, !!t.game, t.track_key]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/music', (_, res) => res.send(ADMIN_SHELL('Music', `
  <h1>♪ Music</h1>
  <div class="nav"><a href="/admin">← Admin</a></div>
  ${ADMIN_AUTH_BLOCK}
  <div id="main" style="max-width:680px">
    <p style="color:#8b949e;font-size:0.82rem;margin-bottom:16px">Check which tracks play in each interface. <strong>Menu</strong> = login &amp; lobby screens. <strong>In-game</strong> = at the table. Multiple in-game tracks rotate; a single track loops.</p>
    <table><thead><tr><th>Track</th><th style="text-align:center">Menu</th><th style="text-align:center">In-game</th></tr></thead>
    <tbody id="music-body"></tbody></table>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
      <button id="save-btn" onclick="saveAll()" style="background:#238636;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:0.9rem;font-weight:600;cursor:pointer">Save</button>
      <button onclick="load()" style="background:none;border:1px solid #30363d;color:#8b949e;border-radius:6px;padding:8px 16px;font-size:0.8rem;cursor:pointer">↺ Reload</button>
    </div>
  </div>`, `
  async function onLogin() { load(); }
  async function load() {
    const rows = await fetch('/api/admin/music').then(r => r.json());
    const tbody = document.getElementById('music-body');
    tbody.innerHTML = '';
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = \`<td><div style="font-weight:600">\${row.label}</div><div class="desc" style="font-family:monospace">\${row.track_key}</div></td>\` +
        \`<td style="text-align:center"><input type="checkbox" data-key="\${row.track_key}" data-col="menu" \${row.menu?'checked':''} style="width:18px;height:18px;cursor:pointer"></td>\` +
        \`<td style="text-align:center"><input type="checkbox" data-key="\${row.track_key}" data-col="game" \${row.game?'checked':''} style="width:18px;height:18px;cursor:pointer"></td>\`;
      tbody.appendChild(tr);
    }
  }
  async function saveAll() {
    const map = {};
    document.querySelectorAll('#music-body input[type=checkbox]').forEach(cb => {
      const k = cb.dataset.key;
      if (!map[k]) map[k] = { track_key: k, menu: false, game: false };
      map[k][cb.dataset.col] = cb.checked;
    });
    const btn = document.getElementById('save-btn');
    const res = await fetch('/admin/music', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ tracks: Object.values(map) }) });
    btn.textContent = res.ok ? '✓ Saved' : 'Error';
    setTimeout(() => { btn.textContent = 'Save'; }, 2000);
  }`)));

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

app.get('/api/avatars', async (_, res) => {
  const { rows } = await db.query('SELECT avatar_id, display_name, image_key FROM avatars ORDER BY avatar_id');
  res.json(rows);
});

// ── Game config ───────────────────────────────────────────────────────────────

async function loadGameConfig() {
  const defaults = [
    ['starting_chips',     1000, 'Starting chip count per player'],
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

    // small_blind/big_blind are superseded by the match_format blind schedule —
    // drop the rows so the admin Game Config page doesn't show dead knobs
    await db.query(`DELETE FROM game_config WHERE key IN ('small_blind', 'big_blind')`);

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

// ── Match format ──────────────────────────────────────────────────────────────

async function loadMatchFormat() {
  const defaults = [
    ['hands_per_level', String(DEFAULT_FORMAT.handsPerLevel), 'Hands played at each blind level before blinds increase'],
    ['blind_levels',    serializeLevels(DEFAULT_FORMAT.levels), 'Blind schedule, comma-separated sb/bb pairs'],
  ];

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS match_format (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        description TEXT
      )
    `);

    for (const [key, value, description] of defaults) {
      await db.query(
        `INSERT INTO match_format (key, value, description) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
        [key, value, description]
      );
    }

    const { rows } = await db.query('SELECT key, value FROM match_format');
    const raw = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const handsPerLevel = Math.max(1, Math.floor(Number(raw.hands_per_level)) || DEFAULT_FORMAT.handsPerLevel);
    const levels = parseLevels(raw.blind_levels) || DEFAULT_FORMAT.levels;
    const loaded = { handsPerLevel, levels };
    console.log('[format] loaded:', handsPerLevel, 'hands/level,', serializeLevels(levels));
    return loaded;
  } catch (e) {
    console.error('[format] DB unavailable, using defaults:', e.message);
    return DEFAULT_FORMAT;
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

async function initAvatars() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS avatars (
      avatar_id    TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      image_key    TEXT NOT NULL
    )
  `);
  const seeds = [
    ['captain', 'Captain Flint', 'captain'],  // default
    ['queen',   'Pearl',         'queen'],
    ['banana',  'Banjo',         'banana'],
    ['lemur',   'Skip',          'lemur'],
    ['baboon',  'Mad Jack',      'baboon'],
    ['sailor',  'Big Buck',      'sailor'],
    ['cigar',   'Don Rumbo',     'cigar'],
    ['parrot',  'Snitch',        'parrot'],
  ];
  for (const [id, name, key] of seeds) {
    await db.query(
      `INSERT INTO avatars (avatar_id, display_name, image_key) VALUES ($1, $2, $3)
       ON CONFLICT (avatar_id) DO UPDATE SET display_name = EXCLUDED.display_name, image_key = EXCLUDED.image_key`,
      [id, name, key]
    );
  }
  // Migrate any players with stale avatar_ids to the default ('captain')
  await db.query(`UPDATE players SET avatar_id = 'captain' WHERE avatar_id NOT IN (SELECT avatar_id FROM avatars)`);
  // Add FK constraint if not already present
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_players_avatar' AND table_name = 'players'
      ) THEN
        ALTER TABLE players ADD CONSTRAINT fk_players_avatar FOREIGN KEY (avatar_id) REFERENCES avatars(avatar_id);
      END IF;
    END $$
  `);
  const { rows } = await db.query('SELECT avatar_id FROM avatars ORDER BY avatar_id');
  const ids = rows.map(r => r.avatar_id);
  console.log('[avatars] loaded:', ids);
  return ids;
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3843;

async function initBots() {
  for (const [id, b] of Object.entries(BOTS)) {
    await db.query(
      `INSERT INTO players (id, display_name, avatar_id, is_guest)
       VALUES ($1, $2, $3, false)
       ON CONFLICT (id) DO UPDATE SET display_name=$2, avatar_id=$3, last_seen_at=NOW()`,
      [id, b.name, b.avatarId]
    ).catch(e => console.error(`[bots] upsert ${id} failed:`, e.message));
  }
  // Seed bot ELOs so the lobby list shows them before their first match
  await db.query('SELECT player_id, elo FROM player_stats WHERE player_id = ANY($1)', [Object.keys(BOTS)])
    .then(({ rows }) => rows.forEach(r => { eloCache[r.player_id] = r.elo; }))
    .catch(e => console.error('[bots] elo seed failed:', e.message));
  console.log('[bots] online:', Object.values(BOTS).map(b => `${b.name} (${b.profile.name})`).join(', '));
}

async function ensureFeedbackTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id          SERIAL PRIMARY KEY,
        type        TEXT NOT NULL,
        details     TEXT NOT NULL,
        player_id   TEXT,
        player_name TEXT,
        created_at  TIMESTAMPTZ DEFAULT now()
      )
    `);
    console.log('[feedback] table ready');
  } catch (e) {
    console.error('[feedback] table init failed:', e.message);
  }
}

async function initMusicTracks() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS music_tracks (
        track_key TEXT PRIMARY KEY,
        label     TEXT NOT NULL,
        menu      BOOLEAN NOT NULL DEFAULT false,
        game      BOOLEAN NOT NULL DEFAULT false,
        sort      INT NOT NULL DEFAULT 0
      )
    `);
    const seeds = [
      ['chill-tropics', 'Chill Tropics', true,  false, 1],
      ['fun-caribbean', 'Fun Caribbean', false, true,  2],
    ];
    // Tracks no longer shipped in the client build
    await db.query(`DELETE FROM music_tracks WHERE track_key IN ('pirates', 'epic-celtic')`);
    for (const [key, label, menu, game, sort] of seeds) {
      await db.query(
        `INSERT INTO music_tracks (track_key, label, menu, game, sort)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (track_key) DO NOTHING`,
        [key, label, menu, game, sort]
      );
    }
    console.log('[music] tracks ready');
  } catch (e) {
    console.error('[music] init failed:', e.message);
  }
}

async function start() {
  await redis.connect().catch(e => console.error('[redis] connect failed:', e.message));
  await ensureFeedbackTable();
  await initMusicTracks();
  cfg = await loadGameConfig();
  fmt = await loadMatchFormat();
  uiCfg = await loadUiConfig();
  validAvatars = await initAvatars();
  await initBots();
  server.listen(PORT, () => console.log(`Poker server on port ${PORT}`));
}

start();
