import React, { useState, useEffect, useRef } from 'react';

const AVATARS = [
  { id: 'alfie', label: 'Alfie', src: '/assets/alfie.png' },
  { id: 'jazz',  label: 'Jazz',  src: '/assets/jazz.png' },
];

const STORAGE_KEY = 'poker_user';

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; }
  catch { return null; }
}

function savePref(patch) {
  const prev = loadSaved() || {};
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...patch }));
}

export default function Lobby({ onJoin, error }) {
  const saved = loadSaved();
  const [playerName, setPlayerName] = useState(saved?.name || '');
  const [avatarId, setAvatarId]     = useState(saved?.avatarId || AVATARS[0].id);
  const [deckStyle, setDeckStyle]   = useState(saved?.deckStyle || 'regular');
  const [googleUser, setGoogleUser] = useState(saved?.sub ? saved : null);
  const [authError, setAuthError]   = useState(null);
  const btnRef = useRef(null);

  const canSubmit = playerName.trim().length > 0;

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google) return;

    const init = () => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
        auto_select: !!saved?.sub,
      });
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          width: 260,
          text: 'signin_with',
        });
      }
    };

    if (window.google.accounts) {
      init();
    } else {
      window.addEventListener('load', init, { once: true });
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
      if (!res.ok) throw new Error('Auth failed');
      const user = await res.json();
      setGoogleUser(user);
      const displayName = user.name?.split(' ')[0] || user.name || '';
      setPlayerName(prev => prev || displayName);
      savePref({ sub: user.sub, email: user.email, googleName: user.name });
    } catch {
      setAuthError('Google sign-in failed. Try again.');
    }
  }

  function handleSignOut() {
    window.google?.accounts.id.disableAutoSelect();
    setGoogleUser(null);
    localStorage.removeItem(STORAGE_KEY);
    setPlayerName('');
    setAvatarId(AVATARS[0].id);
    setDeckStyle('regular');
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    savePref({ name: playerName.trim(), avatarId, deckStyle });
    onJoin(playerName.trim(), avatarId, deckStyle);
  };

  return (
    <form onSubmit={handleSubmit} className="lobby h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 pt-10 pb-4 px-6 text-center">
        <h1 className="text-3xl font-black tracking-wide text-[color:var(--gold-light)] drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
          ♠ Poker Monkey ♣
        </h1>
        <p className="text-[15px] text-gray-200 mt-2 tracking-wider drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
          NL Hold'em Heads-up Bananza
        </p>
      </div>

      {/* Form card */}
      <div className="flex-1 flex flex-col items-stretch justify-center gap-4 px-6">
        <div className="bg-black/55 backdrop-blur-sm rounded-2xl p-5 border border-white/10 shadow-xl">

          {/* Google auth row */}
          <div className="mb-5">
            {googleUser ? (
              <div className="flex items-center justify-between gap-3 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
                <div className="flex items-center gap-2 min-w-0">
                  {googleUser.picture && (
                    <img src={googleUser.picture} alt="" className="w-7 h-7 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
                  )}
                  <span className="text-xs text-gray-300 truncate">{googleUser.email}</span>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-xs text-gray-400 hover:text-white flex-shrink-0 transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div ref={btnRef} />
                {authError && <p className="text-red-400 text-xs">{authError}</p>}
              </div>
            )}
          </div>

          <label className="block text-xs uppercase tracking-widest text-gray-300 mb-2 font-semibold">
            Your Name
          </label>
          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            maxLength={20}
            autoFocus={!googleUser}
            className="w-full h-12 px-4 text-base rounded-xl bg-white/10 text-white placeholder-white/40 border border-white/15 focus:border-[color:var(--gold)] outline-none"
          />

          <label className="block text-xs uppercase tracking-widest text-gray-300 mt-5 mb-3 font-semibold">
            Choose Your Avatar
          </label>
          <div className="flex gap-4 justify-center">
            {AVATARS.map(av => (
              <button
                key={av.id}
                type="button"
                onClick={() => setAvatarId(av.id)}
                aria-label={av.label}
                aria-pressed={avatarId === av.id}
                className={`avatar-option w-16 h-16 rounded-full overflow-hidden border-[3px] transition-all duration-200 ${
                  avatarId === av.id
                    ? 'border-[color:var(--gold)] shadow-[0_0_14px_rgba(212,160,23,0.6)]'
                    : 'border-white/20 active:scale-95'
                }`}
              >
                <img src={av.src} alt="" draggable={false} className="w-full h-full object-cover object-[center_20%]" />
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2.5 mt-5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deckStyle === 'four-color'}
              onChange={e => setDeckStyle(e.target.checked ? 'four-color' : 'regular')}
              className="deck-checkbox"
            />
            <span className="text-xs uppercase tracking-widest text-gray-300 font-semibold">4-Color Deck</span>
          </label>
        </div>

        {error && (
          <div className="text-center bg-red-500/25 border border-red-500/45 text-red-300 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="flex-shrink-0 px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full h-14 rounded-2xl text-black font-extrabold text-lg tracking-wide shadow-[0_6px_16px_rgba(0,0,0,0.45)] transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, var(--gold), #b8860b)' }}
        >
          Take a Seat
        </button>
      </div>
    </form>
  );
}
