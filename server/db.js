require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tables (
      id        SERIAL PRIMARY KEY,
      uuid      TEXT UNIQUE NOT NULL,
      status    TEXT NOT NULL DEFAULT 'active',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS players (
      id             SERIAL PRIMARY KEY,
      table_id       INTEGER REFERENCES tables(id),
      google_sub     TEXT,
      display_name   TEXT NOT NULL,
      avatar_id      TEXT,
      starting_chips INTEGER,
      final_chips    INTEGER,
      joined_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      left_at        TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS hands (
      id              SERIAL PRIMARY KEY,
      table_id        INTEGER REFERENCES tables(id),
      hand_number     INTEGER NOT NULL,
      started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at        TIMESTAMPTZ,
      pot             INTEGER,
      community_cards JSONB,
      winner_name     TEXT,
      winning_hand    TEXT
    );

    CREATE TABLE IF NOT EXISTS actions (
      id              SERIAL PRIMARY KEY,
      hand_id         INTEGER REFERENCES hands(id),
      table_id        INTEGER REFERENCES tables(id),
      player_name     TEXT,
      google_sub      TEXT,
      action_type     TEXT NOT NULL,
      amount          INTEGER,
      phase           TEXT,
      sequence_number INTEGER NOT NULL DEFAULT 0,
      timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata        JSONB
    );
  `);
  console.log('[db] schema ready');
}

// ── Tables ────────────────────────────────────────────────────────────────────

async function createTable(uuid) {
  const { rows } = await pool.query(
    `INSERT INTO tables (uuid) VALUES ($1) RETURNING id`, [uuid]
  );
  return rows[0].id;
}

async function completeTable(uuid) {
  await pool.query(
    `UPDATE tables SET status='completed', completed_at=NOW() WHERE uuid=$1`, [uuid]
  );
}

// ── Players ───────────────────────────────────────────────────────────────────

async function addPlayer(tableId, { googleSub, name, avatarId, startingChips }) {
  const { rows } = await pool.query(
    `INSERT INTO players (table_id, google_sub, display_name, avatar_id, starting_chips)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [tableId, googleSub || null, name, avatarId || null, startingChips]
  );
  return rows[0].id;
}

async function updatePlayerFinal(tableId, name, finalChips) {
  await pool.query(
    `UPDATE players SET final_chips=$1, left_at=NOW()
     WHERE table_id=$2 AND display_name=$3 AND left_at IS NULL`,
    [finalChips, tableId, name]
  );
}

// ── Hands ─────────────────────────────────────────────────────────────────────

async function startHand(tableId, handNumber) {
  const { rows } = await pool.query(
    `INSERT INTO hands (table_id, hand_number) VALUES ($1, $2) RETURNING id`,
    [tableId, handNumber]
  );
  return rows[0].id;
}

async function completeHand(handId, { pot, communityCards, winnerName, winningHand }) {
  await pool.query(
    `UPDATE hands SET ended_at=NOW(), pot=$1, community_cards=$2, winner_name=$3, winning_hand=$4
     WHERE id=$5`,
    [pot, JSON.stringify(communityCards), winnerName, winningHand, handId]
  );
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function logAction(tableId, handId, seq, {
  playerName, googleSub, actionType, amount, phase, metadata,
}) {
  await pool.query(
    `INSERT INTO actions
       (table_id, hand_id, player_name, google_sub, action_type, amount, phase, sequence_number, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      tableId, handId,
      playerName || null, googleSub || null,
      actionType, amount || null, phase || null,
      seq,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

// ── Hand history queries ───────────────────────────────────────────────────────

async function getHandsForTable(tableId) {
  const { rows } = await pool.query(
    `SELECT id, hand_number, started_at, ended_at, pot, community_cards, winner_name, winning_hand
     FROM hands WHERE table_id = $1 ORDER BY hand_number ASC`,
    [tableId]
  );
  return rows;
}

async function getActionsForHand(handId) {
  const { rows } = await pool.query(
    `SELECT id, sequence_number, action_type, player_name, google_sub, amount, phase, timestamp, metadata
     FROM actions WHERE hand_id = $1 ORDER BY sequence_number ASC`,
    [handId]
  );
  return rows;
}

module.exports = { migrate, createTable, completeTable, addPlayer, updatePlayerFinal, startHand, completeHand, logAction, getHandsForTable, getActionsForHand };
