import React, { useState } from 'react';

export default function WaitingRoom({ gameState, roomCode, myId, isHost, onStart, onLeave }) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const players = gameState?.players || [];
  const canStart = players.filter(p => p.isActive).length >= 2;

  return (
    <div className="waiting-room">
      <div className="wr-header">
        <h2>Waiting Room</h2>
        <button className="btn-ghost" onClick={onLeave}>Leave</button>
      </div>

      <div className="wr-code-box">
        <div className="wr-code-label">Room Code</div>
        <div className="wr-code">{roomCode}</div>
        <button className="btn-copy" onClick={copyCode}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="wr-players">
        <div className="wr-players-label">Players ({players.length}/8)</div>
        {players.map(p => (
          <div key={p.id} className="wr-player">
            <span className="wr-player-name">{p.name}</span>
            {p.id === myId && <span className="badge badge-you">You</span>}
            {p.id === gameState?.dealerId && <span className="badge badge-host">Host</span>}
          </div>
        ))}
      </div>

      <div className="wr-actions">
        {isHost ? (
          <button
            className="btn-primary"
            onClick={onStart}
            disabled={!canStart}
          >
            {canStart ? 'Start Game' : 'Waiting for players (need 2+)'}
          </button>
        ) : (
          <div className="wr-waiting">Waiting for host to start...</div>
        )}
      </div>
    </div>
  );
}
