import React from 'react';
import Card from './Card.jsx';

export default function WinnerDisplay({ winners }) {
  if (!winners || winners.length === 0) return null;

  return (
    <div className="winner-overlay">
      <div className="winner-content">
        <div className="winner-title">
          {winners.length === 1 ? '🏆 Winner!' : '🤝 Split Pot!'}
        </div>
        {winners.map((w, i) => (
          <div key={i} className="winner-item">
            <div className="winner-name">{w.playerName}</div>
            <div className="winner-hand">{w.handName}</div>
            <div className="winner-amount">+${w.amount.toLocaleString()}</div>
            {w.holeCards && w.holeCards.length > 0 && (
              <div className="winner-cards">
                {w.holeCards.map((card, j) => (
                  <Card key={j} card={card} size="sm" />
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="winner-next">Next hand starting soon...</div>
      </div>
    </div>
  );
}
