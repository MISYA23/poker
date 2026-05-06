import React, { useState } from 'react';

export default function Lobby({ onJoin, error }) {
  const [playerName, setPlayerName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    onJoin(playerName.trim());
  };

  return (
    <div className="lobby">
      <div className="lobby-header">
        <div className="lobby-logo">♠ Poker ♣</div>
        <p className="lobby-sub">Multiplayer Texas Hold'em</p>
      </div>

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
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={!playerName.trim()}>
            Take a Seat
          </button>
        </form>
      </div>
    </div>
  );
}
