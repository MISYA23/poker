import React, { useState, useEffect } from 'react';

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

export default function BettingControls({ gameState, myId, onAction, raiseAmount, canRaise }) {
  const me = gameState?.players?.find(p => p.id === myId);
  const timeLeft = useTurnTimer(gameState?.turnDeadline);

  const isMyTurn = gameState?.currentPlayerId === myId &&
    !['waiting', 'showdown'].includes(gameState?.phase);

  if (!isMyTurn) return <div className="action-bar-placeholder" />;

  const currentBet = gameState?.currentBet || 0;
  const myBet = me?.roundBet || 0;
  const callAmount = Math.min(currentBet - myBet, me?.chips || 0);
  const canCheck = myBet >= currentBet;
  const maxRaise = myBet + (me?.chips || 0);

  const handleRaise = () => {
    const amt = raiseAmount || 0;
    onAction(amt >= maxRaise ? 'all-in' : 'raise', amt);
  };

  const urgent = timeLeft !== null && timeLeft <= 5;

  return (
    <div className="action-buttons-bar">
      {timeLeft !== null && (
        <div className={`turn-timer ${urgent ? 'turn-timer-urgent' : ''}`}>{timeLeft}s</div>
      )}
      <div className="action-buttons">
        <button className="btn-action btn-fold" onClick={() => onAction('fold')}>
          Fold
        </button>

        {canCheck ? (
          <button className="btn-action btn-check" onClick={() => onAction('check')}>
            Check
          </button>
        ) : (
          <button className="btn-action btn-call" onClick={() => onAction('call')}>
            Call {callAmount > 0 ? `$${callAmount.toLocaleString()}` : ''}
          </button>
        )}

        {canRaise && (
          <button className="btn-action btn-raise" onClick={handleRaise}>
            {raiseAmount >= maxRaise ? 'All In' : `Raise $${(raiseAmount || 0).toLocaleString()}`}
          </button>
        )}

        {me?.chips > 0 && (
          <button className="btn-action btn-allin" onClick={() => onAction('all-in', 0)}>
            All In
          </button>
        )}
      </div>
    </div>
  );
}
