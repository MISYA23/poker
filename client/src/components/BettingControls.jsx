import React from 'react';

const BTN_BASE = 'flex-1 min-w-0 h-14 min-h-[56px] rounded-2xl font-extrabold text-base tracking-tight ' +
  'active:scale-[0.97] transition-transform duration-150 text-white shadow-[0_2px_6px_rgba(0,0,0,0.5)] ' +
  'overflow-hidden text-ellipsis whitespace-nowrap px-2';

function Btn({ visible, className, children, onClick }) {
  return (
    <button
      type="button"
      className={`${BTN_BASE} ${className}`}
      style={{ visibility: visible ? 'visible' : 'hidden' }}
      onClick={visible ? onClick : undefined}
      disabled={!visible}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
    >
      {children || ' '}
    </button>
  );
}

export default function BettingControls({ gameState, myId, onAction, raiseAmount, canRaise }) {
  const me = gameState?.players?.find(p => p.id === myId);

  const isMyTurn = gameState?.currentPlayerId === myId &&
    !['waiting', 'showdown'].includes(gameState?.phase);

  const currentBet = gameState?.currentBet || 0;
  const myBet = me?.roundBet || 0;
  const callAmount = Math.min(currentBet - myBet, me?.chips || 0);
  const canCheck = myBet >= currentBet;
  const maxRaise = myBet + (me?.chips || 0);
  const isOpeningWager = currentBet === 0;

  const handleRaise = () => {
    const amt = raiseAmount || 0;
    onAction(amt >= maxRaise ? 'all-in' : 'raise', amt);
  };

  const show = isMyTurn;
  const hasChips = (me?.chips || 0) > 0;
  // Calling matches the bet — but if it eats all the remaining chips, it's an all-in.
  const callIsAllIn = !canCheck && callAmount > 0 && callAmount >= (me?.chips || 0);

  return (
    <>
      {/* Slot 1 — Fold */}
      <Btn
        visible={show}
        className="bg-gradient-to-br from-[#c0392b] to-[#7d201a]"
        onClick={() => onAction('fold')}
      >
        Fold
      </Btn>

      {/* Slot 2 — Check / Call (shows "All In" when calling would put you all-in) */}
      <Btn
        visible={show}
        className={canCheck
          ? 'bg-gradient-to-br from-[#34495e] to-[#1f2d3a]'
          : (callIsAllIn
              ? 'bg-gradient-to-br from-[#8e44ad] to-[#5b2c75]'
              : 'bg-gradient-to-br from-[#2980b9] to-[#1a577e]')}
        onClick={() => onAction(canCheck ? 'check' : 'call')}
      >
        {canCheck
          ? 'Check'
          : callIsAllIn
            ? 'All In'
            : `Call${callAmount > 0 ? ` ${callAmount.toLocaleString()}` : ''}`}
      </Btn>

      {/* Slot 3 — Raise / Bet (with slider) — shows "All In" when slider is at max OR
                                  when the minimum raise already would put you all-in.
          When you can't raise at all (chips <= callAmount), this slot stays hidden. */}
      <Btn
        visible={show && canRaise}
        className="bg-gradient-to-br from-[#d4a017] to-[#8b6914] text-black"
        onClick={handleRaise}
      >
        {raiseAmount >= maxRaise
          ? 'All In'
          : `${isOpeningWager ? 'Bet' : 'Raise'} ${(raiseAmount || 0).toLocaleString()}`}
      </Btn>
    </>
  );
}
