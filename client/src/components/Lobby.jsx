import React, { useState } from 'react';
import { AVATARS } from './Avatar.jsx';

const TABLE_EMOJI = { California: '🌴', Paris: '🗼', Dublin: '🍀' };

function loadSaved() {
  try { return JSON.parse(localStorage.getItem('poker_user')) || {}; }
  catch { return {}; }
}
function patchSaved(patch) {
  localStorage.setItem('poker_user', JSON.stringify({ ...loadSaved(), ...patch }));
}

export default function Lobby({ playerName, tables = [], activeSeats = [], onJoinTable, onRejoin, onLogout, error }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState('main');
  const [localAvatarId, setLocalAvatarId] = useState(() => loadSaved().avatarId || AVATARS[0].id);

  function handleAvatarChange(id) {
    setLocalAvatarId(id);
    patchSaved({ avatarId: id });
  }

  return (
    <div className="lobby h-full flex flex-col items-center justify-between overflow-y-auto relative">

      {/* Hamburger */}
      <div className="absolute top-2 right-2 z-50">
        <button
          className="w-10 h-10 rounded-lg bg-black/55 border border-white/20 text-white/90 text-lg font-bold flex items-center justify-center active:scale-95 transition-transform"
          onClick={() => { setMenuView('main'); setMenuOpen(true); }}
          aria-label="Menu"
        >
          ☰
        </button>
      </div>

      {/* Menu overlay */}
      {menuOpen && (
        <>
          <div className="absolute inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-12 right-2 z-50 w-52 rounded-2xl bg-[#111] border border-white/15 shadow-2xl overflow-hidden">
            {menuView === 'main' ? (
              <div className="flex flex-col">
                <button
                  className="px-4 py-3 text-left text-sm text-white/90 hover:bg-white/10 transition-colors border-b border-white/10"
                  onClick={() => setMenuView('settings')}
                >
                  ⚙️ Settings
                </button>
                <button
                  className="px-4 py-3 text-left text-sm text-white/90 hover:bg-white/10 transition-colors"
                  onClick={() => { setMenuOpen(false); onLogout?.(); }}
                >
                  🚪 Log Out
                </button>
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                  <button onClick={() => setMenuView('main')} className="text-white/50 hover:text-white text-xs">←</button>
                  <span className="text-sm font-semibold text-white/90">Settings</span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Avatar</p>
                  <div className="flex flex-wrap gap-2">
                    {AVATARS.map(av => (
                      <button
                        key={av.id}
                        onClick={() => handleAvatarChange(av.id)}
                        aria-label={av.label}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xl border-2 transition-all bg-black/40 ${localAvatarId === av.id ? 'border-[color:var(--gold)]' : 'border-white/20'}`}
                      >
                        {av.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex-shrink-0 pt-10 pb-4 px-6 text-center w-full">
        <h1 className="text-3xl font-black tracking-wide text-[color:var(--gold-light)]">
          ♠ Poker Monkey ♣
        </h1>
        <p className="text-sm text-white/50 mt-1">Welcome, {playerName}</p>
      </div>

      <div className="flex-1 flex flex-col justify-center w-full max-w-sm px-4 gap-4">

        {/* Active seat banners */}
        {activeSeats.map(seat => (
          <button
            key={seat.tableId}
            onClick={() => onRejoin?.(seat.tableId)}
            className="w-full rounded-2xl p-4 text-center font-extrabold text-base text-black active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(212,160,23,0.4)]"
            style={{ background: 'linear-gradient(135deg, var(--gold-light), var(--gold))' }}
          >
            ♠ TAKE YOUR SEAT — {seat.tableName} ♠
          </button>
        ))}

        {error && (
          <div className="text-center bg-red-500/25 border border-red-500/45 text-red-300 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <p className="text-xs uppercase tracking-widest text-white/40 text-center font-semibold">Choose a Table</p>

        {tables.map(t => (
          <button
            key={t.id}
            onClick={() => onJoinTable(t.id)}
            className="w-full rounded-2xl bg-black/55 border border-white/10 p-5 text-left active:scale-[0.98] transition-all hover:border-white/25 hover:bg-black/70"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{TABLE_EMOJI[t.name] || '🎰'}</span>
                <div>
                  <div className="text-lg font-black text-white">{t.name}</div>
                  <div className="text-xs text-white/40">No Limit Hold'em</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-[color:var(--gold-light)]">{t.playerCount}</div>
                <div className="text-[10px] text-white/40">players</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${t.phase === 'waiting' ? 'bg-yellow-400' : 'bg-green-400'}`} />
              <span className="text-xs text-white/50">{t.phase === 'waiting' ? 'Waiting for players' : 'Hand in progress'}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="pb-[max(28px,env(safe-area-inset-bottom))] pt-4" />
    </div>
  );
}
