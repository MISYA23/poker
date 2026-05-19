import React, { useState, useEffect, useCallback } from 'react';
import Card from './Card.jsx';
import Avatar from './Avatar.jsx';

function loadSaved() {
  try { return JSON.parse(localStorage.getItem('poker_user')) || {}; }
  catch { return {}; }
}

function actionLabel(a) {
  const name = a.player_name || 'Dealer';
  switch (a.action_type) {
    case 'deal':            return 'Cards dealt';
    case 'post_small_blind': return `${name} posts small blind (${a.amount})`;
    case 'post_big_blind':  return `${name} posts big blind (${a.amount})`;
    case 'fold':            return `${name} folds`;
    case 'check':           return `${name} checks`;
    case 'call':            return `${name} calls${a.amount ? ` (${a.amount})` : ''}`;
    case 'bet':             return `${name} bets ${a.amount}`;
    case 'raise':           return `${name} raises to ${a.amount}`;
    case 'all-in':          return `${name} goes ALL IN${a.amount ? ` (${a.amount})` : ''}`;
    default:                return `${name}: ${a.action_type}`;
  }
}

function MiniSeat({ player, isMe, isShowdown }) {
  if (!player) return null;
  const showCards = isMe || isShowdown;
  const isActive = !player.folded && !player.allIn;

  return (
    <div className={`flex flex-col items-center gap-0.5 ${player.folded ? 'opacity-30' : ''}`}>
      <div className="flex gap-0.5 justify-center" style={{ minHeight: 30 }}>
        {[0, 1].map(i => {
          const card = player.holeCards?.[i];
          if (!card) return <div key={i} style={{ width: 22, height: 30 }} />;
          return (
            <Card key={i} card={card} size="xs" faceDown={!showCards || !card.rank} />
          );
        })}
      </div>
      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold
        ${isMe ? 'bg-[color:var(--gold)]/20 border border-[color:var(--gold)]/50' : 'bg-black/60 border border-white/20'}`}>
        <Avatar size={14} avatarId={player.avatarId} />
        <span className="text-white truncate max-w-[44px]">{player.name}</span>
        <span className="text-[color:var(--gold-light)]">{player.chips.toLocaleString()}</span>
      </div>
      {player.roundBet > 0 && (
        <div className="text-[8px] text-[color:var(--gold-light)] font-bold">{player.roundBet}</div>
      )}
      {player.allIn && (
        <div className="text-[8px] text-red-400 font-black">ALL IN</div>
      )}
    </div>
  );
}

const SEAT_POS = {
  top:         { top: -52,   left: '50%', transform: 'translateX(-50%)' },
  'top-left':  { top: 12,    left: -4 },
  'top-right': { top: 12,    right: -4 },
  left:        { top: '38%', left: -4,   transform: 'translateY(-50%)' },
  right:       { top: '38%', right: -4,  transform: 'translateY(-50%)' },
  bottom:      { bottom: -52, left: '50%', transform: 'translateX(-50%)' },
};

const OPP_SLOTS = {
  1: ['top'], 2: ['top-left','top-right'], 3: ['top-left','top','top-right'],
  4: ['left','top-left','top-right','right'], 5: ['left','top-left','top','top-right','right'],
};

export default function HandHistory({ tableNumber, onClose }) {
  const [hands, setHands] = useState([]);
  const [handIdx, setHandIdx] = useState(null);   // index into hands[]
  const [actions, setActions] = useState([]);
  const [actionIdx, setActionIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  const saved = loadSaved();
  const myGoogleSub = saved.sub || null;
  const myName = saved.name || null;

  // Load hand list
  useEffect(() => {
    if (!tableNumber) return;
    fetch(`/api/table/${tableNumber}/hands`)
      .then(r => r.json())
      .then(data => {
        setHands(data);
        if (data.length) setHandIdx(data.length - 1); // start at most recent
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tableNumber]);

  // Load actions when hand changes
  useEffect(() => {
    if (handIdx === null || !hands[handIdx]) return;
    setActions([]);
    setActionIdx(0);
    fetch(`/api/hand/${hands[handIdx].id}/actions`)
      .then(r => r.json())
      .then(data => {
        setActions(data);
        setActionIdx(data.length - 1); // start at last action
      });
  }, [handIdx]);

  const goHand = useCallback((dir) => {
    setHandIdx(i => Math.max(0, Math.min(hands.length - 1, i + dir)));
  }, [hands.length]);

  const goAction = useCallback((dir) => {
    setActionIdx(i => Math.max(0, Math.min(actions.length - 1, i + dir)));
  }, [actions.length]);

  const currentAction = actions[actionIdx];
  const snapshot = currentAction?.metadata?.snapshot;
  const hand = hands[handIdx];
  const isShowdown = snapshot?.phase === 'showdown' || snapshot?.winners?.length > 0;

  // Identify "me" in the snapshot
  const myPlayer = snapshot?.players?.find(p =>
    (myGoogleSub && p.googleSub === myGoogleSub) || p.name === myName
  );
  const opponents = snapshot?.players?.filter(p => p !== myPlayer) || [];
  const oppSlots = OPP_SLOTS[Math.min(opponents.length, 5)] || [];

  if (loading) return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div className="text-white/60">Loading hand history…</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="text-xs text-white/50">
          Table #{tableNumber} · Hand #{hand?.hand_number ?? '?'} of {hands.length}
        </div>
        <button onClick={onClose} className="text-white/50 hover:text-white text-lg leading-none">✕</button>
      </div>

      {/* Mini table */}
      <div className="flex-1 flex items-center justify-center min-h-0 px-8 py-4">
        {snapshot ? (
          <div className="relative w-full max-w-[300px]" style={{ height: 320 }}>
            {/* Felt oval */}
            <div className="felt-oval absolute inset-0" style={{ borderWidth: 6 }} />

            {/* Community cards + pot */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10">
              <div className="flex gap-0.5">
                {[0,1,2,3,4].map(i => {
                  const card = snapshot.communityCards?.[i];
                  if (!card) return <div key={i} style={{ width: 22, height: 30 }} />;
                  return <Card key={i} card={card} size="xs" faceDown={false} />;
                })}
              </div>
              {snapshot.pot > 0 && (
                <div className="text-[10px] font-bold text-[color:var(--gold-light)] bg-black/50 rounded px-2 py-0.5">
                  Pot: {snapshot.pot.toLocaleString()}
                </div>
              )}
            </div>

            {/* Opponent seats */}
            {opponents.map((opp, i) => (
              <div key={opp.id || i} className="absolute z-20" style={{ position: 'absolute', ...SEAT_POS[oppSlots[i] || 'top'] }}>
                <MiniSeat player={opp} isMe={false} isShowdown={isShowdown} />
              </div>
            ))}

            {/* My seat */}
            {(myPlayer || snapshot.players?.[0]) && (
              <div className="absolute z-20" style={{ position: 'absolute', ...SEAT_POS['bottom'] }}>
                <MiniSeat player={myPlayer || snapshot.players[0]} isMe={true} isShowdown={isShowdown} />
              </div>
            )}
          </div>
        ) : (
          <div className="text-white/40 text-sm">No data for this action</div>
        )}
      </div>

      {/* Action label */}
      <div className="flex-shrink-0 px-4 py-2 text-center">
        <div className="text-xs text-white/40 mb-0.5">
          Action {actionIdx + 1} of {actions.length} · {snapshot?.phase || ''}
        </div>
        <div className="text-sm font-semibold text-white">
          {currentAction ? actionLabel(currentAction) : '—'}
        </div>
        {snapshot?.winners?.length > 0 && (
          <div className="text-xs text-[color:var(--gold-light)] mt-0.5">
            {snapshot.winners[0] && `${snapshot.players?.find(p => p.id === snapshot.winners[0].playerId)?.name} wins ${snapshot.winners[0].amount?.toLocaleString()}`}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-shrink-0 flex items-center justify-center gap-3 px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 border-t border-white/10">
        <button onClick={() => goHand(-1)} disabled={handIdx === 0}
          className="w-11 h-11 rounded-xl bg-black/50 border border-white/15 text-white/70 disabled:opacity-25 text-base font-bold active:scale-95 transition-transform">
          «
        </button>
        <button onClick={() => goAction(-1)} disabled={actionIdx === 0}
          className="w-11 h-11 rounded-xl bg-black/50 border border-white/15 text-white/90 disabled:opacity-25 text-base font-bold active:scale-95 transition-transform">
          ‹
        </button>
        <div className="text-[10px] text-white/30 w-16 text-center leading-tight">
          {hand?.hand_number ? `Hand #${hand.hand_number}` : ''}<br />
          {actions.length ? `${actionIdx + 1}/${actions.length}` : ''}
        </div>
        <button onClick={() => goAction(1)} disabled={actionIdx >= actions.length - 1}
          className="w-11 h-11 rounded-xl bg-black/50 border border-white/15 text-white/90 disabled:opacity-25 text-base font-bold active:scale-95 transition-transform">
          ›
        </button>
        <button onClick={() => goHand(1)} disabled={handIdx >= hands.length - 1}
          className="w-11 h-11 rounded-xl bg-black/50 border border-white/15 text-white/70 disabled:opacity-25 text-base font-bold active:scale-95 transition-transform">
          »
        </button>
      </div>
    </div>
  );
}
