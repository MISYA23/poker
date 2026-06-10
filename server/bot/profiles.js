// Bot personality profiles. Every dial is 0–1; the brain interprets them as:
//
//   tightness   how much equity it wants before putting chips in (0 = any two, 1 = nit)
//   aggression  how often it bets/raises instead of check/calling when continuing
//   bluffFreq   how often it fires with weak equity (bluffs, barrels, resteals)
//   betSizing   preferred sizing (0 = min-bets, 1 = pot/overbet + jams)
//   stickiness  how hard it is to bet off a hand once it has equity/chips invested
//                (0 = folds to pressure, 1 = calling station)
//   simulations Monte Carlo rollouts per decision (accuracy knob)

const PROFILES = {
  // Solid default — tight-aggressive
  tag: {
    tightness: 0.6,
    aggression: 0.7,
    bluffFreq: 0.25,
    betSizing: 0.55,
    stickiness: 0.3,
    simulations: 600,
  },

  // Loose-aggressive — plays lots of hands, lots of pressure
  lag: {
    tightness: 0.3,
    aggression: 0.85,
    bluffFreq: 0.45,
    betSizing: 0.7,
    stickiness: 0.4,
    simulations: 600,
  },

  // Weak-tight nit — waits for the goods, folds to pressure
  nit: {
    tightness: 0.85,
    aggression: 0.25,
    bluffFreq: 0.05,
    betSizing: 0.35,
    stickiness: 0.15,
    simulations: 600,
  },

  // Calling station — loose-passive, hates folding, rarely raises
  station: {
    tightness: 0.15,
    aggression: 0.15,
    bluffFreq: 0.05,
    betSizing: 0.3,
    stickiness: 0.9,
    simulations: 600,
  },

  // Maniac — any two cards, max pressure, big sizing
  maniac: {
    tightness: 0.08,
    aggression: 0.95,
    bluffFreq: 0.6,
    betSizing: 0.9,
    stickiness: 0.6,
    simulations: 400,
  },
};

function getProfile(name) {
  const base = PROFILES[name];
  if (!base) throw new Error(`Unknown bot profile: ${name}`);
  return { name, ...base };
}

module.exports = { PROFILES, getProfile };
