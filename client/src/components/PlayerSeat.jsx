import { useEffect, useRef, useState } from 'react';

const ACTION_DISPLAY_MS = 2000;
// Bet bananas flash window — shorter than action label so the visual clears
// before the community cards animate in (see GameTable card-reveal delay).
const BET_FLASH_MS = 1200;

function formatActionLabel(a) {
  if (!a) return '';
  switch (a.action) {
    case 'fold': return 'Fold';
    case 'check': return 'Check';
    case 'call': return a.amount ? `Call ${a.amount.toLocaleString()}` : 'Call';
    case 'bet': return a.amount ? `Bet ${a.amount.toLocaleString()}` : 'Bet';
    case 'raise': return a.amount ? `Raise ${a.amount.toLocaleString()}` : 'Raise';
    case 'all-in': return 'All In';
    default: return a.action;
  }
}

// Non-all-in actions flash on the nameplate for ACTION_DISPLAY_MS then clear.
// All-in is sticky: stays visible until `forceClear` flips true (pot delivered).
// The timeout is tracked in a ref so the OTHER player acting (which causes
// actionT for this player to flip to null) does not cancel the pending clear.
export function useActionFlash(player, lastAction, forceClear) {
  const [recentLabel, setRecentLabel] = useState(null);
  const timeoutRef = useRef(null);
  const actionT = lastAction && lastAction.playerId === player?.id ? lastAction.t : null;

  useEffect(() => {
    if (!actionT) return;
    if (lastAction.action === 'all-in') return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setRecentLabel(formatActionLabel(lastAction));
    timeoutRef.current = setTimeout(() => {
      setRecentLabel(null);
      timeoutRef.current = null;
    }, ACTION_DISPLAY_MS);
  }, [actionT]);

  useEffect(() => {
    if (forceClear) {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      setRecentLabel(null);
    }
  }, [forceClear]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  if (player?.allIn && !forceClear) return 'All In';
  return recentLabel;
}

// On-felt bet visual:
// 1) When roundBet > 0, show roundBet live.
// 2) When the player acts with bet/call/raise/all-in but the round ended on the
//    same server tick (so the client only sees roundBet=0), flash the action
//    amount for BET_FLASH_MS so the bananas register before community cards
//    animate in.
// 3) When roundBet drops from positive → 0 without an action trigger, fade
//    after BET_FLASH_MS.
export function useBetFlash(player, lastAction) {
  const [stickyAmount, setStickyAmount] = useState(0);
  const timeoutRef = useRef(null);
  const roundBet = player?.roundBet || 0;
  const actionT = lastAction && lastAction.playerId === player?.id ? lastAction.t : null;
  const isBetAction = lastAction && ['bet', 'raise', 'call', 'all-in'].includes(lastAction.action);

  useEffect(() => {
    if (roundBet > 0) {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      setStickyAmount(roundBet);
    } else if (stickyAmount > 0 && !timeoutRef.current) {
      timeoutRef.current = setTimeout(() => {
        setStickyAmount(0);
        timeoutRef.current = null;
      }, BET_FLASH_MS);
    }
  }, [roundBet]);

  useEffect(() => {
    if (!actionT || !isBetAction) return;
    if (roundBet > 0) return; // live path already handles it
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setStickyAmount(lastAction.amount || 0);
    timeoutRef.current = setTimeout(() => {
      setStickyAmount(0);
      timeoutRef.current = null;
    }, BET_FLASH_MS);
  }, [actionT]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return stickyAmount;
}
