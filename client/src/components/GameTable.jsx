import React from 'react';
import Card from './Card.jsx';
import PlayerSeat from './PlayerSeat.jsx';
import BettingControls from './BettingControls.jsx';
import { ChipStack } from './PokerChip.jsx';

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

  const winnerMap = {};
  if (gameState?.phase === 'showdown' && gameState?.winners) {
    for (const w of gameState.winners) winnerMap[w.playerId] = w;
  }
  const myWin = winnerMap[myId];

  return (
    <div className="game-table">
      <div className="table-top">
        <div className="other-players">
          {others.map(player => (
            <PlayerSeat key={player.id} player={player} isMe={false} compact={others.length > 3} win={winnerMap[player.id]}
              turnDeadline={player.isCurrentPlayer ? gameState?.turnDeadline : null} />
          ))}
          {others.length === 0 && (
            <div className="waiting-msg">Waiting for other players to join...</div>
          )}
        </div>
        <div className="table-top-actions">
          {waitlistCount > 0 && (
            <span className="waitlist-pill">{waitlistCount} waiting</span>
          )}
          <button className="btn-ghost btn-sm" onClick={onLeave}>Leave</button>
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
              <ChipStack amount={totalPot} size={26} />
              <span className="pot-amount">${totalPot.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

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

            {me.roundBet > 0 && !myWin && (
              <div className="my-bet-chips">
                <ChipStack amount={me.roundBet} size={30} />
              </div>
            )}

            {myWin && (
              <div className="my-win">
                <ChipStack amount={myWin.amount} size={30} />
                <span className="my-win-hand">{myWin.handName}</span>
              </div>
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
