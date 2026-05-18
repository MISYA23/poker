import React, { useState, useEffect, useRef } from 'react';
import Card from './Card.jsx';
import Avatar from './Avatar.jsx';
import BettingControls from './BettingControls.jsx';
import { ChipStack } from './PokerChip.jsx';
import { useActionFlash } from './PlayerSeat.jsx';

const AVATARS = [
  { id: 'alfie', label: 'Alfie', src: '/assets/alfie.png' },
  { id: 'jazz',  label: 'Jazz',  src: '/assets/jazz.png' },
];

function loadSaved() {
  try { return JSON.parse(localStorage.getItem('poker_user')) || {}; }
  catch { return {}; }
}
function patchSaved(patch) {
  localStorage.setItem('poker_user', JSON.stringify({ ...loadSaved(), ...patch }));
}

const TURN_DURATION_MS = 20000;
const VERSION = 'v1.01';

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

/* Nameplate (no cards) — sits at the oval edge */
function NameplateOnly({ player, isMe, turnDeadline, lastAction, win, winFlightDone, displayChips }) {
  const timeLeft = useCountdown(turnDeadline);
  const actionLabel = useActionFlash(player, lastAction);
  if (!player) return null;
  // Once the win-flight has finished delivering bananas, swap WINNER label for the new chip count
  const showWinLabel = win && !winFlightDone;
  const chipsToShow = displayChips ?? player.chips;

  const elapsedMs = turnDeadline
    ? Math.min(TURN_DURATION_MS, TURN_DURATION_MS - Math.max(0, turnDeadline - Date.now()))
    : 0;
  const showCountdown = timeLeft !== null && timeLeft <= 10;
  const folded = player.folded;
  const isActive = player.isCurrentPlayer && !folded;

  return (
    <div className={`nameplate-row flex items-center justify-center gap-2 ${isActive ? 'seat-active' : ''} ${folded ? 'seat-folded' : ''}`}>
      <div className={`seat-timer-left ${showCountdown ? 'visible' : ''} ${timeLeft <= 5 ? 'urgent' : ''}`}>
        {showCountdown ? `${timeLeft}s` : ''}
      </div>

      <div className="nameplate-stack">
        <div className={`nameplate ${isMe ? 'nameplate-me' : 'nameplate-opp'}`}>
          <div className="np-text">
            <span className="np-name">
              {player.name}
              {player.isSmallBlind && <span className="badge badge-sb">SB</span>}
              {player.isBigBlind && <span className="badge badge-bb">BB</span>}
            </span>
            <span className={`np-chips ${actionLabel ? 'np-chips-action' : ''} ${showWinLabel ? 'np-chips-winner' : ''}`}>
              {showWinLabel ? 'Winner' : (actionLabel || chipsToShow.toLocaleString())}
            </span>
          </div>
          <div className="np-avatar np-avatar-big">
            <Avatar size={138} avatarId={player.avatarId} />
          </div>
        </div>

        <div className="turn-bar" aria-hidden="true">
          <div
            className="turn-bar-fill"
            key={turnDeadline || 'idle'}
            style={turnDeadline ? {
              animation: `turn-countdown ${TURN_DURATION_MS}ms linear forwards`,
              animationDelay: `-${elapsedMs}ms`,
            } : { clipPath: 'inset(0 0 0 0%)' }}
          />
        </div>
      </div>

      <div className="np-phantom" aria-hidden="true" />
    </div>
  );
}

function HoleCardsRow({ player, deckStyle }) {
  const folded = player?.folded;
  const hasCards = player?.holeCards?.length > 0;
  return (
    <div
      className="seat-cards seat-cards-fan flex gap-1.5 justify-center"
      style={{ visibility: (hasCards && !folded) ? 'visible' : 'hidden' }}
    >
      {[0, 1].map(i => (
        <Card
          key={i}
          card={player?.holeCards?.[i]}
          size="md"
          deckStyle={deckStyle}
          faceDown={!player?.holeCards?.[i] || player.holeCards[i]?.hidden}
        />
      ))}
    </div>
  );
}

export default function GameTable({ gameState, myId, onAction, onLeave, onRematchVote, deckStyle = 'regular' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState('main');
  const [localDeckStyle, setLocalDeckStyle] = useState(() => loadSaved().deckStyle || deckStyle);
  const [localAvatarId, setLocalAvatarId] = useState(() => loadSaved().avatarId || 'alfie');

  function handleDeckToggle(on) {
    const style = on ? 'four-color' : 'regular';
    setLocalDeckStyle(style);
    patchSaved({ deckStyle: style });
  }
  function handleAvatarChange(id) {
    setLocalAvatarId(id);
    patchSaved({ avatarId: id });
  }
  function handleLogout() {
    window.google?.accounts.id.disableAutoSelect();
    localStorage.removeItem('poker_user');
    onLeave();
  }
  function openMenu() { setMenuView('main'); setMenuOpen(true); }

  const me = gameState?.players?.find(p => p.id === myId);
  const others = gameState?.players?.filter(p => p.id !== myId) || [];
  const opponent = others[0];
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
  const opponentTurnDeadline = opponent?.isCurrentPlayer ? gameState?.turnDeadline : null;

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
                  onClick={() => { setMenuOpen(false); handleLogout(); }}
                >
                  🚪 Log Out
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
                  <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Avatar</p>
                  <div className="flex gap-3">
                    {AVATARS.map(av => (
                      <button
                        key={av.id}
                        onClick={() => handleAvatarChange(av.id)}
                        className={`w-12 h-12 rounded-full overflow-hidden border-2 transition-all ${localAvatarId === av.id ? 'border-[color:var(--gold)]' : 'border-white/20'}`}
                      >
                        <img src={av.src} alt={av.label} className="w-full h-full object-cover object-[center_20%]" />
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center justify-between px-4 py-3 cursor-pointer">
                  <span className="text-sm text-white/90">4-Color Deck</span>
                  <div
                    onClick={() => handleDeckToggle(localDeckStyle !== 'four-color')}
                    className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${localDeckStyle === 'four-color' ? 'bg-[color:var(--gold)]' : 'bg-white/20'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${localDeckStyle === 'four-color' ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </label>
              </div>
            )}
          </div>
        </>
      )}

      {/* PLAY AREA: oval with nameplates at edges, opponent's cards above the nameplate */}
      <div className="flex-1 relative min-h-0 px-3 flex items-center justify-center" style={{ paddingTop: 130, paddingBottom: 28 }}>
        <div className="oval-stage relative w-full max-w-[340px] h-full flex items-center justify-center" style={{ maxHeight: 600 }}>

          {/* Felt oval */}
          <div className="felt-oval absolute inset-0" />

          {/* Win-flight cinematic — bananas fly from pot to winner's nameplate */}
          {showdownWinner && (
            <div key={winFlightKey} className={`win-flight win-flight-${winnerIsMe ? 'down' : 'up'}`}>
              <Bananas amount={winFlightAmount} size={28} />
            </div>
          )}

          {/* Dealer button on the felt (top-right next to opponent's cards) */}
          {opponent?.isDealer && (
            <div
              className="dealer-button-felt absolute z-10"
              style={{ top: 70, right: 'calc(50% - 105px)' }}
              title="Dealer"
            >D</div>
          )}

          {/* Dealer button on the felt (bottom player → top-left of player area, spaced from cards) */}
          {me?.isDealer && (
            <div
              className="dealer-button-felt absolute z-10"
              style={{ bottom: 100, left: 'calc(50% - 120px)' }}
              title="Dealer"
            >D</div>
          )}

          {/* Opponent hole cards — closer to the left avatar, ~6 px gap from frame */}
          <div className="absolute z-10" style={{ top: -58, left: '50%', transform: 'translateX(calc(-50% + 18px))' }}>
            {opponent ? (
              <HoleCardsRow player={opponent} deckStyle={localDeckStyle} />
            ) : (
              <div className="text-white/60 text-sm bg-black/40 rounded-lg px-3 py-1 whitespace-nowrap">Waiting for opponent…</div>
            )}
          </div>

          {/* Opponent bet — close to opponent's nameplate */}
          <div
            className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 whitespace-nowrap"
            style={{ top: 70, visibility: (opponent?.roundBet > 0 || opponent?.allIn) ? 'visible' : 'hidden' }}
          >
            {opponent?.roundBet > 0 && (
              <>
                <CurrencyStack amount={opponent?.roundBet || 0} size={20} />
                <span className="felt-bet-amount text-sm">{(opponent?.roundBet || 0).toLocaleString()}</span>
              </>
            )}
            {opponent?.allIn && <span className="all-in-triangle" aria-label="All In"><span>ALL</span><span>IN</span></span>}
          </div>

          {/* Community + pot + hand name (center) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-2">
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map(i => {
                const cardData = i < revealedCount ? gameState?.communityCards?.[i] : null;
                if (!cardData) {
                  // Empty slot — reserve space but show nothing (no card back)
                  return <div key={i} style={{ width: 56, height: 60 }} aria-hidden="true" />;
                }
                return (
                  <Card
                    key={i}
                    card={cardData}
                    size="md"
                    deckStyle={localDeckStyle}
                    faceDown={false}
                  />
                );
              })}
            </div>

            <div
              className="flex items-center gap-2 bg-black/45 border border-white/10 rounded-lg px-3 py-1 whitespace-nowrap"
              style={{ visibility: showPotInMiddle ? 'visible' : 'hidden', minHeight: 30 }}
            >
              <CurrencyStack amount={displayedPot || 0} size={20} />
              <span className="text-sm font-extrabold text-[color:var(--gold-light)]">
                {(displayedPot || 0).toLocaleString()}
              </span>
            </div>

            <div className="hand-name-display text-[12px] whitespace-nowrap" style={{ minHeight: 14 }}>
              {showdownHandDisplay || ' '}
            </div>
          </div>

          {/* My bet — close to my cards */}
          <div
            className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 whitespace-nowrap"
            style={{ bottom: 125, visibility: ((me?.roundBet > 0 || me?.allIn) && !myWin) ? 'visible' : 'hidden' }}
          >
            {me?.roundBet > 0 && (
              <>
                <CurrencyStack amount={me?.roundBet || 0} size={20} />
                <span className="felt-bet-amount text-sm">{(me?.roundBet || 0).toLocaleString()}</span>
              </>
            )}
            {me?.allIn && <span className="all-in-triangle" aria-label="All In"><span>ALL</span><span>IN</span></span>}
          </div>

          {/* My hole cards — closer still to the avatar */}
          <div className="absolute z-10" style={{ bottom: 48, left: '50%', transform: 'translateX(calc(-50% - 8px))' }}>
            {me && <HoleCardsRow player={me} deckStyle={localDeckStyle} />}
          </div>

          {/* Opponent nameplate AT top edge of oval */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
            {opponent && (
              <NameplateOnly
                player={opponent}
                isMe={false}
                turnDeadline={opponentTurnDeadline}
                lastAction={gameState?.lastAction}
                win={winnerMap[opponent.id]}
                winFlightDone={winFlightDone}
                displayChips={chipsFor(opponent)}
              />
            )}
          </div>

          {/* My nameplate AT bottom edge of oval */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-20">
            {me && (
              <NameplateOnly
                player={me}
                isMe={true}
                turnDeadline={myTurnDeadline}
                lastAction={gameState?.lastAction}
                win={myWin}
                winFlightDone={winFlightDone}
                displayChips={chipsFor(me)}
              />
            )}
          </div>
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
        <p className="text-center text-white/20 text-[10px] mb-1">{VERSION}</p>
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
