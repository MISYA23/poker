import React, { useState } from 'react';

export default function BettingControls({ gameState, myId, onAction }) {
  const me = gameState?.players?.find(p => p.id === myId);
  const [raiseAmount, setRaiseAmount] = useState(0);

  if (!me || gameState?.currentPlayerId !== myId) return null;
  if (['waiting', 'showdown'].includes(gameState?.phase)) return null;

  const currentBet = gameState.currentBet || 0;
  const myBet = me.roundBet || 0;
  const callAmount = Math.min(currentBet - myBet, me.chips);
  const canCheck = myBet >= currentBet;
  const minRaise = currentBet + (gameState.minRaise || gameState.bigBlind || 20);
  const maxRaise = myBet + me.chips;

  const effectiveMin = Math.min(minRaise, maxRaise);
  const sliderMin = effectiveMin;
  const sliderMax = maxRaise;

  useState(() => {
    setRaiseAmount(effectiveMin);
  });

  const handleRaise = () => {
    const amt = raiseAmount || effectiveMin;
    if (amt >= maxRaise) {
      onAction('all-in', 0);
    } else {
      onAction('raise', amt);
    }
  };

  return (
    <div className="betting-controls">
      {raiseAmount > 0 && raiseAmount < maxRaise && (
        <div className="raise-selector">
          <div className="raise-label">
            Raise to: <strong>${raiseAmount.toLocaleString()}</strong>
          </div>
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={gameState.bigBlind || 20}
            value={raiseAmount || sliderMin}
            onChange={e => setRaiseAmount(parseInt(e.target.value))}
            className="raise-slider"
          />
          <div className="raise-presets">
            {[
              { label: 'Min', value: effectiveMin },
              { label: '½ Pot', value: Math.min(Math.floor(gameState.pot / 2) + currentBet, maxRaise) },
              { label: 'Pot', value: Math.min(gameState.pot + currentBet, maxRaise) },
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
          <button
            className="btn-action btn-raise"
            onClick={() => {
              if (raiseAmount === 0) setRaiseAmount(effectiveMin);
              else handleRaise();
            }}
          >
            {raiseAmount > 0 ? (raiseAmount >= maxRaise ? 'All In' : `Raise $${raiseAmount.toLocaleString()}`) : 'Raise'}
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
