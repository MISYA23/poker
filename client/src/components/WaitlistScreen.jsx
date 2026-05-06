import React from 'react';
import Card from './Card.jsx';

export default function WaitlistScreen({ gameState, position, onLeave }) {
  const players = gameState?.players || [];
  const phase = gameState?.phase;

  return (
    <div className="waitlist-screen">
      <div className="waitlist-header">
        <div className="lobby-logo" style={{ fontSize: '1.8rem' }}>♠ Poker ♣</div>
        <button className="btn-ghost btn-sm" onClick={onLeave}>Leave</button>
      </div>

      <div className="waitlist-badge">
        <div className="waitlist-number">#{position}</div>
        <div className="waitlist-label">on the waitlist</div>
        <div className="waitlist-sub">You'll be seated when a spot opens up</div>
      </div>

      <div className="waitlist-table-info">
        <div className="wt-label">Current Table</div>
        <div className="wt-phase">{phase === 'waiting' ? 'Waiting for players' : phase?.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>

        {gameState?.communityCards?.length > 0 && (
          <div className="wt-community">
            {gameState.communityCards.map((card, i) => (
              <Card key={i} card={card} size="sm" />
            ))}
          </div>
        )}

        <div className="wt-players">
          {players.map(p => (
            <div key={p.id} className={`wt-player ${p.folded ? 'wt-folded' : ''}`}>
              <span className="wt-player-name">{p.name}</span>
              <span className="wt-player-chips">${p.chips.toLocaleString()}</span>
              {p.isCurrentPlayer && <span className="badge badge-dealer">●</span>}
            </div>
          ))}
        </div>

        {gameState?.pot > 0 && (
          <div className="wt-pot">Pot: ${gameState.pot.toLocaleString()}</div>
        )}
      </div>
    </div>
  );
}
