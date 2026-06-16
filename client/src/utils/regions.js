// Country (ISO-2) → continent/region, shared by the lobby card + full leaderboard.
export const CONTINENT = {
  // Americas
  US:'Americas', CA:'Americas', MX:'Americas', BR:'Americas', AR:'Americas', CL:'Americas', CO:'Americas', PE:'Americas',
  VE:'Americas', EC:'Americas', BO:'Americas', PY:'Americas', UY:'Americas', GT:'Americas', CU:'Americas', DO:'Americas',
  HN:'Americas', NI:'Americas', CR:'Americas', PA:'Americas', SV:'Americas', JM:'Americas', TT:'Americas', PR:'Americas',
  BS:'Americas', BZ:'Americas', GY:'Americas', SR:'Americas', HT:'Americas',
  // Europe
  FR:'Europe', GB:'Europe', DE:'Europe', ES:'Europe', IT:'Europe', PT:'Europe', NL:'Europe', BE:'Europe', CH:'Europe',
  AT:'Europe', IE:'Europe', SE:'Europe', NO:'Europe', DK:'Europe', FI:'Europe', PL:'Europe', RO:'Europe', BG:'Europe',
  GR:'Europe', CZ:'Europe', SK:'Europe', HU:'Europe', HR:'Europe', RS:'Europe', UA:'Europe', RU:'Europe', LT:'Europe',
  LV:'Europe', EE:'Europe', SI:'Europe', LU:'Europe', IS:'Europe', MT:'Europe', CY:'Europe', AL:'Europe', MK:'Europe',
  BA:'Europe', ME:'Europe', MD:'Europe', BY:'Europe', XK:'Europe',
  // Asia
  CN:'Asia', JP:'Asia', KR:'Asia', IN:'Asia', SG:'Asia', HK:'Asia', TW:'Asia', TH:'Asia', VN:'Asia', PH:'Asia',
  ID:'Asia', MY:'Asia', BD:'Asia', PK:'Asia', LK:'Asia', NP:'Asia', KH:'Asia', MM:'Asia', KZ:'Asia', UZ:'Asia',
  AE:'Asia', SA:'Asia', IL:'Asia', QA:'Asia', KW:'Asia', BH:'Asia', OM:'Asia', JO:'Asia', LB:'Asia', IQ:'Asia',
  IR:'Asia', TR:'Asia', GE:'Asia', AM:'Asia', AZ:'Asia', MN:'Asia', MO:'Asia', BN:'Asia',
  // Africa
  ZA:'Africa', NG:'Africa', KE:'Africa', EG:'Africa', GH:'Africa', MA:'Africa', DZ:'Africa', TN:'Africa', ET:'Africa',
  UG:'Africa', TZ:'Africa', CM:'Africa', CI:'Africa', SN:'Africa', ZW:'Africa', ZM:'Africa', AO:'Africa', MZ:'Africa',
  BW:'Africa', NA:'Africa', RW:'Africa', MW:'Africa', ML:'Africa', MU:'Africa', MG:'Africa', BJ:'Africa', BF:'Africa',
  NE:'Africa', TD:'Africa', SD:'Africa', SO:'Africa', LY:'Africa', GA:'Africa', CD:'Africa', CG:'Africa',
  // Oceania
  AU:'Oceania', NZ:'Oceania', FJ:'Oceania', PG:'Oceania', NC:'Oceania', PF:'Oceania', WS:'Oceania', TO:'Oceania',
  VU:'Oceania', SB:'Oceania',
};

export const REGION_ORDER = ['Americas', 'Europe', 'Asia', 'Africa', 'Oceania'];

export const continentOf = (cc) => CONTINENT[cc] || null;

// Per-region icon — all use the matching hemisphere globe for a consistent look
// (Europe uses the Europe/Africa globe). Global uses the neutral meridian globe.
export const GLOBAL_EMOJI = '🌐';
export const REGION_EMOJI = {
  Americas: '🌎',
  Europe:   '🌍',
  Asia:     '🌏',
  Africa:   '🌍',
  Oceania:  '🌏',
};
export const regionEmoji = (r) => REGION_EMOJI[r] || GLOBAL_EMOJI;
