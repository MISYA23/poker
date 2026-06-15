// Achievement award engine. Call initAchievements(db, io, socketPlayers) once
// after the server is up, then use the returned functions everywhere.

const HAND_TO_KEY = {
  'Straight':       'got_straight',
  'Flush':          'got_flush',
  'Full House':     'got_full_house',
  'Four of a Kind': 'got_quads',
  'Straight Flush': 'got_straight_flush',
  'Royal Flush':    'got_royal_flush',
};

// All known keys in canonical order — used to build the full achievements list
// for the /api endpoint so every player gets all 11 entries (earned or not).
const ALL_KEYS = [
  'beat_bot', 'beat_human', 'back_to_back', 'seven_in_a_row',
  'got_straight', 'got_flush', 'got_full_house', 'got_quads',
  'got_straight_flush', 'got_royal_flush', 'beat_friend',
];

function initAchievements(db, io, socketPlayers) {

  // Insert one achievement row. No-ops (via ON CONFLICT) if already earned.
  // Emits `achievement-earned` to the player's current socket if it's new.
  async function awardAchievement(playerId, key) {
    try {
      const { rowCount } = await db.query(
        `INSERT INTO achievements (player_id, achievement_key)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [playerId, key]
      );
      if (rowCount === 0) return; // already had it

      // isFirst = this is their very first achievement ever
      const { rows } = await db.query(
        `SELECT COUNT(*) AS cnt FROM achievements WHERE player_id=$1`,
        [playerId]
      );
      const isFirst = parseInt(rows[0].cnt, 10) === 1;

      // Find and emit to the player's live socket
      for (const [sid, sp] of socketPlayers.entries()) {
        if (sp.playerId === playerId) {
          const sock = io.sockets.sockets.get(sid);
          if (sock) sock.emit('achievement-earned', { key, isFirst });
          break;
        }
      }
    } catch (err) {
      console.error('[achievement] award failed:', err.message);
    }
  }

  // Current win-streak in calendar days (in the player's stored timezone).
  // Newest day first; breaks at the first non-consecutive gap.
  async function getCurrentStreak(playerId, timezone) {
    const tz = timezone || 'UTC';
    const { rows } = await db.query(
      `SELECT ended_at FROM matches WHERE winner_id=$1 AND status='complete' ORDER BY ended_at DESC`,
      [playerId]
    );
    const seen = new Set();
    const days = [];
    for (const r of rows) {
      const day = new Date(r.ended_at).toLocaleDateString('en-CA', { timeZone: tz });
      if (!seen.has(day)) { seen.add(day); days.push(day); }
    }
    if (!days.length) return 0;
    let streak = 1;
    for (let i = 0; i < days.length - 1; i++) {
      const diff = Math.round((new Date(days[i]) - new Date(days[i + 1])) / 86400000);
      if (diff === 1) streak++;
      else break;
    }
    return streak;
  }

  // Called from persistMatchResult (index.js) after the match row is in the DB.
  async function checkMatchAchievements(winnerId, isBotMatch) {
    await awardAchievement(winnerId, isBotMatch ? 'beat_bot' : 'beat_human');

    const { rows } = await db.query('SELECT timezone FROM players WHERE id=$1', [winnerId]);
    const streak = await getCurrentStreak(winnerId, rows[0]?.timezone || 'UTC');
    if (streak >= 2) await awardAchievement(winnerId, 'back_to_back');
    if (streak >= 7) await awardAchievement(winnerId, 'seven_in_a_row');
  }

  // Called from flushHandToDb (handLogger.js) after the hand row is in the DB.
  // Fire-and-forget — hand flush must not block on this.
  function checkHandAchievement(winnerId, handName) {
    const key = HAND_TO_KEY[handName];
    if (key) awardAchievement(winnerId, key).catch(e => console.error('[achievement] hand award failed:', e.message));
  }

  // Full achievements list for one player — used by the /api endpoint.
  async function getPlayerAchievements(playerId) {
    const [earnedRes, tzRes] = await Promise.all([
      db.query('SELECT achievement_key FROM achievements WHERE player_id=$1', [playerId]),
      db.query('SELECT timezone FROM players WHERE id=$1', [playerId]),
    ]);
    const earnedKeys = new Set(earnedRes.rows.map(r => r.achievement_key));
    const streak = await getCurrentStreak(playerId, tzRes.rows[0]?.timezone || 'UTC');

    return ALL_KEYS.map(key => {
      const earned = earnedKeys.has(key);
      const item = { id: key, earned };
      if (key === 'back_to_back')   item.progress = { current: Math.min(streak, 2), target: 2 };
      if (key === 'seven_in_a_row') item.progress = { current: Math.min(streak, 7), target: 7 };
      return item;
    });
  }

  return { awardAchievement, checkMatchAchievements, checkHandAchievement, getPlayerAchievements };
}

module.exports = { initAchievements };
