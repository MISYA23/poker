// Background music manager — two playlists (menu vs in-game), looping/rotating,
// with a smooth crossfade when switching context. Starts on the first user gesture
// (web autoplay policy) and keeps playing across navigation without interruption.
// Which tracks play in each interface is driven by the admin (GET /api/music-config),
// with the defaults below as a fallback when the server config can't be reached.
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { SERVER_URL } from '../config';

// Static asset registry — every track the app ships. require() must stay static
// for the Metro bundler; the admin only toggles which of these are active where.
const TRACK_ASSETS = {
  'chill-tropics': require('../../assets/music/chill-tropics.mp3'),
  'pirates':       require('../../assets/music/pirates.mp3'),
  'fun-caribbean': require('../../assets/music/fun-caribbean.mp3'),
  'epic-celtic':   require('../../assets/music/epic-celtic.mp3'),
};

// Fallback playlists (used until /api/music-config loads, or if it fails)
const DEFAULT_MENU = ['chill-tropics'];
const DEFAULT_GAME = ['pirates', 'fun-caribbean', 'epic-celtic'];

const keysToAssets = (keys) =>
  (keys || []).map(k => TRACK_ASSETS[k]).filter(Boolean);

const MAX_VOL = 0.22;    // overall music volume (0..1) — kept under the SFX so they cut through
const FADE_MS = 1000;    // crossfade duration

// Mutable state lives on globalThis so it survives Metro Fast Refresh — otherwise a
// hot reload would re-init `muted`/players, orphan the running audio, and make music
// "come back" after it was deactivated. One canonical state per app session.
const S = (globalThis.__pmMusic = globalThis.__pmMusic || {
  ctx: {
    menu: { tracks: keysToAssets(DEFAULT_MENU), idx: 0, player: null },
    game: { tracks: keysToAssets(DEFAULT_GAME), idx: 0, player: null },
  },
  active: null,          // 'menu' | 'game' | null
  started: false,
  muted: false,
});

function buildPlayer(c) {
  const p = createAudioPlayer(c.tracks[c.idx]);
  p.volume = 0;
  p.muted = S.muted;
  p.loop = c.tracks.length === 1;                 // single track → native loop
  if (c.tracks.length > 1) {
    p.addListener('playbackStatusUpdate', (st) => {
      // Re-assert mute on every tick — replace() builds a fresh <audio> element with
      // muted=false, so enforce our state continuously to kill any leak.
      try { if (p.muted !== S.muted) p.muted = S.muted; } catch (_) {}
      if (S.muted) { try { p.pause(); } catch (_) {} return; }  // deactivated → never advance audibly
      if (st && st.didJustFinish) {                // multi track → rotate playlist
        c.idx = (c.idx + 1) % c.tracks.length;
        const vol = p.volume;                      // preserve current fade level
        try {
          p.replace(c.tracks[c.idx]);
          p.muted = S.muted;
          p.volume = vol;
          p.play();                                // explicit — replace() only auto-plays if it was playing at end
        } catch (_) {}
      }
    });
  }
  return p;
}

function ensure() {
  if (!S.ctx.menu.player) S.ctx.menu.player = buildPlayer(S.ctx.menu);
  if (!S.ctx.game.player) S.ctx.game.player = buildPlayer(S.ctx.game);
}

function fade(player, to, ms = FADE_MS, onDone) {
  if (!player) return;
  const from = player.volume ?? 0;
  const steps = Math.max(1, Math.round(ms / 50));
  let i = 0;
  const id = setInterval(() => {
    i += 1;
    try { player.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps))); } catch (_) {}
    if (i >= steps) { clearInterval(id); if (onDone) onDone(); }
  }, 50);
}

// Replace one context's playlist (from the admin config). Rebuilds the player if
// it already exists so a change takes effect even after music has started.
function applyContext(key, assets) {
  if (!assets.length) return;                       // never leave a context empty
  const c = S.ctx[key];
  const same = assets.length === c.tracks.length && assets.every((a, i) => a === c.tracks[i]);
  if (same) return;
  c.tracks = assets;
  c.idx = 0;
  if (c.player) {
    const old = c.player;
    try { old.pause(); } catch (_) {}
    try { old.remove(); } catch (_) {}
    c.player = buildPlayer(c);
    if (S.active === key && !S.muted) { try { c.player.play(); } catch (_) {} fade(c.player, MAX_VOL); }
  }
}

// Pull the admin's per-interface track config and apply it. Safe to call anytime.
export async function loadMusicConfig() {
  try {
    const res = await fetch(`${SERVER_URL}/api/music-config`);
    if (!res.ok) return;
    const cfg = await res.json();
    applyContext('menu', keysToAssets(cfg.menu));
    applyContext('game', keysToAssets(cfg.game));
  } catch (_) { /* keep defaults */ }
}

export async function startMusic() {
  if (S.started) return;
  S.started = true;
  try { await setAudioModeAsync({ playsInSilentMode: true }); } catch (_) {}
  ensure();
  S.active = 'menu';
  if (S.muted) return;                            // deactivated → don't start playback
  try { S.ctx.menu.player.play(); } catch (_) {}
  fade(S.ctx.menu.player, MAX_VOL);
}

// target: 'menu' | 'game' — crossfade between contexts, no hard cut
export function setMusicContext(target) {
  if (!S.started || S.active === target || !S.ctx[target]) return;
  ensure();
  const prev = S.ctx[S.active] && S.ctx[S.active].player;
  const next = S.ctx[target].player;
  S.active = target;
  if (prev) fade(prev, 0, FADE_MS, () => { try { prev.pause(); } catch (_) {} });
  if (S.muted) { try { next.pause(); } catch (_) {} return; }  // deactivated → don't start the next context
  try { next.muted = S.muted; } catch (_) {}                  // re-assert: target may be stuck muted from an earlier toggle
  try { next.play(); } catch (_) {}
  fade(next, MAX_VOL);
}

export function isMusicMuted() { return S.muted; }
export function setMusicMuted(value) {
  S.muted = !!value;
  // Always sync the native muted flag on BOTH players — otherwise the inactive
  // context (e.g. the menu track while you're in-game) stays stuck muted and is
  // silent when you switch back to it.
  [S.ctx.menu.player, S.ctx.game.player].forEach(p => {
    if (p) { try { p.muted = S.muted; } catch (_) {} }
  });
  if (S.muted) {
    // Truly stop every player — a paused player can't rotate or leak audio.
    [S.ctx.menu.player, S.ctx.game.player].forEach(p => {
      if (p) { try { p.pause(); } catch (_) {} }
    });
  } else if (S.started && S.active && S.ctx[S.active] && S.ctx[S.active].player) {
    const p = S.ctx[S.active].player;
    try { p.play(); } catch (_) {}
    fade(p, MAX_VOL);
  }
}
