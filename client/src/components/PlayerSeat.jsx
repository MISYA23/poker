import { useEffect, useState } from 'react';

const ACTION_DISPLAY_MS = 2000;

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
