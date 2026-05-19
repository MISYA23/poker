import React, { useState, useEffect, useRef } from 'react';
import { AVATARS } from './Avatar.jsx';

const VERSION = 'v1.04';
const STORAGE_KEY = 'poker_user';

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; }
  catch { return null; }
}

function savePref(patch) {
  const prev = loadSaved() || {};
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...patch }));
}

export function ensurePlayerId() {
  const saved = loadSaved() || {};
  if (!saved.playerId) {
    const id = crypto.randomUUID();
    savePref({ playerId: id });
    return id;
  }
  return saved.playerId;
}

export default function SignIn({ onReady, error }) {
  ensurePlayerId();
  const saved = loadSaved();
  const [playerName, setPlayerName] = useState(saved?.name || '');
  const [avatarId, setAvatarId]     = useState(saved?.avatarId || null);
  const [googleUser, setGoogleUser] = useState(saved?.sub ? saved : null);
  const [authError, setAuthError]   = useState(null);
  const btnRef = useRef(null);
  const gsiReady = useRef(false);

  // Auto-advance if credentials already saved
  useEffect(() => {
    const s = loadSaved();
    if (s?.name && s?.avatarId) onReady(s.name, s.avatarId);
  }, []);

  const canSubmit = playerName.trim().length > 0 && avatarId !== null;

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || gsiReady.current) return;
    const init = () => {
      if (!window.google?.accounts || gsiReady.current) return;
      gsiReady.current = true;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
        auto_select: !!saved?.sub,
      });
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'outline', size: 'large', shape: 'pill', width: 280, text: 'signin_with',
        });
      }
    };
    if (window.google?.accounts) init();
    else {
      const script = document.querySelector('script[src*="accounts.google.com/gsi"]');
      if (script) script.addEventListener('load', init, { once: true });
    }
  }, []);

  async function handleCredential({ credential }) {
    setAuthError(null);
    try {
      const res = await fetch('/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credential }),
      });
      if (!res.ok) throw new Error();
      const user = await res.json();
      // DB is source of truth for name/avatar; fall back to Google name for first-timers
      const name = user.name || user.name?.split(' ')[0] || '';
      const av = user.avatarId || loadSaved()?.avatarId || AVATARS[0].id;
      const deckStyle = user.deckStyle || 'regular';
      savePref({ playerId: user.playerId, sub: user.sub, email: user.email, picture: user.picture, name, avatarId: av, deckStyle });
      setGoogleUser(user);
      setPlayerName(name);
      setAvatarId(av);
      onReady(name, av);
    } catch {
      setAuthError('Sign-in failed. Try again.');
    }
  }

  function handleSignOut() {
    window.google?.accounts.id.disableAutoSelect();
    setGoogleUser(null);
    localStorage.removeItem(STORAGE_KEY);
    setPlayerName('');
    setAvatarId(AVATARS[0].id);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const name = playerName.trim();
    savePref({ name, avatarId });
    const playerId = ensurePlayerId();
    // Persist guest profile to DB (fire and forget — don't block join)
    fetch('/api/player/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, name, avatarId }),
    }).catch(() => {});
    onReady(name, avatarId);
  };

  return (
    <div className="lobby h-full flex flex-col items-center justify-between overflow-y-auto">
      <div className="flex-shrink-0 pt-10 pb-4 px-6 text-center w-full">
        <h1 className="text-3xl font-black tracking-wide text-[color:var(--gold-light)] drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
          ♠ Poker Monkey ♣
        </h1>
        <p className="text-[15px] text-gray-200 mt-2 tracking-wider">NL Hold'em · Multi-table</p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-center w-full max-w-sm px-4">
        <div className="bg-black/55 backdrop-blur-sm rounded-2xl p-5 border border-white/10 shadow-xl">
          {googleUser ? (
            <div className="flex items-center justify-between gap-3 bg-white/5 rounded-xl px-3 py-2 border border-white/10 mb-5">
              <div className="flex items-center gap-2 min-w-0">
                {googleUser.picture && (
                  <img src={googleUser.picture} alt="" className="w-7 h-7 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
                )}
                <span className="text-xs text-gray-300 truncate">{googleUser.email}</span>
              </div>
              <button type="button" onClick={handleSignOut} className="text-xs text-gray-400 hover:text-white flex-shrink-0 transition-colors">
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center mb-5">
              <div ref={btnRef} />
              {authError && <p className="text-red-400 text-xs mt-2">{authError}</p>}
            </div>
          )}

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-white/15" />
            <span className="text-xs text-white/40 whitespace-nowrap">
              {googleUser ? 'or update below' : 'or play as a guest'}
            </span>
            <div className="flex-1 h-px bg-white/15" />
          </div>

          <label className="block text-xs uppercase tracking-widest text-gray-300 mb-2 font-semibold">Your Name</label>
          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            maxLength={20}
            autoFocus={!googleUser}
            className="w-full h-12 px-4 text-base rounded-xl bg-white/10 text-white placeholder-white/40 border border-white/15 focus:border-[color:var(--gold)] outline-none"
          />

          <label className="block text-xs uppercase tracking-widest text-gray-300 mt-5 mb-3 font-semibold">Choose Your Avatar</label>
          <div className="flex flex-wrap gap-3 justify-center">
            {AVATARS.map(av => (
              <button
                key={av.id}
                type="button"
                onClick={() => setAvatarId(av.id)}
                aria-label={av.label}
                aria-pressed={avatarId === av.id}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-3xl border-[3px] transition-all duration-200 bg-black/40 ${
                  avatarId === av.id
                    ? 'border-[color:var(--gold)] shadow-[0_0_14px_rgba(212,160,23,0.6)]'
                    : 'border-white/20 active:scale-95'
                }`}
              >
                {av.emoji}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-3 text-center bg-red-500/25 border border-red-500/45 text-red-300 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="mt-4 pb-[max(28px,env(safe-area-inset-bottom))] flex flex-col gap-2">
          <p className="text-center text-white/25 text-xs">{VERSION}</p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full h-14 rounded-2xl text-black font-extrabold text-lg tracking-wide shadow-[0_6px_16px_rgba(0,0,0,0.45)] transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, var(--gold), #b8860b)' }}
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
