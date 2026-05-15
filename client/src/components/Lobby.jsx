import React, { useState } from 'react';

const AVATARS = [
  { id: 'dk', label: 'Donkey Kong', src: '/assets/dk.png' },
  { id: 'diddy', label: 'Diddy Kong', src: '/assets/diddy.webp' },
];

export default function Lobby({ onJoin, error }) {
  const [playerName, setPlayerName] = useState('');
  const [avatarId, setAvatarId] = useState(AVATARS[0].id);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    onJoin(playerName.trim(), avatarId);
  };

  return (
    <div className="lobby">
      <div className="lobby-header">
        <div className="lobby-logo">♠ Poker Monkey ♣</div>
        <p className="lobby-sub">NL Hold'em Heads-up Bananza</p>
      </div>

      <button className="btn-ghost btn-sm lobby-reset" onClick={() => fetch('/admin/reset', { method: 'POST' }).then(() => window.location.reload())}>
        Reset Game
      </button>

      <div className="lobby-card">
        <form onSubmit={handleSubmit} className="lobby-form">
          <div className="form-group">
            <label>Your Name</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              maxLength={20}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Choose Your Avatar</label>
            <div className="avatar-picker">
              {AVATARS.map(av => (
                <button
                  key={av.id}
                  type="button"
                  className={`avatar-option ${avatarId === av.id ? 'selected' : ''}`}
                  onClick={() => setAvatarId(av.id)}
                  aria-label={av.label}
                >
                  <img src={av.src} alt={av.label} draggable={false} />
                </button>
              ))}
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={!playerName.trim()}>
            Take a Seat
          </button>
        </form>
      </div>
    </div>
  );
}
