import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Easing,
  useWindowDimensions, Image, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { GameContext } from '../context/GameContext';
import Card from '../components/Card';
import Avatar from '../components/Avatar';
import Chips from '../components/Chips';
import BettingControls from '../components/BettingControls';
import { colors } from '../theme';
import { VERSION_DISPLAY } from '../config';

const INGAME_TABLE  = require('../../assets/game-table.png');
const GAME_BG       = require('../../assets/game-bg.png');
const SPEECH_BUBBLE = require('../../assets/speech-bubble.png');

const TURN_DURATION_MS = 20000;
const TOP_BAR_H = 48;

// ─── Group A reference canvas ─────────────────────────────────────────────────
// Spec §3 recommends 1080×2160 (1:2); 393×852 (~1:2.17) keeps existing
// component pixel values unchanged. Scale = min(winW/W, winH/H) — contain.
const DESIGN_W = 393;
const DESIGN_H = 852;

// ─── Table geometry (spec §16: 1024×1536 asset, aspect 0.667) ────────────────
const TABLE_ASPECT = 1024 / 1536;
const TABLE_W  = Math.round(0.96 * DESIGN_W);                    // 377
const TABLE_H  = Math.round(TABLE_W / TABLE_ASPECT);             // 566
const TABLE_L  = Math.round((DESIGN_W - TABLE_W) / 2);           // 8
const TABLE_T  = Math.round(0.46 * DESIGN_H - TABLE_H / 2);      // 109

// ─── Pod geometry — static canvas-unit values ─────────────────────────────────
// Circle diameter drives everything. Nameplate clears the circle with a fixed
// overlap (44px) + padding (10px gap) — works regardless of avatar size.
const RING_W_PX  = 6;
const AVATAR_SZ  = 86;                                     // circle diameter
const POD_H      = AVATAR_SZ + 14;                         // 100 — snug around circle
const NP_H       = 56;
const NP_TOP     = Math.round((POD_H - NP_H) / 2);        // 22
const AV_TOP     = Math.round((POD_H - AVATAR_SZ) / 2);   // 7
const NAMEPLATE_OVERLAP = 44;                              // px nameplate extends behind circle
const AVATAR_PAD = NAMEPLATE_OVERLAP + 10;                 // 54 — keeps text clear of circle
const RING_R     = AVATAR_SZ / 2;                           // 43
const RING_BOX   = Math.ceil(RING_R * 2 + RING_W_PX);     // 92
const RING_CIRC  = 2 * Math.PI * RING_R;                   // ~270.2

// ─── Group A layout — spec §5 coordinate schema → 393×852 canvas pixels ──────
// x/y = element CENTER as fraction of canvas; positions derived below.
const POD_W        = Math.round(0.56 * DESIGN_W);                          // 220
const POD_L        = Math.round((DESIGN_W - POD_W) / 2);                  // 87
const OPP_POD_T    = Math.round(0.128 * DESIGN_H - POD_H / 2);            // 59  — avatar center at TABLE_T (top rail edge)
const MY_POD_T     = Math.round(0.792 * DESIGN_H - POD_H / 2);            // 625 — avatar center at TABLE_T+TABLE_H (bottom rail edge)
const CC_T         = Math.round(0.455 * DESIGN_H - 25);                   // 363  (25 ≈ half md-card h)
const POT_T        = Math.round(0.560 * DESIGN_H - 17);                   // 460
const OPP_BET_T    = Math.round(0.375 * DESIGN_H - 20);                   // 300
const MY_BET_T     = Math.round(0.620 * DESIGN_H - 20);                   // 508
const DEALER_SZ    = Math.round(0.07 * DESIGN_W);                         // 28
const DEALER_OPP_L = Math.round(0.35 * DESIGN_W - DEALER_SZ / 2);        // 124
const DEALER_OPP_T = Math.round(0.375 * DESIGN_H - DEALER_SZ / 2);       // 306
const DEALER_MY_L  = Math.round(0.65 * DESIGN_W - DEALER_SZ / 2);        // 241
const DEALER_MY_T  = Math.round(0.625 * DESIGN_H - DEALER_SZ / 2);       // 519
// Player hole cards: xl size 58×59px, center at (0.43, 0.700)
const MY_CARDS_L   = Math.round(0.43 * DESIGN_W - (58 * 2 + 6) / 2);     // 108
const MY_CARDS_T   = Math.round(0.700 * DESIGN_H - 59 / 2);               // 567
// Opponent hole cards: md size 42×50px, center at (0.50, 0.305)
const OPP_CARDS_L  = Math.round(0.50 * DESIGN_W - (42 * 2 + 6) / 2);     // 152
const OPP_CARDS_T  = Math.round(0.305 * DESIGN_H - 50 / 2);               // 235

// ─── TimerRing ────────────────────────────────────────────────────────────────
function TimerRing({ deadline }) {
  const [dashOffset, setDashOffset] = useState(RING_CIRC);
  const [timeLeft, setTimeLeft]     = useState(null);
  useEffect(() => {
    if (!deadline) { setDashOffset(RING_CIRC); setTimeLeft(null); return; }
    const tick = () => {
      const rem = Math.max(0, deadline - Date.now());
      setDashOffset(((TURN_DURATION_MS - rem) / TURN_DURATION_MS) * RING_CIRC);
      setTimeLeft(Math.ceil(rem / 1000));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const c = RING_BOX / 2;
  const ringColor  = timeLeft <= 5 ? '#f87171' : timeLeft <= 10 ? '#fb923c' : colors.gold;
  const ringOffset = Math.round((AVATAR_SZ - RING_BOX) / 2);
  return (
    <Svg width={RING_BOX} height={RING_BOX} viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
      style={[s.ring, { top: ringOffset, left: ringOffset }]} pointerEvents="none">
      <Circle cx={c} cy={c} r={RING_R} fill="none"
        stroke="rgba(255,255,255,0.22)" strokeWidth={RING_W_PX} />
      <Circle cx={c} cy={c} r={RING_R} fill="none"
        stroke={ringColor} strokeWidth={RING_W_PX}
        strokeDasharray={RING_CIRC} strokeDashoffset={dashOffset}
        strokeLinecap="round" transform={`rotate(-90, ${c}, ${c})`} />
    </Svg>
  );
}

// ─── HoleCards — independent Group A element (spec §5: playerCards / opponentCards)
// Separated from PlayerPod so player and opponent cards anchor at their own
// spec coordinates, independent of where the nameplates sit.
function HoleCards({ player, isMe, deckStyle }) {
  const hasCards = !!player?.holeCards?.length && !player?.folded;

  const dealTy0 = useRef(new Animated.Value(0)).current;
  const dealTy1 = useRef(new Animated.Value(0)).current;
  const dealSc0 = useRef(new Animated.Value(1)).current;
  const dealSc1 = useRef(new Animated.Value(1)).current;
  const dealOp0 = useRef(new Animated.Value(1)).current;
  const dealOp1 = useRef(new Animated.Value(1)).current;
  const wasHas  = useRef(hasCards);

  useEffect(() => {
    if (hasCards && !wasHas.current) {
      // Cards fly in from the table centre toward this seat
      const startY = isMe ? -240 : 240;
      dealTy0.setValue(startY); dealTy1.setValue(startY);
      dealSc0.setValue(0.6);    dealSc1.setValue(0.6);
      dealOp0.setValue(0);      dealOp1.setValue(0);
      const cardAnim = (ty, sc, op, delay) => Animated.parallel([
        Animated.timing(ty, { toValue: 0, duration: 500, delay,
          easing: Easing.bezier(0.25, 0.46, 0.45, 0.94), useNativeDriver: true }),
        Animated.timing(sc, { toValue: 1, duration: 500, delay, useNativeDriver: true }),
        Animated.timing(op, { toValue: 1, duration: 300, delay, useNativeDriver: true }),
      ]);
      Animated.parallel([
        cardAnim(dealTy0, dealSc0, dealOp0, 0),
        cardAnim(dealTy1, dealSc1, dealOp1, 180),
      ]).start();
    }
    wasHas.current = hasCards;
  }, [hasCards, isMe]);

  if (!hasCards) return null;

  const size = isMe ? 'xl' : 'md';
  const fd = (i) => !player?.holeCards?.[i] || !!player?.holeCards?.[i]?.hidden;

  return (
    <View style={[s.holeCardsPair, isMe ? s.myHoleCards : s.oppHoleCards]}>
      <Animated.View style={{
        transform: [{ translateY: dealTy0 }, { scale: dealSc0 }],
        opacity: dealOp0, zIndex: 2,
      }}>
        <View style={s.cardSlotLeft}>
          <Card card={player?.holeCards?.[0]} size={size} deckStyle={deckStyle} faceDown={fd(0)} />
        </View>
      </Animated.View>
      <Animated.View style={{
        transform: [{ translateY: dealTy1 }, { scale: dealSc1 }],
        opacity: dealOp1, marginLeft: -6, zIndex: 1,
      }}>
        <View style={s.cardSlotRight}>
          <Card card={player?.holeCards?.[1]} size={size} deckStyle={deckStyle} faceDown={fd(1)} />
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useCountdown(deadline) {
  const [t, setT] = useState(null);
  useEffect(() => {
    if (!deadline) { setT(null); return; }
    const up = () => setT(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    up(); const id = setInterval(up, 200); return () => clearInterval(id);
  }, [deadline]);
  return t;
}

function useActionFlash(player, lastAction) {
  const [label, setLabel] = useState(null);
  const seen = useRef(null);
  const t = lastAction?.playerId === player?.id ? lastAction?.t : null;
  useEffect(() => {
    if (!t) { setLabel(null); seen.current = null; return; }
    if (t === seen.current) return;
    seen.current = t;
    const a = lastAction;
    const map = { fold: 'Fold', check: 'Check',
      call: `Call ${a.amount?.toLocaleString() || ''}`,
      bet: `Bet ${a.amount?.toLocaleString() || ''}`,
      raise: `Raise ${a.amount?.toLocaleString() || ''}`,
      'all-in': 'All In' };
    setLabel(map[a.action] || a.action);
    const id = setTimeout(() => setLabel(null), 2500);
    return () => clearTimeout(id);
  }, [t]);
  return label;
}

// ─── DisconnectBanner ─────────────────────────────────────────────────────────
function DisconnectBanner({ deadline }) {
  const secsLeft = useCountdown(deadline);
  return (
    <View style={s.disconnectBanner}>
      <Text style={s.disconnectTxt}>
        Opponent disconnected — {secsLeft !== null ? `${secsLeft}s to reconnect` : 'waiting…'}
      </Text>
    </View>
  );
}

// ─── PlayerPod — avatar + nameplate only (hole cards are now separate) ────────
function PlayerPod({ player, isMe, turnDeadline, lastAction, win, displayChips, deckStyle }) {
  const actionLbl = useActionFlash(player, lastAction);
  const present   = !!player;
  const isActive  = present && !!player.isCurrentPlayer;
  const allIn     = present && !!player.allIn;
  const displayName = present ? player.name : (isMe ? 'You' : 'Waiting…');
  const chipLabel = !present ? '—'
    : (win ? '🏆 Winner!' : (actionLbl || (displayChips ?? player.chips).toLocaleString()));

  const avatar = (
    <View style={[
      s.avatarBlock,
      { top: AV_TOP, width: AVATAR_SZ, height: AVATAR_SZ },
      isMe ? s.avatarBlockMe : s.avatarBlockOpp,
      !present && s.avatarPlaceholder,
    ]}>
      <Avatar size={AVATAR_SZ} avatarId={player?.avatarId} />
      {allIn && (
        <View style={[s.avatarAllInGlow, { width: AVATAR_SZ, height: AVATAR_SZ, borderRadius: AVATAR_SZ / 2 }]}
          pointerEvents="none" />
      )}
      <TimerRing deadline={turnDeadline} />
    </View>
  );

  const nameplate = (
    <View style={[
      s.nameplate,
      { top: NP_TOP, height: NP_H },
      isMe
        ? { left: 16, right: NAMEPLATE_OVERLAP, paddingLeft: 12, paddingRight: AVATAR_PAD }
        : { right: 16, left: NAMEPLATE_OVERLAP, paddingLeft: AVATAR_PAD, paddingRight: 12 },
      isActive && s.nameplateActive,
      allIn   && s.nameplateAllIn,
      present && player.folded && s.nameplateFolded,
      !present && s.nameplateWaiting,
    ]}>
      <View style={s.nameRow}>
        <Text style={s.podName} numberOfLines={1}>{displayName}</Text>
        {present && player.isSmallBlind && <Text style={[s.badge, s.badgeSB]}>SB</Text>}
        {present && player.isBigBlind   && <Text style={[s.badge, s.badgeBB]}>BB</Text>}
      </View>
      <Text style={[s.podChips, win && s.podChipsWin, !!actionLbl && s.podChipsAction]}
        numberOfLines={1}>{chipLabel}</Text>
    </View>
  );

  return (
    <View style={[s.pod, present && player.folded && { opacity: 0.8 }]}>
      {nameplate}
      {avatar}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GameScreen() {
  const {
    gameState, myId, onAction, onLeave, onRematch, onLogout,
    matchOver, navigationRef, deckStyle, opponentDisconnected, playerInfo,
  } = useContext(GameContext);

  const [menuOpen, setMenuOpen] = useState(false);

  const me       = gameState?.players?.find(p => p.id === myId);
  const opponent = gameState?.players?.find(p => p.id !== myId);
  const totalPot = gameState?.pot || 0;

  const winnerId = matchOver?.winnerId;
  const winnerAvatarId =
    gameState?.players?.find(p => p.id === winnerId)?.avatarId
    || (winnerId === myId ? playerInfo?.avatarId : undefined);
  const winnerQuote = useMemo(() => {
    const quotes = ['Easy Bananas!', 'More Coconuts?', 'Monkey Down :D', 'Maybe Next Time! ;)', 'Obviously Me!'];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }, [winnerId, matchOver?.newElo]);

  const winnerMap = {};
  if (gameState?.phase === 'showdown' && gameState?.winners) {
    for (const w of gameState.winners) winnerMap[w.playerId] = w;
  }
  const isMyTurn    = gameState?.currentPlayerId === myId && !['waiting','showdown'].includes(gameState?.phase);
  const myDeadline  = isMyTurn ? gameState?.turnDeadline : null;
  const oppDeadline = opponent?.isCurrentPlayer ? gameState?.turnDeadline : null;

  // Staggered community card reveal
  const targetCC   = gameState?.communityCards?.length || 0;
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
        else if (isShowdown) acc += 1000;
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [targetCC, isShowdown]);

  const [showWinners, setShowWinners] = useState(false);
  useEffect(() => {
    if (!isShowdown) { setShowWinners(false); return; }
    if (revealedCC < targetCC) { setShowWinners(false); return; }
    const t = setTimeout(() => setShowWinners(true), 2000);
    return () => clearTimeout(t);
  }, [revealedCC, targetCC, isShowdown]);

  const activeWinners = showWinners ? winnerMap : {};

  const [snap, setSnap]       = useState({ chips: {}, pot: 0 });
  const [winDone, setWinDone] = useState(false);
  useEffect(() => {
    if (isShowdown) return;
    const chips = {};
    (gameState?.players || []).forEach(p => { chips[p.id] = p.chips; });
    setSnap({ chips, pot: gameState?.pot || 0 });
    setWinDone(false);
  }, [gameState, isShowdown]);
  useEffect(() => {
    if (!showWinners) return;
    const t = setTimeout(() => setWinDone(true), 950);
    return () => clearTimeout(t);
  }, [showWinners]);

  const locked  = isShowdown && !winDone;
  const dispPot = locked ? snap.pot : totalPot;
  const chipsFor = p => locked ? (snap.chips[p?.id] ?? p?.chips ?? 0) : (p?.chips ?? 0);

  // Pot-to-winner banana flight
  const flightY       = useRef(new Animated.Value(0)).current;
  const flightOpacity = useRef(new Animated.Value(0)).current;
  const flightScale   = useRef(new Animated.Value(1)).current;
  const [flightAmount, setFlightAmount] = useState(0);
  useEffect(() => {
    if (!showWinners || !gameState?.winners?.length) {
      flightOpacity.setValue(0);
      return;
    }
    const winner = gameState.winners[0];
    const dir = winner.playerId === myId ? 1 : -1;
    setFlightAmount(winner.amount || snap.pot || totalPot);
    flightY.setValue(0);
    flightScale.setValue(1);
    flightOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(flightY, {
        toValue: dir * 220, duration: 900,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(flightScale, { toValue: 1.2, duration: 700, useNativeDriver: true }),
        Animated.timing(flightScale, { toValue: 1,   duration: 200, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(flightOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
    ]).start();
  }, [showWinners]);

  const currentBet   = gameState?.currentBet || 0;
  const myBet        = me?.roundBet || 0;
  const bigBlind     = gameState?.bigBlind || 20;
  const minRaise     = currentBet + (gameState?.minRaise || bigBlind);
  const maxRaise     = myBet + (me?.chips || 0);
  const effectiveMin = Math.min(minRaise, maxRaise);
  const [raiseAmount, setRaiseAmount] = useState(effectiveMin);
  useEffect(() => { setRaiseAmount(effectiveMin); }, [gameState?.currentPlayerId]);

  const { width: winW, height: winH } = useWindowDimensions();
  // Scale = contain: stage never clips, margins filled by Group C background
  const scale = Math.min(winW / DESIGN_W, winH / DESIGN_H);

  return (
    <View style={s.root}>

      {/* Group C — environment: 55% opacity lifts the baked vignette ~45%;
          dark jungle root colour bleeds through the transparent edges */}
      <Image source={GAME_BG} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} resizeMode="cover" />

      {/* Group A — stage: all game content, scaled as one unit */}
      <View style={s.stageOuter} pointerEvents="none">
        <View style={[s.stage, { transform: [{ scale }] }]}>

          {/* Layer 2: Table surface */}
          <Image source={INGAME_TABLE} style={s.tableImg} resizeMode="contain" />

          {/* Layer 3: Game elements — all absolutely positioned in canvas coords */}

          {/* Opponent pod */}
          <View style={s.oppPodSlot}>
            <PlayerPod player={opponent} isMe={false}
              turnDeadline={oppDeadline} lastAction={gameState?.lastAction}
              win={opponent ? activeWinners[opponent.id] : null}
              displayChips={opponent ? chipsFor(opponent) : 0}
              deckStyle={deckStyle} />
          </View>

          {/* Opponent hole cards — spec §5 opponentCards: (0.50, 0.305) */}
          <HoleCards player={opponent} isMe={false} deckStyle={deckStyle} />

          {/* Opponent bet */}
          <View style={[s.betSlot, { top: OPP_BET_T }]} pointerEvents="none">
            {(opponent?.roundBet > 0 || opponent?.allIn) && (
              <View style={s.betPill}>
                {opponent.allIn && <Text style={s.allInTag}>ALL IN</Text>}
                {opponent.roundBet > 0 && <Chips amount={opponent.roundBet} size={33} />}
                {opponent.roundBet > 0 && <Text style={s.betAmt}>{opponent.roundBet.toLocaleString()}</Text>}
              </View>
            )}
          </View>

          {/* Community cards — spec §5 communityCards: (0.50, 0.455) */}
          <View style={[s.communitySlot, { top: CC_T }]} pointerEvents="none">
            <View style={s.communityRow}>
              {[0,1,2,3,4].map(i => {
                const card = i < revealedCC ? gameState?.communityCards?.[i] : null;
                if (!card) return <View key={i} style={s.ccPlaceholder} />;
                return <Card key={i} card={card} size="md" deckStyle={deckStyle} faceDown={false} />;
              })}
            </View>
          </View>

          {/* Pot — spec §5 pot: (0.50, 0.560) */}
          <View style={[s.potSlot, { top: POT_T }]} pointerEvents="none">
            {dispPot > 0 && (
              <View style={s.potRow}>
                <Chips amount={dispPot} size={33} />
                <Text style={s.potAmt}>{dispPot.toLocaleString()}</Text>
              </View>
            )}
          </View>

          {/* Player bet */}
          <View style={[s.betSlot, { top: MY_BET_T }]} pointerEvents="none">
            {(me?.roundBet > 0 || me?.allIn) && (
              <View style={s.betPill}>
                {me.allIn && <Text style={s.allInTag}>ALL IN</Text>}
                {me.roundBet > 0 && <Chips amount={me.roundBet} size={33} />}
                {me.roundBet > 0 && <Text style={s.betAmt}>{me.roundBet.toLocaleString()}</Text>}
              </View>
            )}
          </View>

          {/* Dealer button */}
          {opponent?.isDealer && (
            <View style={[s.dealerBtn, { top: DEALER_OPP_T, left: DEALER_OPP_L }]}>
              <Text style={s.dealerTxt}>D</Text>
            </View>
          )}
          {me?.isDealer && (
            <View style={[s.dealerBtn, { top: DEALER_MY_T, left: DEALER_MY_L }]}>
              <Text style={s.dealerTxt}>D</Text>
            </View>
          )}

          {/* Pot-to-winner banana flight */}
          {flightAmount > 0 && (
            <Animated.View pointerEvents="none" style={[s.winFlight, { top: POT_T - 14,
              opacity: flightOpacity,
              transform: [{ translateY: flightY }, { scale: flightScale }],
            }]}>
              <Chips amount={flightAmount} size={45} />
            </Animated.View>
          )}

          {/* Player hole cards — spec §5 playerCards: (0.43, 0.700) */}
          <HoleCards player={me} isMe={true} deckStyle={deckStyle} />

          {/* Player pod */}
          <View style={s.myPodSlot}>
            <PlayerPod player={me} isMe={true}
              turnDeadline={myDeadline} lastAction={gameState?.lastAction}
              win={me ? activeWinners[myId] : null}
              displayChips={me ? chipsFor(me) : 0}
              deckStyle={deckStyle} />
          </View>

        </View>
      </View>

      {/* Group B — chrome: docked to device edges, NOT scaled */}
      <SafeAreaView style={s.chrome} pointerEvents="box-none">

        {/* Top bar */}
        <View style={s.topBar} pointerEvents="box-none">
          <Text style={s.version}>{VERSION_DISPLAY}</Text>
          <Pressable style={s.menuBtn} onPress={() => setMenuOpen(o => !o)}>
            <Text style={s.menuBtnTxt}>☰</Text>
          </Pressable>
        </View>

        {/* Disconnect banner — top of chrome, below the status bar */}
        {opponentDisconnected && (
          <View pointerEvents="none">
            <DisconnectBanner deadline={opponentDisconnected} />
          </View>
        )}

        {/* Spacer pushes betting controls to the bottom */}
        <View style={{ flex: 1 }} pointerEvents="none" />

        {/* Bottom betting controls (Group B) — fixed ergonomic height */}
        <View style={s.bottomChrome} pointerEvents="box-none">
          {isMyTurn && (
            <BettingControls
              gameState={gameState} myId={myId}
              onAction={onAction} raiseAmount={raiseAmount}
              onRaiseChange={v => setRaiseAmount(Math.round(v))} />
          )}
        </View>

      </SafeAreaView>

      {/* Menu scrim + panel — outside everything, highest z */}
      {menuOpen && (
        <Pressable style={s.menuScrim} onPress={() => setMenuOpen(false)}>
          <SafeAreaView pointerEvents="box-none">
            <View style={s.menuPanelRow}>
              <Pressable style={s.menuPanel} onPress={() => {}}>
                <Pressable style={s.menuItem}
                  onPress={() => { setMenuOpen(false); navigationRef.navigate('Profile'); }}>
                  <Text style={s.menuItemTxt}>👤 Profile</Text>
                </Pressable>
                <Pressable style={s.menuItem}
                  onPress={() => { setMenuOpen(false); onLeave(); }}>
                  <Text style={s.menuItemTxt}>🚪 Leave Table</Text>
                </Pressable>
                <Pressable style={[s.menuItem, s.menuItemRed]}
                  onPress={() => { setMenuOpen(false); onLeave(); onLogout?.(); }}>
                  <Text style={[s.menuItemTxt, { color: '#f87171' }]}>🔓 Log Out</Text>
                </Pressable>
              </Pressable>
            </View>
          </SafeAreaView>
        </Pressable>
      )}

      {/* Match over modal — root-level overlay, not scaled */}
      {matchOver && (
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>
              {matchOver.winnerId === myId ? '🎉 You Won!' : `${matchOver.winnerName} Won!`}
            </Text>

            <View style={s.winnerWrap}>
              <Avatar size={104} avatarId={winnerAvatarId} />
              <ImageBackground source={SPEECH_BUBBLE} style={s.quoteBubble}
                resizeMode="contain" pointerEvents="none">
                <View style={s.quoteFill} />
                <Text style={s.quoteText} numberOfLines={1}
                  adjustsFontSizeToFit minimumFontScale={0.8}>{winnerQuote}</Text>
              </ImageBackground>
            </View>

            <View style={s.eloRow}>
              <Text style={[s.eloChange, matchOver.eloChange >= 0 ? s.eloPos : s.eloNeg]}>
                {matchOver.eloChange >= 0 ? '+' : ''}{matchOver.eloChange} ELO
              </Text>
              <Text style={s.eloNew}>→ {matchOver.newElo}</Text>
            </View>

            {matchOver.myVote ? (
              <Text style={s.modalWaiting}>
                {matchOver.opponentWantsRematch ? 'Starting rematch…' : 'Waiting for opponent…'}
              </Text>
            ) : matchOver.opponentWantsRematch ? (
              <>
                <Text style={s.modalSub}>{matchOver.opponentWantsRematch} wants a rematch!</Text>
                <View style={s.modalBtns}>
                  <Pressable style={[s.modalBtn, s.modalBtnNo]} onPress={() => onRematch(false)}>
                    <Text style={s.modalBtnTxt}>Decline</Text>
                  </Pressable>
                  <Pressable style={[s.modalBtn, s.modalBtnYes]} onPress={() => onRematch(true)}>
                    <Text style={s.modalBtnTxt}>Accept</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={s.modalSub}>One more for the road?</Text>
                <View style={s.modalBtns}>
                  <Pressable style={[s.modalBtn, s.modalBtnNo]} onPress={() => onRematch(false)}>
                    <Text style={s.modalBtnTxt}>Leave</Text>
                  </Pressable>
                  <Pressable style={[s.modalBtn, s.modalBtnYes]} onPress={() => onRematch(true)}>
                    <Text style={s.modalBtnTxt} numberOfLines={1}
                      adjustsFontSizeToFit minimumFontScale={0.8}>Play Again</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Root — dark jungle base colour shows through wherever the bg image is
  // semi-transparent, lifting the crushed-black vignette edges.
  root: { flex: 1, backgroundColor: '#0f2318' },

  // Group A: stage container fills screen, centers the scaled canvas
  stageOuter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  stage: { width: DESIGN_W, height: DESIGN_H },

  // Table image — Layer 2, absolutely placed in canvas coords
  tableImg: {
    position: 'absolute',
    left: TABLE_L, top: TABLE_T,
    width: TABLE_W, height: TABLE_H,
  },

  // Pod slots — absolutely placed in canvas coords
  oppPodSlot: {
    position: 'absolute',
    left: POD_L, top: OPP_POD_T,
    width: POD_W, height: POD_H,
    zIndex: 5,
  },
  myPodSlot: {
    position: 'absolute',
    left: POD_L, top: MY_POD_T,
    width: POD_W, height: POD_H,
    zIndex: 5,
  },

  // Pod interior — relative container for avatar + nameplate absolute children
  pod: { flex: 1 },

  // Avatar block — absolutely inside the pod
  avatarBlock: {
    position: 'absolute',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 50, elevation: 12,
  },
  avatarBlockMe:  { right: 0 },
  avatarBlockOpp: { left:  0 },
  avatarAllInGlow: {
    position: 'absolute', top: 0, left: 0,
    borderWidth: 3, borderColor: '#ef4444',
    shadowColor: '#ef4444', shadowOpacity: 0.85, shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 }, elevation: 10, zIndex: 55,
  },
  ring: { position: 'absolute' },
  avatarPlaceholder: { opacity: 0.45 },

  // Nameplate — absolutely inside the pod
  nameplate: {
    position: 'absolute',
    backgroundColor: '#08080a',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 32, paddingVertical: 6,
    justifyContent: 'center', gap: 1,
    zIndex: 3, elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }, overflow: 'hidden',
  },
  nameplateActive:  { borderColor: colors.gold, shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  nameplateAllIn:   { borderColor: '#ef4444', shadowColor: '#ef4444', shadowOpacity: 0.8, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  nameplateFolded:  {},
  nameplateWaiting: {},
  nameRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  podName:   { color: colors.white, fontSize: 17, fontWeight: '800', flexShrink: 1 },
  podChips:  { color: '#facc15', fontSize: 18, fontWeight: '900' },
  podChipsWin:    { color: '#4ade80' },
  podChipsAction: { color: colors.orange, fontSize: 14, fontWeight: '800' },
  badge:   { fontSize: 10, color: '#fff', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, fontWeight: '700' },
  badgeSB: { backgroundColor: '#2563eb' },
  badgeBB: { backgroundColor: '#7c3aed' },

  // Hole cards — absolutely placed in canvas coords (spec §5)
  holeCardsPair: { position: 'absolute', flexDirection: 'row', gap: 6, zIndex: 6 },
  myHoleCards:  { left: MY_CARDS_L,  top: MY_CARDS_T  },
  oppHoleCards: { left: OPP_CARDS_L, top: OPP_CARDS_T },
  cardSlotLeft:  { transform: [{ rotate: '-8deg' }] },
  cardSlotRight: { transform: [{ rotate:  '8deg' }] },

  // Felt slots — full-width containers that centre their content
  communitySlot: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  communityRow:  { flexDirection: 'row', gap: 6, alignItems: 'center' },
  ccPlaceholder: { width: 42, height: 50 },
  potSlot: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  potRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4 },
  potAmt:  { color: '#4a2a10', fontSize: 21, fontWeight: '900' },
  betSlot: { position: 'absolute', left: 0, right: 0, alignItems: 'center', height: 40, justifyContent: 'flex-start', zIndex: 20 },
  betPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  betAmt:  { color: '#4a2a10', fontSize: 18, fontWeight: '900' },
  allInTag: { color: '#fff', backgroundColor: '#dc2626', fontSize: 13, fontWeight: '900', letterSpacing: 0.5, paddingHorizontal: 9, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#fca5a5' },

  // Dealer button
  dealerBtn: { position: 'absolute', width: DEALER_SZ, height: DEALER_SZ, borderRadius: DEALER_SZ / 2, backgroundColor: '#f5f5dc', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#888', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4, zIndex: 5 },
  dealerTxt: { color: '#333', fontSize: 11, fontWeight: '900' },

  // Pot-to-winner banana flight
  winFlight: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30 },

  // Group B: chrome overlay — SafeAreaView that fills screen, not scaled
  chrome: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  topBar: {
    height: TOP_BAR_H,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16,
  },
  version:    { color: 'rgba(255,255,255,0.2)', fontSize: 11 },
  menuBtn:    { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  menuBtnTxt: { color: colors.white, fontSize: 16 },
  bottomChrome: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 6 },

  // Disconnect banner
  disconnectBanner: { marginHorizontal: 12, marginTop: 4, backgroundColor: 'rgba(251,146,60,0.18)', borderWidth: 1, borderColor: 'rgba(251,146,60,0.5)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  disconnectTxt:    { color: '#fb923c', fontSize: 12, fontWeight: '700', textAlign: 'center' },

  // Menu scrim + panel
  menuScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50 },
  menuPanelRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: TOP_BAR_H + 4 },
  menuPanel: { width: 200, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, overflow: 'hidden', elevation: 8 },
  menuItem:    { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  menuItemRed: { borderBottomWidth: 0 },
  menuItemTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },

  // Match over modal
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal:       { backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 24, padding: 22, alignItems: 'center', gap: 14, width: '90%' },
  modalTitle:  { color: colors.white, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  winnerWrap:  { alignItems: 'center', justifyContent: 'center', marginTop: 2, position: 'relative' },
  quoteBubble: { position: 'absolute', left: '50%', marginLeft: 13, top: '50%', marginTop: -83, width: 150, height: 150, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 30, paddingTop: 4 },
  quoteFill:   { position: 'absolute', left: 27, top: 36, width: 96, height: 54, borderRadius: 27, backgroundColor: '#fff' },
  quoteText:   { color: '#111', fontSize: 11, fontStyle: 'italic', fontWeight: '400', textAlign: 'center' },
  eloRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eloChange:   { fontSize: 16, fontWeight: '800' },
  eloPos:      { color: '#4ade80' },
  eloNeg:      { color: '#f87171' },
  eloNew:      { color: colors.gray, fontSize: 16 },
  modalSub:    { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  modalWaiting:{ color: colors.gray, fontSize: 14, fontStyle: 'italic' },
  modalBtns:   { flexDirection: 'row', gap: 12, marginTop: 4, alignSelf: 'stretch' },
  modalBtn:    { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnNo:  { backgroundColor: 'rgba(255,255,255,0.1)' },
  modalBtnYes: { backgroundColor: colors.gold, flex: 1.5 },
  modalBtnTxt: { color: colors.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
});
