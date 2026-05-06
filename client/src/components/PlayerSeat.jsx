import React, { useState, useEffect } from 'react';
import Card from './Card.jsx';
import { ChipStack } from './PokerChip.jsx';

function useTurnTimer(turnDeadline) {
  const [timeLeft, setTimeLeft] = useState(null);
  useEffect(() => {
    if (!turnDeadline) { setTimeLeft(null); return; }
    const update = () => setTimeLeft(Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [turnDeadline]);
  return timeLeft;
}

export default function PlayerSeat({ player, isMe, compact = false, win = null, turnDeadline = null }) {
  const timeLeft = useTurnTimer(turnDeadline);
  if (!player) return <div className="player-seat player-seat-empty" />;

  const cardSize = compact ? 'xs' : (isMe ? 'lg' : 'sm');

  return (
    <div className={`player-seat ${player.isCurrentPlayer ? 'seat-active' : ''} ${player.folded ? 'seat-folded' : ''} ${isMe ? 'seat-me' : ''}`}>
      {timeLeft !== null && (
        <div className={`seat-timer ${timeLeft <= 5 ? 'seat-timer-urgent' : ''}`}>{timeLeft}s</div>
      )}

      <div className="seat-info">
        <div className="seat-name">
          {player.name}
          {player.isDealer && <span className="badge badge-dealer">D</span>}
          {player.isSmallBlind && <span className="badge badge-sb">SB</span>}
          {player.isBigBlind && <span className="badge badge-bb">BB</span>}
        </div>
        <div className="seat-chips">
          ${player.chips.toLocaleString()}
          {player.allIn && <span className="badge badge-allin">ALL IN</span>}
        </div>
        {player.roundBet > 0 && (
          <div className="seat-bet-chips">
            <ChipStack amount={player.roundBet} size={22} />
          </div>
        )}
      </div>

      {player.holeCards && player.holeCards.length > 0 && (
        <div className={`seat-cards ${compact ? 'seat-cards-compact' : ''}`}>
          {player.holeCards.map((card, i) => (
            <Card
              key={i}
              card={card}
              size={cardSize}
              faceDown={card?.hidden}
            />
          ))}
        </div>
      )}

      {win && (
        <div className="seat-win">
          <ChipStack amount={win.amount} size={20} />
          <div className="seat-win-hand">{win.handName}</div>
        </div>
      )}

      {player.folded && <div className="seat-folded-label">FOLDED</div>}
    </div>
  );
}
