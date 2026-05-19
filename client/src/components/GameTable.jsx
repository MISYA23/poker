import React, { useState, useEffect, useRef } from 'react';
import Card from './Card.jsx';
import Avatar, { AVATARS } from './Avatar.jsx';
import BettingControls from './BettingControls.jsx';
import { ChipStack } from './PokerChip.jsx';
import { useActionFlash } from './PlayerSeat.jsx';


function loadSaved() {
  try { return JSON.parse(localStorage.getItem('poker_user')) || {}; }
  catch { return {}; }
}
function patchSaved(patch) {
  localStorage.setItem('poker_user', JSON.stringify({ ...loadSaved(), ...patch }));
}

function saveProfileToDb(patch) {
  const playerId = loadSaved().playerId;
  if (!playerId) return;
  fetch('/api/player/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, ...patch }),
  }).catch(() => {});
}

const TURN_DURATION_MS = 20000;
const VERSION = 'v1.04';

/* Currency visual — set to 'chips' to revert. */
const CURRENCY = 'bananas';

function Bananas({ amount, size = 22 }) {
  if (!amount || amount <= 0) return null;
  const count = amount < 100 ? 1 : amount < 500 ? 2 : 3;
  return (
    <span className="banana-stack" style={{ height: size }}>
      {Array.from({ length: count }).map((_, i) => (
        <img
          key={i}
          src="/assets/bananas.png"
          alt=""
          draggable={false}
          style={{
            width: size * 1.5,
            height: size,
            objectFit: 'contain',
            marginLeft: i > 0 ? -size * 0.7 : 0,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
          }}
        />
      ))}
    </span>
  );
}

function CurrencyStack({ amount, size = 22 }) {
  return CURRENCY === 'bananas'
    ? <Bananas amount={amount} size={size} />
    : <ChipStack amount={amount} size={size} />;
}

function NameEditor() {
  const [name, setName] = React.useState(() => loadSaved().name || '');
  const [saved, setSaved] = React.useState(true);

  function handleChange(e) {
    setName(e.target.value);
    setSaved(false);
  }

  function handleSave() {
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) return;
    setName(trimmed);
    patchSaved({ name: trimmed });
    saveProfileToDb({ name: trimmed });
    setSaved(true);
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        value={name}
        onChange={handleChange}
        onBlur={handleSave}
        maxLength={20}
        className="flex-1 h-8 px-2 text-xs rounded-lg bg-white/10 text-white border border-white/15 focus:border-[color:var(--gold)] outline-none"
      />
      {!saved && (
        <button
          onClick={handleSave}
          className="text-[10px] font-bold text-[color:var(--gold)] px-2 py-1 rounded bg-white/10"
        >
          Save
        </button>
      )}
    </div>
  );
}

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

// Seat positions around the oval for up to 8 opponents
const SEAT_POS = {
  'top-cl':    { top: -60,    left: '32%',  transform: 'translateX(-50%)' },
  'top-cr':    { top: -60,    left: '68%',  transform: 'translateX(-50%)' },
  top:         { top: -60,    left: '50%',  transform: 'translateX(-50%)' },
  'top-left':  { top: 16,     left: -6 },
  'top-right': { top: 16,     right: -6 },
  left:        { top: '32%',  left: -6,     transform: 'translateY(-50%)' },
  right:       { top: '32%',  right: -6,    transform: 'translateY(-50%)' },
  'bot-left':  { bottom: 48,  left: -6 },
  'bot-right': { bottom: 48,  right: -6 },
  bottom:      { bottom: -60, left: '50%',  transform: 'translateX(-50%)' },
};

// Where each player's bet chip appears on the felt (inside the oval, toward center)
const BET_POS = {
  'top':       { top: 58,     left: '50%',  transform: 'translateX(-50%)' },
  'top-cl':    { top: 58,     left: '30%',  transform: 'translateX(-50%)' },
  'top-cr':    { top: 58,     left: '70%',  transform: 'translateX(-50%)' },
  'top-left':  { top: 82,     left: 72 },
  'top-right': { top: 82,     right: 72 },
  'left':      { top: '32%',  left: 90,     transform: 'translateY(-50%)' },
  'right':     { top: '32%',  right: 90,    transform: 'translateY(-50%)' },
  'bot-left':  { bottom: 110, left: 72 },
  'bot-right': { bottom: 110, right: 72 },
  'bottom':    { bottom: 40,  left: '50%',  transform: 'translateX(-50%)' },
};

const OPP_SLOTS = {
  1: ['top'],
  2: ['top-left', 'top-right'],
  3: ['top-left', 'top', 'top-right'],
  4: ['left', 'top-left', 'top-right', 'right'],
  5: ['left', 'top-left', 'top', 'top-right', 'right'],
  6: ['left', 'top-left', 'top', 'top-right', 'right', 'bot-right'],
  7: ['bot-left', 'left', 'top-left', 'top', 'top-right', 'right', 'bot-right'],
  8: ['bot-left', 'left', 'top-left', 'top-cl', 'top-cr', 'top-right', 'right', 'bot-right'],
};

function BetChip({ player }) {
  if (!player || (player.roundBet <= 0 && !player.allIn)) return null;
  return (
    <div className="flex items-center gap-1 text-[10px] font-bold text-[color:var(--gold-light)] bg-black/65 border border-white/15 rounded-lg px-2 py-0.5 whitespace-nowrap shadow">
      {player.roundBet > 0 && player.roundBet.toLocaleString()}
      {player.allIn && <span className="text-red-400 ml-0.5">ALL IN</span>}
    </div>
  );
}

// Renders the action flash label on the felt for a single player.
// Lives in its own component so useActionFlash can be called legally inside a map.
function ActionOnFelt({ player, lastAction, posStyle }) {
  const label = useActionFlash(player, lastAction);
  if (!label || !posStyle) return null;
  return (
    <div className="absolute z-30 pointer-events-none" style={{ position: 'absolute', ...posStyle }}>
      <div className="text-[10px] font-bold text-white bg-black/75 border border-white/20 rounded-lg px-2 py-0.5 whitespace-nowrap shadow">
        {label}
      </div>
    </div>
  );
}

function SeatView({ player, isMe, turnDeadline, win, winFlightDone, displayChips, deckStyle }) {
  const timeLeft = useCountdown(turnDeadline);
  if (!player) return null;

  const showWinLabel = win && !winFlightDone;
  const isActive = player.isCurrentPlayer && !player.folded;
  const showCountdown = timeLeft !== null && timeLeft <= 10;
  const hasCards = player.holeCards?.length > 0;

  const cardSize = isMe ? 'sm' : 'xs';
  const cards = (
    <div className="flex gap-0.5 justify-center"
         style={{ visibility: hasCards && !player.folded ? 'visible' : 'hidden', minHeight: isMe ? 34 : 28 }}>
      {[0, 1].map(i => (
        <Card key={i} card={player.holeCards?.[i]} size={cardSize} deckStyle={deckStyle}
              faceDown={!player.holeCards?.[i] || player.holeCards[i]?.hidden} />
      ))}
    </div>
  );

  return (
    <div className={`flex flex-col items-center gap-0.5 ${player.folded ? 'opacity-40' : ''}`}>
      {cards}
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-all duration-200
        ${isActive
          ? 'bg-black/90 border border-[color:var(--gold)] shadow-[0_0_10px_rgba(212,160,23,0.5)]'
          : 'bg-black/65 border border-white/20'}`}
        style={{ minWidth: 88 }}>
        <Avatar size={36} avatarId={player.avatarId} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold text-white truncate leading-tight" style={{ maxWidth: 58 }}>
            {player.name}
            {player.isDealer     && <span className="ml-0.5 text-[8px] bg-white/20 px-0.5 rounded">D</span>}
            {player.isSmallBlind && <span className="ml-0.5 text-[8px] bg-blue-500/70 px-0.5 rounded">SB</span>}
            {player.isBigBlind   && <span className="ml-0.5 text-[8px] bg-purple-500/70 px-0.5 rounded">BB</span>}
          </div>
          <div className="text-[10px] font-bold text-[color:var(--gold-light)] leading-tight">
            {showWinLabel ? 'Winner!' : (displayChips ?? player.chips).toLocaleString()}
          </div>
        </div>
        {showCountdown && (
          <span className={`text-[10px] font-black flex-shrink-0 ${timeLeft <= 5 ? 'text-red-400' : 'text-white/60'}`}>
            {timeLeft}s
          </span>
        )}
      </div>
    </div>
  );
}

export default function GameTable({ gameState, myId, onAction, onLeave, onLogout, onRematchVote, onAddBot, onRemoveBot, onSetTimers, deckStyle = 'regular' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState('main');
  const [localDeckStyle, setLocalDeckStyle] = useState(() => loadSaved().deckStyle || deckStyle);
  const [localAvatarId, setLocalAvatarId] = useState(() => loadSaved().avatarId || AVATARS[0].id);

  function handleDeckToggle(on) {
    const style = on ? 'four-color' : 'regular';
    setLocalDeckStyle(style);
    patchSaved({ deckStyle: style });
    saveProfileToDb({ deckStyle: style });
  }
  function handleAvatarChange(id) {
    setLocalAvatarId(id);
    patchSaved({ avatarId: id });
    saveProfileToDb({ avatarId: id });
  }
  function openMenu() { setMenuView('main'); setMenuOpen(true); }
  function openHistory() {
    window.open(
      `/hand-history?table=${gameState?.tableNumber}`,
      'handhistory',
      'width=420,height=760,resizable=yes'
    );
  }

  const me = gameState?.players?.find(p => p.id === myId);
  const opponents = gameState?.players?.filter(p => p.id !== myId) || [];
  const waitlistCount = gameState?.waitlistCount || 0;

  // Server's `pot` already includes all committed chips (round bets are accounted for at
  // post-blind/call/raise time). Don't add roundBets again — that double-counts.
  const totalPot = gameState?.pot || 0;

  // Staggered community card reveal:
  // - flop (0→2): 500ms between cards
  // - flop→turn and turn→river: 1000ms IN SHOWDOWN (immediate otherwise)
  const targetCommunityCount = gameState?.communityCards?.length || 0;
  const isShowdownPhase = gameState?.phase === 'showdown';
  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (targetCommunityCount === 0) {
      setRevealedCount(0);
      return;
    }
    if (revealedCount >= targetCommunityCount) return;

    const timers = [];
    let acc = 0;
    for (let i = revealedCount; i < targetCommunityCount; i++) {
      const idx = i;
      timers.push(setTimeout(() => setRevealedCount(idx + 1), acc));
      const nextIdx = i + 1;
      if (nextIdx < targetCommunityCount) {
        if (nextIdx <= 2) acc += 500;                              // within flop
        else if (nextIdx === 3 && isShowdownPhase) acc += 1000;    // flop → turn
        else if (nextIdx === 4 && isShowdownPhase) acc += 1000;    // turn → river
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [targetCommunityCount, isShowdownPhase]);

  // 2s pause after all community cards revealed before awarding the pot
  const [showWinners, setShowWinners] = useState(false);
  useEffect(() => {
    if (!isShowdownPhase) {
      setShowWinners(false);
      return;
    }
    if (revealedCount < targetCommunityCount) {
      setShowWinners(false);
      return;
    }
    const t = setTimeout(() => setShowWinners(true), 2000);
    return () => clearTimeout(t);
  }, [revealedCount, targetCommunityCount, isShowdownPhase]);

  // Winners only "displayed" once showWinners is true (after the pause)
  const winnerMap = {};
  if (showWinners && gameState?.winners) {
    for (const w of gameState.winners) winnerMap[w.playerId] = w;
  }
  const myWin = winnerMap[myId];

  const isMyTurn = gameState?.currentPlayerId === myId &&
    !['waiting', 'showdown'].includes(gameState?.phase);

  const myTurnDeadline = isMyTurn ? gameState?.turnDeadline : null;

  const showdownHandDisplay = (() => {
    if (!showWinners || !gameState?.winners?.length) return null;
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
  const sliderRef = useRef(null);

  // Reset the slider position only when a new turn begins
  useEffect(() => {
    setRaiseAmount(effectiveMin);
    if (sliderRef.current) sliderRef.current.value = String(effectiveMin);
  }, [gameState?.currentPlayerId]);

  // Win flight cinematic — fires once the 2s pause is over
  const [winFlightKey, setWinFlightKey] = useState(0);
  useEffect(() => {
    if (showWinners && gameState?.winners?.length) {
      setWinFlightKey(k => k + 1);
    }
  }, [showWinners]);

  const showdownWinner = showWinners && gameState?.winners?.[0];
  const winnerIsMe = showdownWinner?.playerId === myId;
  const winFlightAmount = showdownWinner?.amount || totalPot;

  // Track when the win-flight has finished (bananas delivered to the winner)
  const [winFlightDone, setWinFlightDone] = useState(false);
  useEffect(() => {
    if (!showWinners) {
      setWinFlightDone(false);
      return;
    }
    const t = setTimeout(() => setWinFlightDone(true), 900); // matches CSS animation duration
    return () => clearTimeout(t);
  }, [showWinners]);

  // Snapshot chips + pot just before showdown so winner info doesn't leak
  // (server zeros pot and credits winner the instant showdown is broadcast).
  const [preShowdownSnapshot, setPreShowdownSnapshot] = useState({ chips: {}, pot: 0 });
  useEffect(() => {
    if (isShowdownPhase) return; // freeze while in showdown
    const chips = {};
    (gameState?.players || []).forEach(p => { chips[p.id] = p.chips; });
    setPreShowdownSnapshot({ chips, pot: gameState?.pot || 0 });
  }, [gameState, isShowdownPhase]);

  // While showdown is animating (until win-flight done), use the snapshot for chips/pot.
  const lockUntilAward = isShowdownPhase && !winFlightDone;
  const displayedPot = lockUntilAward ? preShowdownSnapshot.pot : totalPot;
  const showPotInMiddle = lockUntilAward ? true : (gameState?.pot || 0) > 0;
  const chipsFor = (p) => lockUntilAward
    ? (preShowdownSnapshot.chips[p?.id] ?? p?.chips ?? 0)
    : (p?.chips ?? 0);

  // Game-over modal data
  const isGameOver = gameState?.gameOver === true;
  const myVote = gameState?.myVote;
  const gameWinner = isGameOver
    ? (gameState.players || []).find(p => p.chips > 0)
    : null;
  const iWon = gameWinner?.id === myId;

  return (
    <div className="game-table h-full flex flex-col relative overflow-hidden">
      {/* Floating utilities */}
      <div className="absolute top-2 left-2 z-50 flex items-center gap-2">
        {gameState?.tableNumber && (
          <button
            onClick={openHistory}
            className="w-10 h-10 rounded-lg bg-black/55 border border-white/20 text-white/70 text-base flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Hand history"
            title="Hand history"
          >
            ⏮
          </button>
        )}
        {waitlistCount > 0 && (
          <span className="text-xs px-2 py-1 rounded bg-black/55 text-white/90 border border-white/15">
            {waitlistCount} waiting
          </span>
        )}
      </div>

      {/* Hamburger button */}
      <div className="absolute top-2 right-2 z-50">
        <button
          className="w-10 h-10 rounded-lg bg-black/55 border border-white/20 text-white/90 text-lg font-bold flex items-center justify-center active:scale-95 transition-transform"
          onClick={openMenu}
          aria-label="Menu"
        >
          ☰
        </button>
      </div>

      {/* Menu overlay */}
      {menuOpen && (
        <>
          <div className="absolute inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-12 right-2 z-50 w-52 rounded-2xl bg-[#111] border border-white/15 shadow-2xl overflow-hidden">
            {menuView === 'main' ? (
              <div className="flex flex-col">
                <button
                  className="px-4 py-3 text-left text-sm text-white/90 hover:bg-white/10 transition-colors border-b border-white/10"
                  onClick={() => setMenuView('settings')}
                >
                  ⚙️ Settings
                </button>
                <button
                  className="px-4 py-3 text-left text-sm text-white/90 hover:bg-white/10 transition-colors border-b border-white/10"
                  onClick={() => { setMenuOpen(false); onLeave(); }}
                >
                  🪑 Leave Table
                </button>
                <button
                  className="px-4 py-3 text-left text-sm text-white/90 hover:bg-white/10 transition-colors border-b border-white/10"
                  onClick={() => { setMenuOpen(false); onAddBot?.(); }}
                >
                  🤖 Add Bot
                </button>
                <button
                  className="px-4 py-3 text-left text-sm text-white/90 hover:bg-white/10 transition-colors border-b border-white/10"
                  onClick={() => { setMenuOpen(false); onRemoveBot?.(); }}
                >
                  ➖ Remove Bot
                </button>
                <button
                  className="px-4 py-3 text-left text-sm text-red-400 hover:bg-white/10 transition-colors"
                  onClick={() => { setMenuOpen(false); fetch('/admin/reset', { method: 'POST' }).then(() => window.location.href = '/'); }}
                >
                  🔄 Reset Table
                </button>
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                  <button onClick={() => setMenuView('main')} className="text-white/50 hover:text-white text-xs">←</button>
                  <span className="text-sm font-semibold text-white/90">Settings</span>
                </div>
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Name</p>
                  <NameEditor />
                </div>
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Avatar</p>
                  <div className="flex flex-wrap gap-2">
                    {AVATARS.map(av => (
                      <button
                        key={av.id}
                        onClick={() => handleAvatarChange(av.id)}
                        aria-label={av.label}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xl border-2 transition-all bg-black/40 ${localAvatarId === av.id ? 'border-[color:var(--gold)]' : 'border-white/20'}`}
                      >
                        {av.emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center justify-between px-4 py-3 border-b border-white/10 cursor-pointer">
                  <span className="text-sm text-white/90">4-Color Deck</span>
                  <div
                    onClick={() => handleDeckToggle(localDeckStyle !== 'four-color')}
                    className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${localDeckStyle === 'four-color' ? 'bg-[color:var(--gold)]' : 'bg-white/20'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${localDeckStyle === 'four-color' ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </label>
                <label className="flex items-center justify-between px-4 py-3 border-b border-white/10 cursor-pointer">
                  <span className="text-sm text-white/90">Turn Timer</span>
                  <div
                    onClick={() => onSetTimers?.(!gameState?.timersEnabled)}
                    className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${gameState?.timersEnabled !== false ? 'bg-[color:var(--gold)]' : 'bg-white/20'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${gameState?.timersEnabled !== false ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </label>
                <button
                  className="w-full px-4 py-3 text-left text-sm text-white/90 hover:bg-white/10 transition-colors"
                  onClick={() => { setMenuOpen(false); onLogout?.(); }}
                >
                  🚪 Log Out
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* PLAY AREA */}
      <div className="flex-1 relative min-h-0 px-6 flex items-center justify-center" style={{ paddingTop: 80, paddingBottom: 24 }}>
        <div className="oval-stage relative w-full max-w-[340px] h-full flex items-center justify-center" style={{ maxHeight: 560 }}>

          {/* Felt oval */}
          <div className="felt-oval absolute inset-0" />

          {/* Win-flight cinematic */}
          {showdownWinner && (
            <div key={winFlightKey} className={`win-flight win-flight-${winnerIsMe ? 'down' : 'up'}`}>
              <Bananas amount={winFlightAmount} size={24} />
            </div>
          )}

          {/* Community cards + pot + hand name (center) */}
          <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1.5" style={{ top: '58%' }}>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map(i => {
                const cardData = i < revealedCount ? gameState?.communityCards?.[i] : null;
                if (!cardData) return <div key={i} style={{ width: 40, height: 56 }} aria-hidden="true" />;
                return <Card key={i} card={cardData} size="sm" deckStyle={localDeckStyle} faceDown={false} />;
              })}
            </div>
            <div className="flex items-center gap-1.5 bg-black/45 border border-white/10 rounded-lg px-2 py-0.5 whitespace-nowrap"
                 style={{ visibility: showPotInMiddle ? 'visible' : 'hidden', minHeight: 24 }}>
              <CurrencyStack amount={displayedPot || 0} size={16} />
              <span className="text-xs font-extrabold text-[color:var(--gold-light)]">
                {(displayedPot || 0).toLocaleString()}
              </span>
            </div>
            <div className="hand-name-display text-[11px] whitespace-nowrap" style={{ minHeight: 12 }}>
              {showdownHandDisplay || ' '}
            </div>
            <p className="text-white/30 text-[9px] whitespace-nowrap">
              {[
                gameState?.tableNumber ? `T${gameState.tableNumber}` : null,
                gameState?.handNumber  ? `H${gameState.handNumber}`  : null,
                VERSION,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>

          {/* Opponent seats — dynamic positions */}
          {opponents.length === 0 && (
            <div className="absolute z-10" style={SEAT_POS['top']}>
              <div className="text-white/60 text-xs bg-black/40 rounded-lg px-3 py-1 whitespace-nowrap">Waiting for players…</div>
            </div>
          )}
          {opponents.map((opp, i) => {
            const slots = OPP_SLOTS[Math.min(opponents.length, 8)] || OPP_SLOTS[1];
            const posKey = slots[i] || 'top';
            const oppTurnDeadline = opp.isCurrentPlayer ? gameState?.turnDeadline : null;
            return (
              <React.Fragment key={opp.id}>
                <div className="absolute z-20" style={{ position: 'absolute', ...SEAT_POS[posKey] }}>
                  <SeatView
                    player={opp}
                    isMe={false}
                    turnDeadline={oppTurnDeadline}
                    win={winnerMap[opp.id]}
                    winFlightDone={winFlightDone}
                    displayChips={chipsFor(opp)}
                    deckStyle={localDeckStyle}
                  />
                </div>
                {BET_POS[posKey] && (
                  <div className="absolute z-10" style={{ position: 'absolute', ...BET_POS[posKey] }}>
                    <BetChip player={opp} />
                  </div>
                )}
                <ActionOnFelt player={opp} lastAction={gameState?.lastAction} posStyle={BET_POS[posKey]} />
              </React.Fragment>
            );
          })}

          {/* My seat — always bottom */}
          {me && (
            <div className="absolute z-20" style={{ position: 'absolute', ...SEAT_POS['bottom'] }}>
              <SeatView
                player={me}
                isMe={true}
                turnDeadline={myTurnDeadline}
                win={myWin}
                winFlightDone={winFlightDone}
                displayChips={chipsFor(me)}
                deckStyle={localDeckStyle}
              />
            </div>
          )}

          {/* My bet chip + action label on the felt */}
          {me && (
            <div className="absolute z-10" style={{ position: 'absolute', ...BET_POS['bottom'] }}>
              <BetChip player={me} />
            </div>
          )}
          <ActionOnFelt player={me} lastAction={gameState?.lastAction} posStyle={BET_POS['bottom']} />
        </div>
      </div>

      {/* GAME OVER MODAL */}
      {isGameOver && (
        <div className="game-over-overlay">
          <div className="game-over-modal">
            <div className="game-over-title">
              {iWon ? 'You Won!' : `${gameWinner?.name || 'Opponent'} Won!`}
            </div>

            <div className="winner-art" aria-hidden="true">
              <img className="winner-banana winner-banana-1" src="/assets/bananas.png" alt="" />
              <img className="winner-banana winner-banana-2" src="/assets/bananas.png" alt="" />
              <img className="winner-banana winner-banana-3" src="/assets/bananas.png" alt="" />
              <img className="winner-banana winner-banana-4" src="/assets/bananas.png" alt="" />
              <img className="winner-banana winner-banana-5" src="/assets/bananas.png" alt="" />
              <img className="winner-banana winner-banana-6" src="/assets/bananas.png" alt="" />
              <div className="winner-avatar">
                <Avatar size={110} avatarId={gameWinner?.avatarId} />
              </div>
            </div>

            <div className="game-over-sub">One more for the road ?</div>

            {myVote === null || myVote === undefined ? (
              <div className="game-over-actions">
                <button
                  className="game-over-btn game-over-btn-no"
                  onClick={() => onRematchVote?.(false)}
                >
                  No
                </button>
                <button
                  className="game-over-btn game-over-btn-yes"
                  onClick={() => onRematchVote?.(true)}
                >
                  Play Again
                </button>
              </div>
            ) : (
              <div className="game-over-waiting">
                {myVote
                  ? 'Waiting for opponent…'
                  : 'You left. Returning to lobby…'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ACTIONS BAR — bottom thumb zone (fixed layout, content swaps in place) */}
      <section
        className="flex-shrink-0 relative px-3 pt-2 bg-black/55 border-t border-white/10"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div
          className="flex items-center gap-3 mb-2"
          style={{ visibility: canRaise ? 'visible' : 'hidden' }}
          aria-hidden={!canRaise}
        >
          <input
            ref={sliderRef}
            type="range"
            className="raise-slider-h flex-1 h-8"
            min={effectiveMin || 0}
            max={Math.max(maxRaise, effectiveMin || 0, 1)}
            step={bigBlind}
            defaultValue={effectiveMin || 0}
            onInput={e => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v)) setRaiseAmount(v);
            }}
            disabled={!canRaise}
          />
          <div className="min-w-[64px] text-right text-[color:var(--gold-light)] font-extrabold text-base">
            {(raiseAmount || 0).toLocaleString()}
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <BettingControls
            gameState={gameState}
            myId={myId}
            onAction={onAction}
            raiseAmount={raiseAmount}
            canRaise={canRaise}
          />
        </div>
      </section>
    </div>
  );
}
