import React from 'react';
import Card from './Card.jsx';
import PlayerSeat from './PlayerSeat.jsx';
import BettingControls from './BettingControls.jsx';
import WinnerDisplay from './WinnerDisplay.jsx';

const PHASE_LABELS = {
  waiting: 'Waiting for players...',
  'pre-flop': 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

export default function GameTable({ gameState, myId, onAction, onLeave }) {
  const me = gameState?.players?.find(p => p.id === myId);
  const others = gameState?.players?.filter(p => p.id !== myId) || [];
  const waitlistCount = gameState?.waitlistCount || 0;

  const totalPot = (gameState?.pot || 0) +
    (gameState?.players || []).reduce((s, p) => s + (p.roundBet || 0), 0);

  return (
    <div className="game-table">
      <div className="table-header">
        <div className="table-phase">{PHASE_LABELS[gameState?.phase] || gameState?.phase}</div>
        <div className="table-meta">
          {waitlistCount > 0 && (
            <span className="waitlist-pill">{waitlistCount} waiting</span>
          )}
          <button className="btn-ghost btn-sm" onClick={onLeave}>Leave</button>
        </div>
      </div>

      <div className="table-top">
        <div className="other-players">
          {others.map(player => (
            <PlayerSeat key={player.id} player={player} isMe={false} compact={others.length > 3} />
          ))}
          {others.length === 0 && (
            <div className="waiting-msg">Waiting for other players to join...</div>
          )}
        </div>
      </div>

      <div className="table-center">
        <div className="community-area">
          <div className="community-cards">
            {[0, 1, 2, 3, 4].map(i => (
              <Card
                key={i}
                card={gameState?.communityCards?.[i]}
                size="md"
                faceDown={!gameState?.communityCards?.[i]}
              />
            ))}
          </div>
          {totalPot > 0 && (
            <div className="pot-info">
              <span className="pot-label">POT</span>
              <span className="pot-amount">${totalPot.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {gameState?.phase === 'showdown' && gameState?.winners?.length > 0 && (
        <WinnerDisplay winners={gameState.winners} />
      )}

      <div className="table-bottom">
        {me && (
          <div className="my-area">
            <div className="my-info">
              <span className="my-name">
                {me.name}
                {me.isDealer && <span className="badge badge-dealer">D</span>}
                {me.isSmallBlind && <span className="badge badge-sb">SB</span>}
                {me.isBigBlind && <span className="badge badge-bb">BB</span>}
                {me.allIn && <span className="badge badge-allin">ALL IN</span>}
              </span>
              <span className="my-chips">${me.chips.toLocaleString()}</span>
            </div>

            {me.roundBet > 0 && (
              <div className="my-bet">Bet: ${me.roundBet.toLocaleString()}</div>
            )}

            <div className="my-cards">
              {me.holeCards?.map((card, i) => (
                <Card key={i} card={card} size="lg" faceDown={me.folded} />
              ))}
              {(!me.holeCards || me.holeCards.length === 0) && gameState?.phase !== 'waiting' && (
                <div className="no-cards">Sitting out — joining next hand</div>
              )}
            </div>

            {me.folded && <div className="folded-banner">You folded</div>}
          </div>
        )}

        {gameState?.currentPlayerId === myId && (
          <BettingControls gameState={gameState} myId={myId} onAction={onAction} />
        )}

        {gameState?.lastAction && gameState?.phase !== 'waiting' && (
          <div className="last-action">
            {gameState.lastAction.name}: <strong>{gameState.lastAction.action}</strong>
            {gameState.lastAction.amount ? ` $${gameState.lastAction.amount.toLocaleString()}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}
