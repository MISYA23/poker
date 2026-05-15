import React, { useState, useEffect } from 'react';
import Card from './Card.jsx';
import Avatar from './Avatar.jsx';
import { ChipStack } from './PokerChip.jsx';

const TURN_DURATION_MS = 20000;
const ACTION_DISPLAY_MS = 2000;
const RING_R = 30;
const RING_CIRC = 2 * Math.PI * RING_R; // 188.5

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

function formatActionLabel(a) {
  if (!a) return '';
  switch (a.action) {
    case 'fold': return 'Fold';
    case 'check': return 'Check';
    case 'call': return a.amount ? `Call $${a.amount.toLocaleString()}` : 'Call';
    case 'bet': return a.amount ? `Bet $${a.amount.toLocaleString()}` : 'Bet';
    case 'raise': return a.amount ? `Raise $${a.amount.toLocaleString()}` : 'Raise';
    case 'all-in': return 'All In';
    default: return a.action;
  }
}

export function useActionFlash(player, lastAction) {
  const [label, setLabel] = useState(null);
  const actionT = lastAction && lastAction.playerId === player?.id ? lastAction.t : null;
  useEffect(() => {
    if (!actionT) return;
    setLabel(formatActionLabel(lastAction));
    const id = setTimeout(() => setLabel(null), ACTION_DISPLAY_MS);
    return () => clearTimeout(id);
  }, [actionT]);
  return label;
}

function TimerRing({ turnDeadline, elapsedMs, timeLeft }) {
  if (!turnDeadline) return null;
  const urgentClass = timeLeft !== null && timeLeft <= 5 ? 'ring-urgent'
    : timeLeft !== null && timeLeft <= 10 ? 'ring-warning' : '';
  return (
    <svg
      className={`avatar-timer-ring ${urgentClass}`}
      width={64} height={64}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <circle className="ring-track" cx="32" cy="32" r={RING_R} />
      <circle
        key={turnDeadline}
        className="ring-fill"
        cx="32" cy="32" r={RING_R}
        style={{
          animationDuration: `${TURN_DURATION_MS}ms`,
          animationDelay: `-${elapsedMs}ms`,
        }}
      />
    </svg>
  );
}

export default function PlayerSeat({ player, isMe, win = null, turnDeadline = null, lastAction = null, actions = null }) {
  const timeLeft = useTurnTimer(turnDeadline);
  const actionLabel = useActionFlash(player, lastAction);
  if (!player) return <div className="player-seat player-seat-empty" />;

  const elapsedMs = turnDeadline
    ? Math.min(TURN_DURATION_MS, TURN_DURATION_MS - Math.max(0, turnDeadline - Date.now()))
    : 0;

  return (
    <div className={`player-seat ${player.isCurrentPlayer ? 'seat-active' : ''} ${player.folded ? 'seat-folded' : ''} ${isMe ? 'seat-me' : 'seat-opponent'}`}>
      <div className="seat-content">
        <div
          className="seat-cards seat-cards-fan"
          style={{ visibility: player.holeCards?.length > 0 ? 'visible' : 'hidden' }}
        >
          {[0, 1].map(i => (
            <Card
              key={i}
              card={player.holeCards?.[i]}
              size="lg"
              faceDown={!player.holeCards?.[i] || player.holeCards[i]?.hidden}
            />
          ))}
        </div>

        <div className="nameplate-row">
          <div className="nameplate-stack">
            <div className="nameplate">
              <div className="np-text">
                <span className="np-name">
                  {player.name}
                  {player.isSmallBlind && <span className="badge badge-sb">SB</span>}
                  {player.isBigBlind && <span className="badge badge-bb">BB</span>}
                  {player.allIn && <span className="badge badge-allin">ALL IN</span>}
                </span>
                <span className={`np-chips ${actionLabel ? 'np-chips-action' : ''} ${win ? 'np-chips-winner' : ''}`}>
                  {win ? 'Winner' : (actionLabel || player.chips.toLocaleString())}
                </span>
              </div>
              <div className="np-avatar">
                <Avatar size={52} avatarId={player.avatarId} />
                <TimerRing turnDeadline={turnDeadline} elapsedMs={elapsedMs} timeLeft={timeLeft} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="seat-actions">{actions}</div>
    </div>
  );
}
