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

export default function BettingControls({ gameState, myId, onAction }) {
  const me = gameState?.players?.find(p => p.id === myId);

  const currentBet = gameState?.currentBet || 0;
  const myBet = me?.roundBet || 0;
  const callAmount = Math.min(currentBet - myBet, me?.chips || 0);
  const canCheck = myBet >= currentBet;
  const minRaise = currentBet + (gameState?.minRaise || gameState?.bigBlind || 20);
  const maxRaise = myBet + (me?.chips || 0);
  const effectiveMin = Math.min(minRaise, maxRaise);

  const [raiseAmount, setRaiseAmount] = useState(effectiveMin);

  useEffect(() => {
    setRaiseAmount(effectiveMin);
  }, [gameState?.currentPlayerId]);

  const timeLeft = useTurnTimer(gameState?.turnDeadline);

  if (!me || gameState?.currentPlayerId !== myId) return null;
  if (['waiting', 'showdown'].includes(gameState?.phase)) return null;

  const handleRaise = () => {
    const amt = raiseAmount || effectiveMin;
    onAction(amt >= maxRaise ? 'all-in' : 'raise', amt);
  };

  const urgent = timeLeft !== null && timeLeft <= 5;

  return (
    <div className="betting-controls">
      {timeLeft !== null && (
        <div className={`turn-timer ${urgent ? 'turn-timer-urgent' : ''}`}>
          {timeLeft}s
        </div>
      )}

      {me.chips > callAmount && (
        <div className="raise-selector">
          <div className="raise-label">
            Raise to: <strong>${(raiseAmount || effectiveMin).toLocaleString()}</strong>
          </div>
          <input
            type="range"
            min={effectiveMin}
            max={maxRaise}
            step={gameState.bigBlind || 20}
            value={raiseAmount || effectiveMin}
            onChange={e => setRaiseAmount(parseInt(e.target.value))}
            className="raise-slider"
          />
          <div className="raise-presets">
            {[
              { label: 'Min', value: effectiveMin },
              { label: '½ Pot', value: Math.min(Math.floor((gameState.pot || 0) / 2) + currentBet, maxRaise) },
              { label: 'Pot', value: Math.min((gameState.pot || 0) + currentBet, maxRaise) },
              { label: 'Max', value: maxRaise },
            ].map(p => (
              <button key={p.label} className="btn-preset" onClick={() => setRaiseAmount(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
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

        {me.chips > callAmount && (
          <button className="btn-action btn-raise" onClick={handleRaise}>
            {raiseAmount >= maxRaise ? 'All In' : `Raise $${(raiseAmount || effectiveMin).toLocaleString()}`}
          </button>
        )}

        {me.chips > 0 && (
          <button className="btn-action btn-allin" onClick={() => onAction('all-in', 0)}>
            All In
          </button>
        )}
      </div>
    </div>
  );
}
