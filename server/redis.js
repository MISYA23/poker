const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true });

redis.on('connect',       () => console.log('[redis] connected'));
redis.on('error',         (e) => console.error('[redis] error:', e.message));
redis.on('reconnecting',  () => console.log('[redis] reconnecting...'));

// ── Snapshot ──────────────────────────────────────────────────────────────────
// Full game state for a room — updated on every action for crash recovery.

async function setSnapshot(roomId, state) {
  await redis.set(`room:${roomId}:snapshot`, JSON.stringify(state));
}

async function getSnapshot(roomId) {
  const data = await redis.get(`room:${roomId}:snapshot`);
  return data ? JSON.parse(data) : null;
}

// ── Hand event log ────────────────────────────────────────────────────────────
// Append-only stream of every event in a hand. Flushed to Postgres at hand end.

function handKey(roomId, handUuid) {
  return `room:${roomId}:hand:${handUuid}:events`;
}

async function logEvent(roomId, handUuid, event) {
  await redis.xadd(handKey(roomId, handUuid), '*', 'e', JSON.stringify(event));
}

async function getHandEvents(roomId, handUuid) {
  const entries = await redis.xrange(handKey(roomId, handUuid), '-', '+');
  return entries.map(([, fields]) => JSON.parse(fields[1]));
}

async function clearHandEvents(roomId, handUuid) {
  await redis.del(handKey(roomId, handUuid));
}

module.exports = { redis, setSnapshot, getSnapshot, logEvent, getHandEvents, clearHandEvents };
