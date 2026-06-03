import React, { useContext, useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Image, ScrollView, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import Card from '../components/Card';
import Avatar from '../components/Avatar';
import { ChipStack } from '../components/PokerChip';
import BettingControls from '../components/BettingControls';
import { colors } from '../theme';
import { SERVER_URL, VERSION } from '../config';

const TURN_DURATION_MS = 20000;

// ─── Seat positions (calculated from oval dimensions via onLayout) ──────────
// Returns absolute style for each slot, centered on seat width ~110pt
function getSeatStyle(posKey, W, H) {
  const SW = 110; // approx seat width
  switch (posKey) {
    case 'top':        return { top: -60,    left: W / 2 - SW / 2 };
    case 'top-cl':     return { top: -60,    left: W * 0.32 - SW / 2 };
    case 'top-cr':     return { top: -60,    left: W * 0.68 - SW / 2 };
    case 'top-left':   return { top: 10,     left: -10 };
    case 'top-right':  return { top: 10,     right: -10 };
    case 'left':       return { top: H * 0.32 - 30, left: -10 };
    case 'right':      return { top: H * 0.32 - 30, right: -10 };
    case 'bot-left':   return { bottom: 44,  left: -10 };
    case 'bot-right':  return { bottom: 44,  right: -10 };
    case 'bottom':     return { bottom: -60, left: W / 2 - SW / 2 };
    default:           return { top: -60,    left: W / 2 - SW / 2 };
  }
}

function getBetStyle(posKey, W, H) {
  switch (posKey) {
    case 'top':        return { top: 52,    left: W / 2 - 30 };
    case 'top-cl':     return { top: 52,    left: W * 0.30 - 30 };
    case 'top-cr':     return { top: 52,    left: W * 0.70 - 30 };
    case 'top-left':   return { top: 72,    left: 62 };
    case 'top-right':  return { top: 72,    right: 62 };
    case 'left':       return { top: H * 0.32 - 12, left: 78 };
    case 'right':      return { top: H * 0.32 - 12, right: 78 };
    case 'bot-left':   return { bottom: 96, left: 62 };
    case 'bot-right':  return { bottom: 96, right: 62 };
    case 'bottom':     return { bottom: 34, left: W / 2 - 30 };
    default:           return { top: 52,    left: W / 2 - 30 };
  }
}

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

// ─── Hooks ───────────────────────────────────────────────────────────────────
function useCountdown(deadline) {
  const [t, setT] = useState(null);
  useEffect(() => {
    if (!deadline) { setT(null); return; }
    const upd = () => setT(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    upd();
    const id = setInterval(upd, 200);
    return () => clearInterval(id);
  }, [deadline]);
  return t;
}

function useActionFlash(player, lastAction) {
  const [label, setLabel] = useState(null);
  const seen = useRef(null);
  const actionT = lastAction?.playerId === player?.id ? lastAction?.t : null;
  useEffect(() => {
    if (!actionT || actionT === seen.current) return;
    seen.current = actionT;
    const a = lastAction;
    const fmt = { fold: 'Fold', check: 'Check', call: `Call`, bet: `Bet`, raise: `Raise`, 'all-in': 'All In' };
    setLabel(fmt[a.action] || a.action);
    const id = setTimeout(() => setLabel(null), 2000);
    return () => clearTimeout(id);
  }, [actionT]);
  return label;
}

function useCenterAction(lastAction) {
  const [label, setLabel] = useState(null);
  const seen = useRef(null);
  useEffect(() => {
    if (!lastAction?.t || lastAction.t === seen.current) return;
    seen.current = lastAction.t;
    const { name, action, amount } = lastAction;
    const fmt = n => n?.toLocaleString();
    const text = {
      fold:    `${name} folds`,
      check:   `${name} checks`,
      call:    amount ? `${name} calls ${fmt(amount)}` : `${name} calls`,
      bet:     amount ? `${name} bets ${fmt(amount)}` : `${name} bets`,
      raise:   amount ? `${name} raises to ${fmt(amount)}` : `${name} raises`,
      'all-in': `${name} is all in`,
    }[action] || `${name} ${action}`;
    setLabel(text);
    const id = setTimeout(() => setLabel(null), 3000);
    return () => clearTimeout(id);
  }, [lastAction?.t]);
  return label;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TimerRing({ deadline }) {
  const [dashOffset, setDashOffset] = useState(188);
  const [timeLeft, setTimeLeft] = useState(null);
  const CIRC = 2 * Math.PI * 14;

  useEffect(() => {
    if (!deadline) { setDashOffset(CIRC); setTimeLeft(null); return; }
    const tick = () => {
      const rem = Math.max(0, deadline - Date.now());
      const el = TURN_DURATION_MS - rem;
      setDashOffset((el / TURN_DURATION_MS) * CIRC);
      setTimeLeft(Math.ceil(rem / 1000));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;
  // Simple circle using View since we removed react-native-svg
  return null; // fallback — countdown shown as text
}

function SeatView({ player, turnDeadline, lastAction, win, displayChips, deckStyle, hideCards }) {
  const timeLeft = useCountdown(turnDeadline);
  const actionLabel = useActionFlash(player, lastAction);
  if (!player) return null;

  const isActive = player.isCurrentPlayer && !player.folded;
  const showCountdown = timeLeft !== null && timeLeft <= 10;
  const hasCards = player.holeCards?.length > 0;

  return (
    <View style={[s.seatWrap, player.folded && s.seatFolded]}>
      {/* Small cards (suppressed for local player — large cards shown separately) */}
      {!hideCards && (
        <View style={[s.seatCards, (!hasCards || player.folded) && s.hidden]}>
          {[0, 1].map(i => (
            <Card key={i} card={player.holeCards?.[i]} size="xs" deckStyle={deckStyle}
              faceDown={!player.holeCards?.[i] || !!player.holeCards[i]?.hidden} />
          ))}
        </View>
      )}

      {/* Name pill */}
      <View style={[s.namePill, isActive && s.namePillActive]}>
        <Avatar size={28} avatarId={player.avatarId} />
        <View style={s.nameInfo}>
          <View style={s.nameRow}>
            <Text style={s.pName} numberOfLines={1}>{player.name}</Text>
            {player.isDealer     && <Text style={s.badge}>D</Text>}
            {player.isSmallBlind && <Text style={[s.badge, s.badgeSB]}>SB</Text>}
            {player.isBigBlind   && <Text style={[s.badge, s.badgeBB]}>BB</Text>}
          </View>
          <Text style={s.pChips} numberOfLines={1}>
            {win ? '🏆 Winner!' : (actionLabel || (displayChips ?? player.chips).toLocaleString())}
          </Text>
        </View>
        {showCountdown && (
          <Text style={[s.cdText, timeLeft <= 5 && s.cdUrgent]}>{timeLeft}s</Text>
        )}
      </View>
    </View>
  );
}

function BetBadge({ player }) {
  if (!player || (player.roundBet <= 0 && !player.allIn)) return null;
  return (
    <View style={s.betBadge}>
      {player.roundBet > 0 && <ChipStack amount={player.roundBet} size={14} />}
      {player.roundBet > 0 && <Text style={s.betAmt}>{player.roundBet.toLocaleString()}</Text>}
      {player.allIn && <Text style={s.allInTag}>ALL IN</Text>}
    </View>
  );
}

function WinFlight({ show, toBottom, amount }) {
  const anim = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!show) return;
    anim.setValue(0);
    opacity.setValue(1);
    Animated.parallel([
      Animated.timing(anim, { toValue: toBottom ? 120 : -120, duration: 900, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
    ]).start();
  }, [show, toBottom]);

  if (!show) return null;
  return (
    <Animated.View style={[s.winFlight, { transform: [{ translateY: anim }], opacity }]}>
      <ChipStack amount={amount} size={24} />
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function GameScreen() {
  const { gameState, myId, onAction, onLeave, onRematch, emit, matchOver } = useContext(GameContext);

  const [deckStyle, setDeckStyle] = useState('regular');
  const [menuOpen, setMenuOpen] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();
  // Oval size derived from window dimensions — stable during gameplay, updates only on resize
  const ovalSize = {
    width:  winW - 48,           // horizontal stage padding (24 each side)
    height: Math.max(160, winH - 44 - 90 - 160 - 88), // topBar + actionsBar + paddingVertical + safeArea estimate
  };

  const me = gameState?.players?.find(p => p.id === myId);
  const opponents = gameState?.players?.filter(p => p.id !== myId) || [];
  const waitlistCount = gameState?.waitlistCount || 0;

  const totalPot = gameState?.pot || 0;

  // Staggered community card reveal
  const targetCC = gameState?.communityCards?.length || 0;
  const isShowdown = gameState?.phase === 'showdown';
  const [revealedCC, setRevealedCC] = useState(0);
  useEffect(() => {
    if (targetCC === 0) { setRevealedCC(0); return; }
    if (revealedCC >= targetCC) return;
    const timers = [];
    let acc = 0;
    for (let i = revealedCC; i < targetCC; i++) {
      timers.push(setTimeout(() => setRevealedCC(i + 1), acc));
      const next = i + 1;
      if (next < targetCC) {
        if (next <= 2) acc += 500;
        else if (next === 3 && isShowdown) acc += 1000;
        else if (next === 4 && isShowdown) acc += 1000;
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [targetCC, isShowdown]);

  // 2s pause before showing winners
  const [showWinners, setShowWinners] = useState(false);
  useEffect(() => {
    if (!isShowdown) { setShowWinners(false); return; }
    if (revealedCC < targetCC) { setShowWinners(false); return; }
    const t = setTimeout(() => setShowWinners(true), 2000);
    return () => clearTimeout(t);
  }, [revealedCC, targetCC, isShowdown]);

  const winnerMap = {};
  if (showWinners && gameState?.winners) {
    for (const w of gameState.winners) winnerMap[w.playerId] = w;
  }
  const myWin = winnerMap[myId];

  // Win flight
  const [winFlightKey, setWinFlightKey] = useState(0);
  const [winFlightDone, setWinFlightDone] = useState(false);
  useEffect(() => {
    if (!showWinners || !gameState?.winners?.length) return;
    setWinFlightKey(k => k + 1);
    setWinFlightDone(false);
    const t = setTimeout(() => setWinFlightDone(true), 950);
    return () => clearTimeout(t);
  }, [showWinners]);

  // Chip snapshot for showdown animation
  const [snap, setSnap] = useState({ chips: {}, pot: 0 });
  useEffect(() => {
    if (isShowdown) return;
    const chips = {};
    (gameState?.players || []).forEach(p => { chips[p.id] = p.chips; });
    setSnap({ chips, pot: gameState?.pot || 0 });
  }, [gameState, isShowdown]);

  const locked = isShowdown && !winFlightDone;
  const displayPot = locked ? snap.pot : totalPot;
  const chipsFor = p => locked ? (snap.chips[p?.id] ?? p?.chips ?? 0) : (p?.chips ?? 0);

  // Center action narration
  const centerAction = useCenterAction(gameState?.lastAction);

  // Showdown hand name
  const handName = (() => {
    if (!showWinners || !gameState?.winners?.length) return null;
    const w = gameState.winners[0];
    if (!w) return null;
    const name = gameState.players?.find(p => p.id === w.playerId)?.name;
    if (w.handName && w.handName !== 'Winner') return w.handName;
    return name ? `${name} wins` : 'Winner';
  })();

  // Betting
  const isMyTurn = gameState?.currentPlayerId === myId && !['waiting', 'showdown'].includes(gameState?.phase);
  const myTurnDeadline = isMyTurn ? gameState?.turnDeadline : null;
  const currentBet = gameState?.currentBet || 0;
  const myBet = me?.roundBet || 0;
  const bigBlind = gameState?.bigBlind || 20;
  const minRaise = currentBet + (gameState?.minRaise || bigBlind);
  const maxRaise = myBet + (me?.chips || 0);
  const effectiveMin = Math.min(minRaise, maxRaise);
  const canRaise = isMyTurn && (me?.chips || 0) > (Math.min(currentBet - myBet, me?.chips || 0));
  const [raiseAmount, setRaiseAmount] = useState(effectiveMin);
  useEffect(() => { setRaiseAmount(effectiveMin); }, [gameState?.currentPlayerId]);

  // Game over
  const isGameOver = gameState?.gameOver === true;
  const gameWinner = isGameOver ? (gameState.players || []).find(p => p.chips > 0) : null;


  const slots = OPP_SLOTS[Math.min(opponents.length, 8)] || OPP_SLOTS[1];
  const showdownWinner = showWinners && gameState?.winners?.[0];

  const handleReset = () => fetch(`${SERVER_URL}/admin/reset`, { method: 'POST' }).catch(() => {});

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>

        {/* Top bar */}
        <View style={s.topBar}>
          {waitlistCount > 0 && (
            <View style={s.pill}><Text style={s.pillTxt}>{waitlistCount} waiting</Text></View>
          )}
          <View style={s.topRight}>
            <Text style={s.version}>{VERSION}</Text>
            <Pressable style={s.menuBtn} onPress={() => setMenuOpen(true)}>
              <Text style={s.menuBtnTxt}>☰</Text>
            </Pressable>
          </View>
        </View>

        {/* Oval stage */}
        <View style={s.stage}>
          <View style={s.ovalWrap}>
            {/* Felt oval */}
            <View style={s.felt} />

            {/* Win flight */}
            <View style={s.winFlightContainer} pointerEvents="none">
              <WinFlight
                key={winFlightKey}
                show={!!showdownWinner}
                toBottom={showdownWinner?.playerId === myId}
                amount={showdownWinner?.amount || displayPot}
              />
            </View>

            {/* Community cards + pot + narration */}
            <View style={s.center}>
              <View style={s.communityRow}>
                {[0, 1, 2, 3, 4].map(i => {
                  const card = i < revealedCC ? gameState?.communityCards?.[i] : null;
                  if (!card) return <View key={i} style={s.ccPlaceholder} />;
                  return <Card key={i} card={card} size="sm" deckStyle={deckStyle} faceDown={false} />;
                })}
              </View>
              {displayPot > 0 && (
                <View style={s.potRow}>
                  <ChipStack amount={displayPot} size={16} />
                  <Text style={s.potAmt}>{displayPot.toLocaleString()}</Text>
                </View>
              )}
              {(centerAction || handName) ? (
                <Text style={s.narration}>{handName || centerAction}</Text>
              ) : null}
            </View>

            {/* Opponent seats */}
            {opponents.length === 0 && (
              <View style={[s.absoluteSeat, getSeatStyle('top', ovalSize.width, ovalSize.height)]}>
                <View style={s.waitingPill}><Text style={s.waitingTxt}>Waiting for players…</Text></View>
              </View>
            )}
            {opponents.map((opp, i) => {
              const posKey = slots[i] || 'top';
              const oppDeadline = opp.isCurrentPlayer ? gameState?.turnDeadline : null;
              return (
                <React.Fragment key={opp.id}>
                  <View style={[s.absoluteSeat, getSeatStyle(posKey, ovalSize.width, ovalSize.height)]}>
                    <SeatView
                      player={opp}
                      turnDeadline={oppDeadline}
                      lastAction={gameState?.lastAction}
                      win={winnerMap[opp.id]}
                      displayChips={chipsFor(opp)}
                      deckStyle={deckStyle}
                    />
                  </View>
                  <View style={[s.absoluteBet, getBetStyle(posKey, ovalSize.width, ovalSize.height)]}>
                    <BetBadge player={opp} />
                  </View>
                </React.Fragment>
              );
            })}

            {/* My seat — always bottom */}
            {me && (
              <>
                <View style={[s.absoluteSeat, getSeatStyle('bottom', ovalSize.width, ovalSize.height)]}>
                  <SeatView
                    player={me}
                    turnDeadline={myTurnDeadline}
                    lastAction={gameState?.lastAction}
                    win={myWin}
                    displayChips={chipsFor(me)}
                    deckStyle={deckStyle}
                    hideCards
                  />
                </View>
                <View style={[s.absoluteBet, getBetStyle('bottom', ovalSize.width, ovalSize.height)]}>
                  <BetBadge player={me} />
                </View>
                {/* My hole cards shown below my nameplate */}
                {me.holeCards?.length > 0 && !me.folded && (
                  <View style={[s.myCards, { bottom: -90, left: ovalSize.width / 2 - 42 }]}>
                    {[0, 1].map(i => (
                      <View key={i} style={[s.myCardWrap, i === 0 ? s.cardLeft : s.cardRight]}>
                        <Card card={me.holeCards?.[i]} size="lg" deckStyle={deckStyle}
                          faceDown={!me.holeCards?.[i]} />
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* Betting controls */}
        <View style={s.actionsBar}>
          <BettingControls
            gameState={gameState}
            myId={myId}
            onAction={onAction}
            raiseAmount={raiseAmount}
            onRaiseChange={v => setRaiseAmount(Math.round(v))}
          />
        </View>

        {/* Match over modal */}
        {matchOver && (
          <View style={s.gameOverOverlay}>
            <View style={s.gameOverModal}>
              <Text style={s.gameOverTitle}>
                {matchOver.winnerId === myId ? '🎉 You Won!' : `${matchOver.winnerName || 'Opponent'} Won!`}
              </Text>
              <View style={s.eloRow}>
                <Text style={[s.eloChange, matchOver.eloChange >= 0 ? s.eloPos : s.eloNeg]}>
                  {matchOver.eloChange >= 0 ? '+' : ''}{matchOver.eloChange} ELO
                </Text>
                <Text style={s.eloNew}>→ {matchOver.newElo}</Text>
              </View>
              <Text style={s.gameOverSub}>One more for the road?</Text>
              <View style={s.gameOverBtns}>
                <Pressable style={[s.govBtn, s.govBtnNo]} onPress={() => onRematch(false)}>
                  <Text style={s.govBtnTxt}>Leave</Text>
                </Pressable>
                <Pressable style={[s.govBtn, s.govBtnYes]} onPress={() => onRematch(true)}>
                  <Text style={s.govBtnTxt}>Play Again</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Settings menu */}
        {menuOpen && (
          <Pressable style={s.menuOverlay} onPress={() => setMenuOpen(false)}>
            <View style={s.menuPanel}>
              <Pressable style={s.menuItem} onPress={() => {
                setDeckStyle(d => d === 'four-color' ? 'regular' : 'four-color');
              }}>
                <Text style={s.menuItemTxt}>
                  🃏 {deckStyle === 'four-color' ? '4-Color Deck ✓' : '4-Color Deck'}
                </Text>
              </Pressable>
              <Pressable style={s.menuItem} onPress={() => { setMenuOpen(false); onLeave(); }}>
                <Text style={s.menuItemTxt}>🚪 Leave Table</Text>
              </Pressable>
              <Pressable style={[s.menuItem, s.menuItemDanger]} onPress={() => { setMenuOpen(false); handleReset(); }}>
                <Text style={[s.menuItemTxt, s.menuItemDangerTxt]}>🔄 Reset Table</Text>
              </Pressable>
            </View>
          </Pressable>
        )}

      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a1628' },
  container: { flex: 1 },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 4, paddingBottom: 2 },
  pill: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillTxt: { color: colors.gray, fontSize: 11 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  version: { color: 'rgba(255,255,255,0.2)', fontSize: 10 },
  menuBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  menuBtnTxt: { color: colors.white, fontSize: 16, fontWeight: '700' },

  // Stage / oval
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 80 },
  ovalWrap: { width: '100%', flex: 1 },
  felt: { position: 'absolute', inset: 0, borderRadius: 500, backgroundColor: '#0d2148', borderWidth: 14, borderColor: '#3a1f10', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },

  // Center
  center: { position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -70 }, { translateY: -40 }], width: 140, alignItems: 'center', gap: 4, zIndex: 10 },
  communityRow: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  ccPlaceholder: { width: 36, height: 32 },
  potRow: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  potAmt: { color: colors.goldLight, fontSize: 11, fontWeight: '800' },
  narration: { color: 'rgba(255,255,255,0.7)', fontSize: 10, textAlign: 'center', fontStyle: 'italic' },

  // Seats
  absoluteSeat: { position: 'absolute', zIndex: 20 },
  absoluteBet: { position: 'absolute', zIndex: 15 },
  seatWrap: { alignItems: 'center', gap: 2 },
  seatFolded: { opacity: 0.4 },
  seatCards: { flexDirection: 'row', gap: 2 },
  hidden: { opacity: 0 },
  namePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 4, minWidth: 88 },
  namePillActive: { borderColor: colors.gold, shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  nameInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pName: { color: colors.white, fontSize: 10, fontWeight: '700', maxWidth: 52 },
  pChips: { color: colors.goldLight, fontSize: 10, fontWeight: '600' },
  badge: { fontSize: 8, color: '#fff', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, paddingHorizontal: 2 },
  badgeSB: { backgroundColor: '#2563eb' },
  badgeBB: { backgroundColor: '#7c3aed' },
  cdText: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '800' },
  cdUrgent: { color: '#f87171' },

  // Bets
  betBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  betAmt: { color: colors.goldLight, fontSize: 9, fontWeight: '700' },
  allInTag: { color: '#f87171', fontSize: 9, fontWeight: '800' },

  // My cards
  myCards: { position: 'absolute', flexDirection: 'row', zIndex: 25 },
  myCardWrap: {},
  cardLeft: { transform: [{ rotate: '-4deg' }, { translateX: 4 }], zIndex: 1 },
  cardRight: { transform: [{ rotate: '4deg' }, { translateX: -4 }] },

  // Win flight
  winFlightContainer: { position: 'absolute', top: '50%', left: '50%', zIndex: 30 },
  winFlight: { position: 'absolute' },

  // Waiting
  waitingPill: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  waitingTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },

  // Actions bar
  actionsBar: { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },

  // Game over
  gameOverOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  gameOverModal: { backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 24, padding: 28, alignItems: 'center', gap: 14, width: '80%' },
  gameOverTitle: { color: colors.white, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  eloRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eloChange: { fontSize: 28, fontWeight: '900' },
  eloPos: { color: '#4ade80' },
  eloNeg: { color: '#f87171' },
  eloNew: { color: colors.gray, fontSize: 16 },
  gameOverSub: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  gameOverBtns: { flexDirection: 'row', gap: 12, marginTop: 4 },
  govBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  govBtnNo: { backgroundColor: 'rgba(255,255,255,0.1)' },
  govBtnYes: { backgroundColor: colors.gold },
  govBtnTxt: { color: colors.white, fontSize: 15, fontWeight: '800' },

  // Settings menu
  menuOverlay: { position: 'absolute', inset: 0, zIndex: 50 },
  menuPanel: { position: 'absolute', top: 48, right: 12, width: 200, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  menuItemTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  menuItemDanger: { borderBottomWidth: 0 },
  menuItemDangerTxt: { color: '#f87171' },
});
