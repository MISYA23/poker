import React, { useState, useEffect } from 'react';
import Card from './Card.jsx';
import PlayerSeat from './PlayerSeat.jsx';
import BettingControls from './BettingControls.jsx';
import { ChipStack } from './PokerChip.jsx';

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

  const isMyTurn = gameState?.currentPlayerId === myId &&
    !['waiting', 'showdown'].includes(gameState?.phase);

  const currentBet = gameState?.currentBet || 0;
  const myBet = me?.roundBet || 0;
  const callAmount = Math.min(currentBet - myBet, me?.chips || 0);
  const bigBlind = gameState?.bigBlind || 20;
  const minRaise = currentBet + (gameState?.minRaise || bigBlind);
  const maxRaise = myBet + (me?.chips || 0);
  const effectiveMin = Math.min(minRaise, maxRaise);
  const canRaise = isMyTurn && (me?.chips || 0) > callAmount;

  const [raiseAmount, setRaiseAmount] = useState(effectiveMin);

  useEffect(() => {
    setRaiseAmount(effectiveMin);
  }, [gameState?.currentPlayerId]);

  return (
    <div className="game-table">

      {/* Opponents + top-right controls */}
      <div className="table-top">
        <div className="other-players">
          {others.map(player => (
            <PlayerSeat key={player.id} player={player} isMe={false}
              compact={others.length > 3} win={winnerMap[player.id]}
              turnDeadline={player.isCurrentPlayer ? gameState?.turnDeadline : null} />
          ))}
          {others.length === 0 && (
            <div className="waiting-msg">Waiting for other players to join...</div>
          )}
        </div>
        <div className="table-top-actions">
          {waitlistCount > 0 && <span className="waitlist-pill">{waitlistCount} waiting</span>}
          <button className="btn-ghost btn-sm" onClick={onLeave}>Leave</button>
          <button className="btn-ghost btn-sm btn-reset" onClick={() => fetch('/admin/reset', { method: 'POST' })}>Reset</button>
        </div>
      </div>

      {/* Felt: community cards + pot, with vertical raise slider on the right */}
      <div className="table-main">
        <div className="table-center">
          <div className="community-area">
            <div className="community-cards">
              {[0, 1, 2, 3, 4].map(i => (
                <Card key={i} card={gameState?.communityCards?.[i]} size="md"
                  faceDown={!gameState?.communityCards?.[i]} />
              ))}
            </div>
            {totalPot > 0 && (
              <div className="pot-info">
                <ChipStack amount={totalPot} size={26} />
                <span className="pot-amount">${totalPot.toLocaleString()}</span>
              </div>
            )}
            {gameState?.lastAction && gameState?.phase !== 'waiting' && (
              <div className="last-action">
                {gameState.lastAction.name}: <strong>{gameState.lastAction.action}</strong>
                {gameState.lastAction.amount ? ` $${gameState.lastAction.amount.toLocaleString()}` : ''}
              </div>
            )}
          </div>
        </div>

        {/* Vertical raise slider — only when it's your turn and you can raise */}
        <div className={`raise-panel ${canRaise ? 'raise-panel-active' : ''}`}>
          {canRaise && (
            <>
              <div className="raise-amount-label">${raiseAmount.toLocaleString()}</div>
              <div className="raise-presets-v">
                {[
                  { label: 'Max', value: maxRaise },
                  { label: 'Pot', value: Math.min((gameState?.pot || 0) + currentBet, maxRaise) },
                  { label: '½', value: Math.min(Math.floor((gameState?.pot || 0) / 2) + currentBet, maxRaise) },
                  { label: 'Min', value: effectiveMin },
                ].map(p => (
                  <button key={p.label} className="btn-preset-v" onClick={() => setRaiseAmount(p.value)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                type="range"
                className="raise-slider-v"
                min={effectiveMin}
                max={maxRaise}
                step={bigBlind}
                value={raiseAmount}
                onChange={e => setRaiseAmount(parseInt(e.target.value))}
              />
            </>
          )}
        </div>
      </div>

      {/* My info + cards */}
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
                <ChipStack amount={me.roundBet} size={28} />
              </div>
            )}

            {myWin && (
              <div className="my-win">
                <ChipStack amount={myWin.amount} size={28} />
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
      </div>

      {/* Fixed action bar — always occupies space, buttons appear when it's your turn */}
      <div className="action-bar">
        <BettingControls
          gameState={gameState}
          myId={myId}
          onAction={onAction}
          raiseAmount={raiseAmount}
          canRaise={canRaise}
        />
      </div>

    </div>
  );
}
