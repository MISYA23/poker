import React, { useState, useEffect, useCallback } from 'react';
import Card from './Card.jsx';
import Avatar from './Avatar.jsx';
import { useActionFlash } from './PlayerSeat.jsx';

function loadSaved() {
  try { return JSON.parse(localStorage.getItem('poker_user')) || {}; }
  catch { return {}; }
}

function describeAction(a) {
  if (!a) return '';
  const name = a.player_name || '';
  switch (a.action_type) {
    case 'deal':              return '🃏 Cards dealt';
    case 'post_small_blind':  return `${name} posts small blind — ${a.amount}`;
    case 'post_big_blind':    return `${name} posts big blind — ${a.amount}`;
    case 'fold':              return `${name} folds`;
    case 'check':             return `${name} checks`;
    case 'call':              return `${name} calls${a.amount ? ` — ${a.amount}` : ''}`;
    case 'bet':               return `${name} bets ${a.amount}`;
    case 'raise':             return `${name} raises to ${a.amount}`;
    case 'all-in':            return `${name} goes ALL IN${a.amount ? ` — ${a.amount}` : ''}`;
    default:                  return `${name}: ${a.action_type}`;
  }
}

const SEAT_POS = {
  top:         { top: -68,   left: '50%', transform: 'translateX(-50%)' },
  'top-left':  { top: 20,    left: -8 },
  'top-right': { top: 20,    right: -8 },
  left:        { top: '40%', left: -8,   transform: 'translateY(-50%)' },
  right:       { top: '40%', right: -8,  transform: 'translateY(-50%)' },
  bottom:      { bottom: -68, left: '50%', transform: 'translateX(-50%)' },
};

const OPP_SLOTS = {
  1: ['top'],
  2: ['top-left', 'top-right'],
  3: ['top-left', 'top', 'top-right'],
  4: ['left', 'top-left', 'top-right', 'right'],
  5: ['left', 'top-left', 'top', 'top-right', 'right'],
};

function ReplaySeat({ player, isMe, isShowdown }) {
  if (!player) return null;
  const showHole = isMe || isShowdown;

  return (
    <div className={`flex flex-col items-center gap-1 ${player.folded ? 'opacity-35' : ''}`}>
      {/* Hole cards */}
      <div className="flex gap-1 justify-center" style={{ minHeight: 44 }}>
        {[0, 1].map(i => {
          const card = player.holeCards?.[i];
          if (!card) return <div key={i} style={{ width: 30, height: 44 }} />;
          return <Card key={i} card={card} size="sm" faceDown={!showHole || !card.rank} />;
        })}
      </div>

      {/* Chip / name plate */}
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full
        ${isMe
          ? 'bg-black/90 border border-[color:var(--gold)] shadow-[0_0_10px_rgba(212,160,23,0.4)]'
          : 'bg-black/70 border border-white/25'}`}
        style={{ minWidth: 96 }}>
        <Avatar size={28} avatarId={player.avatarId} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold text-white truncate leading-tight" style={{ maxWidth: 60 }}>
            {player.name}
            {player.isDealer     && <span className="ml-0.5 text-[8px] bg-white/20 px-0.5 rounded">D</span>}
            {player.isSmallBlind && <span className="ml-0.5 text-[8px] bg-blue-500/70 px-0.5 rounded">SB</span>}
            {player.isBigBlind   && <span className="ml-0.5 text-[8px] bg-purple-500/70 px-0.5 rounded">BB</span>}
          </div>
          <div className="text-[10px] font-bold text-[color:var(--gold-light)] leading-tight">
            {player.chips.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Bet */}
      {player.roundBet > 0 && (
        <div className="text-[10px] font-bold text-[color:var(--gold-light)] bg-black/60 rounded px-1.5 py-0.5">
          {player.roundBet.toLocaleString()}
        </div>
      )}
      {player.allIn && (
        <div className="text-[9px] font-black text-red-400">ALL IN</div>
      )}
    </div>
  );
}

export default function HandHistoryPage() {
  const params = new URLSearchParams(window.location.search);
  const tableNumber = parseInt(params.get('table') || '0', 10);

  const [hands, setHands] = useState([]);
  const [handIdx, setHandIdx] = useState(null);
  const [actions, setActions] = useState([]);
  const [actionIdx, setActionIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  const saved = loadSaved();
  const myGoogleSub = saved.sub || null;
  const myName = saved.name || null;

  useEffect(() => {
    document.title = `Hand History — Table #${tableNumber}`;
    fetch(`/api/table/${tableNumber}/hands`)
      .then(r => r.json())
      .then(data => {
        setHands(data);
        if (data.length) setHandIdx(data.length - 1);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tableNumber]);

  useEffect(() => {
    if (handIdx === null || !hands[handIdx]) return;
    setActions([]);
    setActionIdx(0);
    fetch(`/api/hand/${hands[handIdx].id}/actions`)
      .then(r => r.json())
      .then(data => {
        setActions(data);
        setActionIdx(data.length - 1);
      });
  }, [handIdx]);

  const goHand   = useCallback(d => setHandIdx(i => Math.max(0, Math.min(hands.length - 1, i + d))), [hands.length]);
  const goAction = useCallback(d => setActionIdx(i => Math.max(0, Math.min(actions.length - 1, i + d))), [actions.length]);

  const hand    = hands[handIdx];
  const current = actions[actionIdx];
  const snap    = current?.metadata?.snapshot;
  const isShowdown = snap?.phase === 'showdown' || snap?.winners?.length > 0;

  const myPlayer  = snap?.players?.find(p =>
    (myGoogleSub && p.googleSub === myGoogleSub) || p.name === myName
  ) || snap?.players?.[0];
  const opponents = snap?.players?.filter(p => p !== myPlayer) || [];
  const oppSlots  = OPP_SLOTS[Math.min(opponents.length, 5)] || [];

  const winnerName = snap?.winners?.[0]
    ? snap.players?.find(p => p.id === snap.winners[0].playerId)?.name
    : hand?.winner_name;

  if (loading) return (
    <div className="game-table h-full flex items-center justify-center">
      <p className="text-white/50">Loading…</p>
    </div>
  );

  if (!hands.length) return (
    <div className="game-table h-full flex items-center justify-center">
      <p className="text-white/50">No hands recorded for Table #{tableNumber} yet.</p>
    </div>
  );

  return (
    <div className="game-table h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/10">
        <div className="text-xs text-white/50">
          Table #{tableNumber}
        </div>
        <div className="text-sm font-bold text-[color:var(--gold-light)]">
          Hand #{hand?.hand_number ?? '?'}
          <span className="text-white/30 font-normal"> of {hands.length}</span>
        </div>
        <div className="text-xs text-white/30">
          {hand?.winner_name && `${hand.winner_name} won`}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 flex items-center justify-center min-h-0 px-8" style={{ paddingTop: 60, paddingBottom: 20 }}>
        {snap ? (
          <div className="oval-stage relative w-full max-w-[340px] h-full flex items-center justify-center" style={{ maxHeight: 500 }}>
            <div className="felt-oval absolute inset-0" />

            {/* Community cards + pot */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map(i => {
                  const card = snap.communityCards?.[i];
                  if (!card) return <div key={i} style={{ width: 30, height: 44 }} />;
                  return <Card key={i} card={card} size="sm" faceDown={false} />;
                })}
              </div>
              {snap.pot > 0 && (
                <div className="text-xs font-bold text-[color:var(--gold-light)] bg-black/50 border border-white/10 rounded-lg px-3 py-1">
                  Pot: {snap.pot.toLocaleString()}
                </div>
              )}
              {isShowdown && winnerName && (
                <div className="text-[11px] font-bold text-[color:var(--gold-light)] text-center">
                  {hand?.winning_hand || `${winnerName} wins`}
                </div>
              )}
            </div>

            {/* Opponent seats */}
            {opponents.map((opp, i) => (
              <div key={opp.id || i} className="absolute z-20" style={{ position: 'absolute', ...SEAT_POS[oppSlots[i] || 'top'] }}>
                <ReplaySeat player={opp} isMe={false} isShowdown={isShowdown} />
              </div>
            ))}

            {/* My seat */}
            {myPlayer && (
              <div className="absolute z-20" style={{ position: 'absolute', ...SEAT_POS['bottom'] }}>
                <ReplaySeat player={myPlayer} isMe={true} isShowdown={isShowdown} />
              </div>
            )}
          </div>
        ) : (
          <div className="text-white/30 text-sm">No data</div>
        )}
      </div>

      {/* Action description */}
      <div className="flex-shrink-0 text-center px-6 py-2">
        <div className="text-sm font-semibold text-white">
          {describeAction(current)}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-3 border-t border-white/10"
           style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <button onClick={() => goHand(-1)} disabled={handIdx === 0}
          className="w-12 h-12 rounded-xl bg-black/50 border border-white/15 text-white/80 disabled:opacity-20 text-lg font-bold active:scale-95 transition-transform flex items-center justify-center">
          «
        </button>
        <button onClick={() => goAction(-1)} disabled={actionIdx === 0}
          className="w-12 h-12 rounded-xl bg-black/50 border border-white/15 text-white disabled:opacity-20 text-lg font-bold active:scale-95 transition-transform flex items-center justify-center">
          ‹
        </button>
        <div className="text-[10px] text-white/30 text-center w-20 leading-relaxed">
          Hand #{hand?.hand_number}<br />
          {actionIdx + 1} / {actions.length}
        </div>
        <button onClick={() => goAction(1)} disabled={actionIdx >= actions.length - 1}
          className="w-12 h-12 rounded-xl bg-black/50 border border-white/15 text-white disabled:opacity-20 text-lg font-bold active:scale-95 transition-transform flex items-center justify-center">
          ›
        </button>
        <button onClick={() => goHand(1)} disabled={handIdx >= hands.length - 1}
          className="w-12 h-12 rounded-xl bg-black/50 border border-white/15 text-white/80 disabled:opacity-20 text-lg font-bold active:scale-95 transition-transform flex items-center justify-center">
          »
        </button>
      </div>
    </div>
  );
}
