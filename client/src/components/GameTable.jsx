import React, { useState, useEffect } from 'react';
import Card from './Card.jsx';
import PlayerSeat, { useActionFlash } from './PlayerSeat.jsx';
import Avatar from './Avatar.jsx';
import BettingControls from './BettingControls.jsx';
import { ChipStack } from './PokerChip.jsx';

function useCountdown(deadline) {
  const [timeLeft, setTimeLeft] = useState(null);
  useEffect(() => {
    if (!deadline) { setTimeLeft(null); return; }
    const update = () => setTimeLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [deadline]);
  return timeLeft;
}

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

  const TURN_DURATION_MS = 20000;
  const myTurnDeadline = isMyTurn ? gameState?.turnDeadline : null;
  const myElapsedMs = myTurnDeadline
    ? Math.min(TURN_DURATION_MS, TURN_DURATION_MS - Math.max(0, myTurnDeadline - Date.now()))
    : 0;
  const myTimeLeft = useCountdown(myTurnDeadline);
  const myShowCountdown = myTimeLeft !== null && myTimeLeft <= 10;
  const myActionLabel = useActionFlash(me, gameState?.lastAction);

  const showdownHandDisplay = (() => {
    if (gameState?.phase !== 'showdown' || !gameState?.winners?.length) return null;
    const w = gameState.winners[0];
    if (!w) return null;
    const winnerName = gameState.players?.find(p => p.id === w.playerId)?.name;
    if (w.handName && w.handName !== 'Winner') return w.handName;
    return winnerName ? `${winnerName} wins` : 'Winner';
  })();

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

      <div className="table-top-actions">
        {waitlistCount > 0 && <span className="waitlist-pill">{waitlistCount} waiting</span>}
        <button className="btn-ghost btn-sm" onClick={onLeave}>Leave</button>
        <button className="btn-ghost btn-sm btn-reset" onClick={() => fetch('/admin/reset', { method: 'POST' }).then(() => window.location.href = '/')}>Reset</button>
      </div>

      {/* Opponent seat — OUTSIDE the oval, above */}
      <div className="above-table">
        {others.map(player => (
          <PlayerSeat key={player.id} player={player} isMe={false}
            win={winnerMap[player.id]}
            lastAction={gameState?.lastAction}
            turnDeadline={player.isCurrentPlayer ? gameState?.turnDeadline : null} />
        ))}
        {others.length === 0 && (
          <div className="waiting-msg">Waiting for opponent…</div>
        )}
      </div>

      {/* The oval — only contains community cards, pot, and bets */}
      <div className="table-oval">
        <div className="table-felt">

          {me?.isDealer && (
            <div className="dealer-button dealer-button-bottom" title="Dealer">D</div>
          )}
          {others[0]?.isDealer && (
            <div className="dealer-button dealer-button-top" title="Dealer">D</div>
          )}

          <div className="felt-bet felt-bet-top" style={{ visibility: others[0]?.roundBet > 0 ? 'visible' : 'hidden' }}>
            <ChipStack amount={others[0]?.roundBet || 0} size={24} />
            <span className="felt-bet-amount">${(others[0]?.roundBet || 0).toLocaleString()}</span>
          </div>

          <div className="table-center">
            <div className="community-area">
              <div className="community-cards">
                {[0, 1, 2, 3, 4].map(i => (
                  <Card key={i} card={gameState?.communityCards?.[i]} size="xl"
                    faceDown={!gameState?.communityCards?.[i]} />
                ))}
              </div>
              <div className="pot-info" style={{ visibility: totalPot > 0 ? 'visible' : 'hidden' }}>
                <ChipStack amount={totalPot || 0} size={26} />
                <span className="pot-amount">${(totalPot || 0).toLocaleString()}</span>
              </div>
              <div className="hand-name-display">
                {showdownHandDisplay || ' '}
              </div>
            </div>
          </div>

          <div className="felt-bet felt-bet-bottom" style={{ visibility: (me?.roundBet > 0 && !myWin) ? 'visible' : 'hidden' }}>
            <ChipStack amount={me?.roundBet || 0} size={24} />
            <span className="felt-bet-amount">${(me?.roundBet || 0).toLocaleString()}</span>
          </div>

        </div>
      </div>

      {/* My seat — OUTSIDE the oval, below */}
      <div className="below-table">
        {me && (
          <div className={`player-seat seat-me ${isMyTurn ? 'seat-active' : ''} ${me.folded ? 'seat-folded' : ''}`}>
            <div className="seat-content">
              <div
                className="seat-cards seat-cards-fan"
                style={{ visibility: me.holeCards?.length > 0 ? 'visible' : 'hidden' }}
              >
                {[0, 1].map(i => (
                  <Card
                    key={i}
                    card={me.holeCards?.[i]}
                    size="lg"
                    faceDown={!me.holeCards?.[i] || me.folded}
                  />
                ))}
              </div>

              <div className="nameplate-row">
                <div className={`seat-timer-left ${myShowCountdown ? 'visible' : ''} ${myTimeLeft <= 5 ? 'urgent' : ''}`}>
                  {myShowCountdown ? `${myTimeLeft}s` : ''}
                </div>

                <div className="nameplate-stack">
                  <div className="nameplate">
                    <div className="np-text">
                      <span className="np-name">
                        {me.name}
                        {me.isSmallBlind && <span className="badge badge-sb">SB</span>}
                        {me.isBigBlind && <span className="badge badge-bb">BB</span>}
                        {me.allIn && <span className="badge badge-allin">ALL IN</span>}
                      </span>
                      <span className={`np-chips ${myActionLabel ? 'np-chips-action' : ''} ${myWin ? 'np-chips-winner' : ''}`}>
                      {myWin ? 'Winner' : (myActionLabel || me.chips.toLocaleString())}
                    </span>
                    </div>
                    <div className="np-avatar">
                      <Avatar size={52} avatarId={me.avatarId} />
                    </div>
                  </div>

                  <div className="turn-bar" aria-hidden="true">
                    <div
                      className="turn-bar-fill"
                      key={myTurnDeadline || 'idle'}
                      style={myTurnDeadline ? {
                        animation: `turn-countdown ${TURN_DURATION_MS}ms linear forwards`,
                        animationDelay: `-${myElapsedMs}ms`,
                      } : { clipPath: 'inset(0 0 0 0%)' }}
                    />
                  </div>
                </div>

                <div className="np-phantom" aria-hidden="true" />
              </div>
            </div>

            <div className="seat-actions">
              <BettingControls
                gameState={gameState}
                myId={myId}
                onAction={onAction}
                raiseAmount={raiseAmount}
                canRaise={canRaise}
              />
            </div>

          </div>
        )}
      </div>

      {/* Vertical raise slider — overlays the table when raising */}
      {canRaise && (
        <div className="raise-panel">
          <div className="raise-amount-label">${raiseAmount.toLocaleString()}</div>
          <input
            type="range"
            className="raise-slider-v"
            min={effectiveMin}
            max={maxRaise}
            step={bigBlind}
            value={raiseAmount}
            onChange={e => setRaiseAmount(parseInt(e.target.value))}
          />
        </div>
      )}

    </div>
  );
}
