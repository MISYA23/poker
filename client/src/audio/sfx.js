// Action sound effects — toggled independently from the music.
import { createAudioPlayer } from 'expo-audio';

const SOURCES = {
  fold:     require('../../assets/sfx/fold.wav'),
  check:    require('../../assets/sfx/check.wav'),
  call:     require('../../assets/sfx/bet.wav'),    // call = placing chips → bet sound
  bet:      require('../../assets/sfx/bet.wav'),
  raise:    require('../../assets/sfx/raise.wav'),
  'all-in': require('../../assets/sfx/allin.wav'),
  deal:     require('../../assets/sfx/deal.wav'),       // dealing the hole cards
  community:require('../../assets/sfx/community.wav'),  // each new board card revealed
  pot:      require('../../assets/sfx/pot.wav'),        // pot awarded to the winner
  turn:     require('../../assets/sfx/turn.wav'),       // it's your turn to act
  alarm:    require('../../assets/sfx/alarm.wav'),      // ~5s left on your turn timer
};

let sfxEnabled = true;
export function isSfxEnabled() { return sfxEnabled; }
export function setSfxEnabled(v) { sfxEnabled = !!v; }

const players = {};
function getPlayer(name) {
  if (!(name in players)) {
    const src = SOURCES[name];
    players[name] = src ? createAudioPlayer(src) : null;
    if (players[name]) players[name].volume = 0.75;
  }
  return players[name];
}

export function playSfx(action) {
  if (!sfxEnabled) return;
  const p = getPlayer(action);
  if (!p) return;
  try { p.seekTo(0).then(() => p.play()).catch(() => {}); } catch (_) {}
}
