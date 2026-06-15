export const ACHIEVEMENTS = [
  {
    id: 'beat_bot',
    name: 'Machine Slayer',
    description: 'Beat the house bot in a match.',
    howToEarn: 'Win a match against the bot',
    icon: '🤖',
    progressTarget: null,
  },
  {
    id: 'beat_human',
    name: 'First Blood',
    description: 'Beat a real human player.',
    howToEarn: 'Win a match against a human',
    icon: '🧑',
    progressTarget: null,
  },
  {
    id: 'back_to_back',
    name: 'Back to Back',
    description: 'Win on two consecutive calendar days.',
    howToEarn: 'Win at least one match on 2 days in a row',
    icon: '📅',
    progressTarget: 2,
  },
  {
    id: 'seven_in_a_row',
    name: '7 in a Row',
    description: 'Win on seven consecutive calendar days.',
    howToEarn: 'Win at least one match on 7 days in a row',
    icon: '🔥',
    progressTarget: 7,
  },
  {
    id: 'got_straight',
    name: 'Straight',
    description: 'Win a hand with a straight.',
    howToEarn: 'Win a hand using a straight',
    icon: '🃏',
    progressTarget: null,
  },
  {
    id: 'got_flush',
    name: 'Flush',
    description: 'Win a hand with a flush.',
    howToEarn: 'Win a hand using a flush',
    icon: '💧',
    progressTarget: null,
  },
  {
    id: 'got_full_house',
    name: 'Full House',
    description: 'Win a hand with a full house.',
    howToEarn: 'Win a hand using a full house',
    icon: '🏠',
    progressTarget: null,
  },
  {
    id: 'got_quads',
    name: 'Quads',
    description: 'Win a hand with four of a kind.',
    howToEarn: 'Win a hand using four of a kind',
    icon: '🎯',
    progressTarget: null,
  },
  {
    id: 'got_straight_flush',
    name: 'Straight Flush',
    description: 'Win a hand with a straight flush.',
    howToEarn: 'Win a hand using a straight flush',
    icon: '⚡',
    progressTarget: null,
  },
  {
    id: 'got_royal_flush',
    name: 'Royal Flush',
    description: 'The rarest hand in poker — win with it.',
    howToEarn: 'Win a hand using a royal flush',
    icon: '👑',
    progressTarget: null,
  },
  {
    id: 'beat_friend',
    name: 'Beat a Friend',
    description: 'Beat someone you know.',
    howToEarn: 'TBD — tracking coming soon',
    icon: '🤝',
    progressTarget: null,
  },
];

// Merge static defs with the achievements list returned by the server.
// `serverList` is an array of { id, earned, progress? }.
export function mergeAchievements(serverList = []) {
  const byId = {};
  for (const a of serverList) byId[a.id] = a;
  return ACHIEVEMENTS.map(def => ({
    ...def,
    earned: byId[def.id]?.earned ?? false,
    progress: byId[def.id]?.progress ?? null,
  }));
}
