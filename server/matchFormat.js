// Match format — escalating blind schedule.
//
// A match is played in levels: every `handsPerLevel` hands the blinds move to
// the next entry in `levels`. Past the last entry the blinds stay at the final
// level. Stored in the match_format table (TEXT values), edited in the admin
// tool at /admin/match-format.

const DEFAULT_FORMAT = {
  handsPerLevel: 5,
  levels: [
    { sb: 10,  bb: 20 },
    { sb: 15,  bb: 30 },
    { sb: 25,  bb: 50 },
    { sb: 50,  bb: 100 },
    { sb: 100, bb: 200 },
  ],
};

// '10/20,15/30' → [{ sb: 10, bb: 20 }, { sb: 15, bb: 30 }] — null if invalid
function parseLevels(str) {
  if (typeof str !== 'string' || !str.trim()) return null;
  const levels = [];
  for (const part of str.split(',')) {
    const m = part.trim().match(/^(\d+)\/(\d+)$/);
    if (!m) return null;
    const sb = Number(m[1]), bb = Number(m[2]);
    if (sb < 1 || bb < sb) return null;
    levels.push({ sb, bb });
  }
  return levels.length ? levels : null;
}

function serializeLevels(levels) {
  return levels.map(l => `${l.sb}/${l.bb}`).join(',');
}

// 1-based hand number → 0-based level index, clamped to the last level
function levelForHand(handNumber, fmt) {
  const per = Math.max(1, fmt.handsPerLevel || DEFAULT_FORMAT.handsPerLevel);
  const idx = Math.floor((Math.max(1, handNumber) - 1) / per);
  return Math.min(idx, fmt.levels.length - 1);
}

// 1-based hand number → { sb, bb } for that hand
function blindsForHand(handNumber, fmt) {
  return fmt.levels[levelForHand(handNumber, fmt)];
}

module.exports = { DEFAULT_FORMAT, parseLevels, serializeLevels, levelForHand, blindsForHand };
