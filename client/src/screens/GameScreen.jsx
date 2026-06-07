import React, { useContext, useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Easing,
  useWindowDimensions, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Single in-game background: the wooden poker table artwork (rim + cream
// felt interior + Poker Monkey skull logo + wooden floor and decorations
// around the oval). Replaces the previous jungle bg for the game scene.
const INGAME_BG = require('../../assets/table.png');
import Svg, { Circle } from 'react-native-svg';
import { GameContext } from '../context/GameContext';
import Card from '../components/Card';
import Avatar from '../components/Avatar';
import Chips from '../components/Chips';
import BettingControls from '../components/BettingControls';
import { colors } from '../theme';
import { SERVER_URL, VERSION } from '../config';

const TURN_DURATION_MS = 20000;

// Fixed design canvas — everything is drawn against this portrait reference,
// then the whole canvas is scaled uniformly to fit the device's safe area.
// Same composition on every screen, just a different overall scale.
const DESIGN_WIDTH  = 393;
const DESIGN_HEIGHT = 852;

// Fixed pod geometry — avatar, nameplate and cards never change size.
// Nameplate is vertically centred on the avatar; cards float just above
// the nameplate, close to the avatar but never touching either.
const AVATAR_SIZE      = 156;
const NAMEPLATE_HEIGHT = 64;
const POD_HEIGHT       = 200;
const NAMEPLATE_TOP    = (POD_HEIGHT - NAMEPLATE_HEIGHT) / 2; // 68 — top of nameplate
const AVATAR_TOP       = (POD_HEIGHT - AVATAR_SIZE) / 2;      // 22 — top of avatar
const CARD_NAMEPLATE_GAP = -8; // negative = cards overlap nameplate top — clipped by nameplate's higher z-index
const CARDS_BOTTOM     = POD_HEIGHT - NAMEPLATE_TOP + CARD_NAMEPLATE_GAP; // 136 (anchor from pod bottom)
const CARD_AVATAR_GAP  = 0; // tight against the avatar's inner edge

// Timer ring sized to surround the standalone avatar.
const RING_R     = AVATAR_SIZE / 2;
const RING_BOX   = RING_R * 2 + 6;
const RING_CIRC  = 2 * Math.PI * RING_R;

// ─── TimerRing ────────────────────────────────────────────────────────────────
function TimerRing({ deadline }) {
  const [dashOffset, setDashOffset] = useState(RING_CIRC);
  const [timeLeft, setTimeLeft] = useState(null);
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
  // Ring is hidden when no turn is in progress (no permanent track), so
  // the avatar reads cleanly framed inside its own artwork.
  const c = RING_BOX / 2;
  const RING_W = 6;
  if (!deadline) return null;
  const ringColor = timeLeft <= 5 ? '#f87171' : timeLeft <= 10 ? '#fb923c' : colors.gold;
  return (
    <Svg width={RING_BOX} height={RING_BOX} viewBox={`0 0 ${RING_BOX} ${RING_BOX}`} style={s.ring} pointerEvents="none">
      <Circle cx={c} cy={c} r={RING_R} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={RING_W} />
      <Circle cx={c} cy={c} r={RING_R} fill="none" stroke={ringColor} strokeWidth={RING_W}
        strokeDasharray={RING_CIRC} strokeDashoffset={dashOffset}
        strokeLinecap="round" transform={`rotate(-90, ${c}, ${c})`} />
    </Svg>
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
    if (!t || t === seen.current) return;
    seen.current = t;
    const a = lastAction;
    const map = { fold: 'Fold', check: 'Check', call: `Call ${a.amount?.toLocaleString() || ''}`,
      bet: `Bet ${a.amount?.toLocaleString() || ''}`, raise: `Raise ${a.amount?.toLocaleString() || ''}`, 'all-in': 'All In' };
    setLabel(map[a.action] || a.action);
    const id = setTimeout(() => setLabel(null), 2500);
    return () => clearTimeout(id);
  }, [t]);
  return label;
}

function useCenterAction(lastAction) {
  const [label, setLabel] = useState(null);
  const seen = useRef(null);
  useEffect(() => {
    if (!lastAction?.t || lastAction.t === seen.current) return;
    seen.current = lastAction.t;
    const { name, action, amount } = lastAction;
    const f = n => n?.toLocaleString();
    const text = { fold: `${name} folds`, check: `${name} checks`,
      call: `${name} calls ${f(amount)}`, bet: `${name} bets ${f(amount)}`,
      raise: `${name} raises to ${f(amount)}`, 'all-in': `${name} is all in` }[action] || `${name} ${action}`;
    setLabel(text);
    const id = setTimeout(() => setLabel(null), 3000);
    return () => clearTimeout(id);
  }, [lastAction?.t]);
  return label;
}

// ─── FeltBackground ──────────────────────────────────────────────────────────
// The wooden table artwork is now the entire scene background, so the felt
// itself is just a transparent positioning anchor for the community cards,
// pot, bets and dealer disc. No image of its own.
function FeltBackground() {
  return null;
}

// ─── DisconnectBanner ────────────────────────────────────────────────────────
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

// ─── PlayerPod ───────────────────────────────────────────────────────────────
// isMe=true  → nameplate below cards (cards face the table)
// isMe=false → nameplate above cards (cards face the table)
function PlayerPod({ player, isMe, turnDeadline, lastAction, win, displayChips, deckStyle }) {
  const timeLeft  = useCountdown(turnDeadline);
  const actionLbl = useActionFlash(player, lastAction);
  // Avatar + nameplate are ALWAYS rendered, even before a player joins, so
  // their on-table positions never shift. Only the contents change.
  const present  = !!player;
  const isActive = present && !!player.isCurrentPlayer;
  const hasCards = present && player.holeCards?.length > 0 && !player.folded;
  const displayName = present ? player.name : (isMe ? 'You' : 'Waiting…');
  const chipLabel = !present ? '—'
    : (win ? '🏆 Winner!' : (actionLbl || (displayChips ?? player.chips).toLocaleString()));

  // Hand-deal animation: when this seat goes from "no cards" to "has cards"
  // (start of a new hand), the two hole cards slide in from the felt
  // centre with a slight scale-up and stagger.
  const dealTy0 = useRef(new Animated.Value(0)).current;
  const dealTy1 = useRef(new Animated.Value(0)).current;
  const dealSc0 = useRef(new Animated.Value(1)).current;
  const dealSc1 = useRef(new Animated.Value(1)).current;
  const dealOp0 = useRef(new Animated.Value(1)).current;
  const dealOp1 = useRef(new Animated.Value(1)).current;
  const wasHas  = useRef(hasCards);
  useEffect(() => {
    if (hasCards && !wasHas.current) {
      const startY = isMe ? -240 : 240; // from felt centre toward this seat
      dealTy0.setValue(startY); dealTy1.setValue(startY);
      dealSc0.setValue(0.6);    dealSc1.setValue(0.6);
      dealOp0.setValue(0);      dealOp1.setValue(0);
      const cardAnim = (ty, sc, op, delay) => Animated.parallel([
        Animated.timing(ty, { toValue: 0, duration: 500, delay, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94), useNativeDriver: true }),
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

  // Compact pod: fixed height = AVATAR_SIZE. Cards, nameplate and avatar
  // are absolute siblings inside the pod so they share vertical space
  // (the cards' bottom overlaps the nameplate's top, the avatar fills
  // the full pod height on its side). Keeps both seats visible inside
  // the viewport even with a big avatar.
  const cards = (
    <View style={[
      s.podCards,
      isMe ? s.podCardsMe : s.podCardsOpp,
      !hasCards && s.hidden,
    ]}>
      <Animated.View style={{ transform: [{ translateY: dealTy0 }, { scale: dealSc0 }], opacity: dealOp0, zIndex: 2 }}>
        <View style={s.cardSlotLeft}>
          <Card card={player?.holeCards?.[0]} size="xl" deckStyle={deckStyle}
            faceDown={!player?.holeCards?.[0] || !!player?.holeCards?.[0]?.hidden} />
        </View>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateY: dealTy1 }, { scale: dealSc1 }], opacity: dealOp1, marginLeft: -6, zIndex: 1 }}>
        <View style={s.cardSlotRight}>
          <Card card={player?.holeCards?.[1]} size="xl" deckStyle={deckStyle}
            faceDown={!player?.holeCards?.[1] || !!player?.holeCards?.[1]?.hidden} />
        </View>
      </Animated.View>
    </View>
  );

  const avatar = (
    <View style={[s.avatarBlock, isMe ? s.avatarBlockMe : s.avatarBlockOpp, !present && s.avatarPlaceholder]}>
      <Avatar size={AVATAR_SIZE} avatarId={player?.avatarId} />
      <TimerRing deadline={turnDeadline} />
    </View>
  );

  const nameplate = (
    <View style={[
      s.nameplate,
      isMe ? s.nameplateMe : s.nameplateOpp,
      isActive && s.nameplateActive,
      present && player.folded && s.nameplateFolded,
      !present && s.nameplateWaiting,
    ]}>
      <View style={s.nameRow}>
        <Text style={s.podName} numberOfLines={1}>{displayName}</Text>
        {present && player.isSmallBlind && <Text style={[s.badge, s.badgeSB]}>SB</Text>}
        {present && player.isBigBlind   && <Text style={[s.badge, s.badgeBB]}>BB</Text>}
        {present && player.allIn        && <Text style={[s.badge, s.badgeAI]}>ALL IN</Text>}
      </View>
      <Text style={[s.podChips, win && s.podChipsWin, !!actionLbl && s.podChipsAction]}
        numberOfLines={1}>{chipLabel}</Text>
    </View>
  );

  return (
    <View style={[s.pod, present && player.folded && { opacity: 0.8 }]}>
      {cards}
      {nameplate}
      {avatar}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function GameScreen() {
  const { gameState, myId, onAction, onLeave, onRematch, onLogout, emit, matchOver, navigationRef, deckStyle, opponentDisconnected, playerInfo } = useContext(GameContext);

  const [menuOpen, setMenuOpen] = useState(false);
  const [feltSize, setFeltSize] = useState({ w: 0, h: 0 });

  const me       = gameState?.players?.find(p => p.id === myId);
  const opponent = gameState?.players?.find(p => p.id !== myId);

  const totalPot = gameState?.pot || 0;

  const winnerMap = {};
  if (gameState?.phase === 'showdown' && gameState?.winners) {
    for (const w of gameState.winners) winnerMap[w.playerId] = w;
  }
  const myWin  = winnerMap[myId];
  const oppWin = winnerMap[opponent?.id];

  const isMyTurn     = gameState?.currentPlayerId === myId && !['waiting','showdown'].includes(gameState?.phase);
  const myDeadline   = isMyTurn ? gameState?.turnDeadline : null;
  const oppDeadline  = opponent?.isCurrentPlayer ? gameState?.turnDeadline : null;

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

  // Snapshot for showdown animation
  const [snap, setSnap] = useState({ chips: {}, pot: 0 });
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

  const locked   = isShowdown && !winDone;
  const dispPot  = locked ? snap.pot : totalPot;
  const chipsFor = p => locked ? (snap.chips[p?.id] ?? p?.chips ?? 0) : (p?.chips ?? 0);

  // Pot-to-winner banana flight. Fires once when showWinners flips true and
  // we have a confirmed winner. Bananas appear at the pot center and fly
  // toward the winner's nameplate (up to opp, down to me), then fade.
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
    const dir = winner.playerId === myId ? 1 : -1; // +1 down toward me, -1 up toward opp
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

  const centerAction = useCenterAction(gameState?.lastAction);

  const handName = (() => {
    if (!showWinners || !gameState?.winners?.length) return null;
    const w = gameState.winners[0];
    const name = gameState.players?.find(p => p.id === w?.playerId)?.name;
    if (w?.handName && w.handName !== 'Winner') return w.handName;
    return name ? `${name} wins` : 'Winner';
  })();

  const currentBet  = gameState?.currentBet || 0;
  const myBet       = me?.roundBet || 0;
  const bigBlind    = gameState?.bigBlind || 20;
  const minRaise    = currentBet + (gameState?.minRaise || bigBlind);
  const maxRaise    = myBet + (me?.chips || 0);
  const effectiveMin = Math.min(minRaise, maxRaise);
  const [raiseAmount, setRaiseAmount] = useState(effectiveMin);
  useEffect(() => { setRaiseAmount(effectiveMin); }, [gameState?.currentPlayerId]);

  const handleReset = () => fetch(`${SERVER_URL}/admin/reset`, { method: 'POST' }).catch(() => {});

  // Uniform scale of the entire scene to fit the device's safe area.
  // Same composition on every screen → just a different overall scale.
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const availW = winW;
  const availH = winH - insets.top - insets.bottom;
  const scale  = Math.min(availW / DESIGN_WIDTH, availH / DESIGN_HEIGHT);

  return (
   <View style={s.outer}>
    <SafeAreaView style={s.safe}>
      <View style={s.sceneWrapper}>
       <View style={[s.scene, { transform: [{ scale }] }]}>
        <Image source={INGAME_BG} style={s.bgImage} resizeMode="cover" pointerEvents="none" />
        <View style={s.bgTint} pointerEvents="none" />
        <View style={s.container}>

        {/* Top bar */}
        <View style={s.topBar}>
          <Text style={s.version}>{VERSION}</Text>
          <Pressable style={s.menuBtn} onPress={() => setMenuOpen(o => !o)}>
            <Text style={s.menuBtnTxt}>☰</Text>
          </Pressable>
        </View>

        {/* Settings menu */}
        {menuOpen && (
          <Pressable style={s.menuOverlay} onPress={() => setMenuOpen(false)}>
            <View style={s.menuPanel}>
              <Pressable style={s.menuItem} onPress={() => { setMenuOpen(false); navigationRef.navigate('Profile'); }}>
                <Text style={s.menuItemTxt}>👤 Profile</Text>
              </Pressable>
              <Pressable style={s.menuItem} onPress={() => { setMenuOpen(false); onLeave(); }}>
                <Text style={s.menuItemTxt}>🚪 Leave Table</Text>
              </Pressable>
              <Pressable style={[s.menuItem, s.menuItemRed]} onPress={() => { setMenuOpen(false); onLeave(); onLogout?.(); }}>
                <Text style={[s.menuItemTxt, { color: '#f87171' }]}>🔓 Log Out</Text>
              </Pressable>
            </View>
          </Pressable>
        )}

        {/* Opponent disconnect banner */}
        {opponentDisconnected && (
          <DisconnectBanner deadline={opponentDisconnected} />
        )}

        {/* Opponent pod — always rendered (avatar + nameplate fixed
            on the table even before an opponent joins). */}
        <View style={s.oppSection}>
          <PlayerPod player={opponent} isMe={false}
            turnDeadline={oppDeadline} lastAction={gameState?.lastAction}
            win={opponent ? activeWinners[opponent.id] : null}
            displayChips={opponent ? chipsFor(opponent) : 0}
            deckStyle={deckStyle} />
        </View>

        {/* Felt table */}
        <View
          style={s.felt}
          onLayout={e => {
            const { width, height } = e.nativeEvent.layout;
            if (width !== feltSize.w || height !== feltSize.h) setFeltSize({ w: width, h: height });
          }}
        >
          <FeltBackground width={feltSize.w} height={feltSize.h} />

          {/* Opponent bet — anchored at a fixed slot, horizontally centred
              so the chip + amount pill doesn't shift with content width. */}
          <View style={s.betTop} pointerEvents="none">
            {(opponent?.roundBet > 0 || opponent?.allIn) && (
              <View style={s.betPill}>
                {opponent.roundBet > 0 && <Chips amount={opponent.roundBet} size={33} />}
                {opponent.roundBet > 0 && <Text style={s.betAmt}>{opponent.roundBet.toLocaleString()}</Text>}
                {opponent.allIn && <Text style={s.allInTag}>ALL IN</Text>}
              </View>
            )}
          </View>

          {/* Community cards — always rendered (placeholders for missing
              slots) at a fixed position in the felt. */}
          {feltSize.h > 0 && (
            <View style={[s.communityFixed, { top: feltSize.h * 0.5 - 22 }]} pointerEvents="none">
              <View style={s.communityRow}>
                {[0,1,2,3,4].map(i => {
                  const card = i < revealedCC ? gameState?.communityCards?.[i] : null;
                  if (!card) return <View key={i} style={s.ccPlaceholder} />;
                  return <Card key={i} card={card} size="md" deckStyle={deckStyle} faceDown={false} />;
                })}
              </View>
            </View>
          )}

          {/* Pot — fixed slot under the community cards. */}
          {feltSize.h > 0 && (
            <View style={[s.potFixed, { top: feltSize.h * 0.5 + 38 }]} pointerEvents="none">
              {dispPot > 0 && (
                <View style={s.potRow}>
                  <Chips amount={dispPot} size={33} />
                  <Text style={s.potAmt}>{dispPot.toLocaleString()}</Text>
                </View>
              )}
            </View>
          )}

          {/* Narration slot removed — action label already lives in the
              nameplate, no need to duplicate it on the felt. */}

          {/* My bet — anchored at a fixed slot, horizontally centred. */}
          <View style={s.betBottom} pointerEvents="none">
            {(me?.roundBet > 0 || me?.allIn) && (
              <View style={s.betPill}>
                {me.roundBet > 0 && <Chips amount={me.roundBet} size={33} />}
                {me.roundBet > 0 && <Text style={s.betAmt}>{me.roundBet.toLocaleString()}</Text>}
                {me.allIn && <Text style={s.allInTag}>ALL IN</Text>}
              </View>
            )}
          </View>

          {/* Pot-to-winner banana flight */}
          {flightAmount > 0 && (
            <Animated.View pointerEvents="none" style={[s.winFlight, {
              opacity: flightOpacity,
              transform: [{ translateY: flightY }, { scale: flightScale }],
            }]}>
              <Chips amount={flightAmount} size={45} />
            </Animated.View>
          )}
        </View>

        {/* My pod — always rendered. */}
        <View style={s.mySection}>
          <PlayerPod player={me} isMe={true}
            turnDeadline={myDeadline} lastAction={gameState?.lastAction}
            win={me ? activeWinners[myId] : null}
            displayChips={me ? chipsFor(me) : 0}
            deckStyle={deckStyle} />
        </View>

        {/* Betting controls */}
        <View style={s.controls}>
          <BettingControls gameState={gameState} myId={myId}
            onAction={onAction} raiseAmount={raiseAmount}
            onRaiseChange={v => setRaiseAmount(Math.round(v))} />
        </View>

        {/* Dealer disc — rendered AFTER mySection so it stays on top of
            the hole cards, positioned in canvas coordinates relative to
            the visible felt oval. */}
        {opponent?.isDealer && <View style={[s.dealerBtn, s.dealerTop]}><Text style={s.dealerTxt}>D</Text></View>}
        {me?.isDealer       && <View style={[s.dealerBtn, s.dealerBottom]}><Text style={s.dealerTxt}>D</Text></View>}

        {/* Match over modal */}
        {matchOver && (
          <View style={s.modalOverlay}>
            <View style={s.modal}>
              <Text style={s.modalTitle}>
                {matchOver.winnerId === myId ? '🎉 You Won!' : `${matchOver.winnerName} Won!`}
              </Text>
              <View style={s.eloRow}>
                <Text style={[s.eloChange, matchOver.eloChange >= 0 ? s.eloPos : s.eloNeg]}>
                  {matchOver.eloChange >= 0 ? '+' : ''}{matchOver.eloChange} ELO
                </Text>
                <Text style={s.eloNew}>→ {matchOver.newElo}</Text>
              </View>

              {matchOver.myVote ? (
                // I already voted yes — waiting for opponent
                <Text style={s.modalWaiting}>
                  {matchOver.opponentWantsRematch
                    ? 'Starting rematch…'
                    : 'Waiting for opponent…'}
                </Text>
              ) : matchOver.opponentWantsRematch ? (
                // Opponent voted yes — prompt me
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
                // Neither voted yet
                <>
                  <Text style={s.modalSub}>One more for the road?</Text>
                  {/* Add Friend button — only show if not already friends (best effort) */}
                  {matchOver.winnerId !== myId || true ? (
                    <Pressable style={s.addFriendBtn} onPress={() => {
                      const opponentId = gameState?.players?.find(p => p.id !== myId)?.id;
                      if (opponentId && playerInfo?.playerId) {
                        fetch(`${SERVER_URL}/api/friends/request`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ requesterId: playerInfo.playerId, addresseeId: opponentId }),
                        });
                      }
                    }}>
                      <Text style={s.addFriendTxt}>+ Add {matchOver.winnerName && matchOver.winnerId !== myId ? matchOver.winnerName : 'Opponent'} as Friend</Text>
                    </Pressable>
                  ) : null}
                  <View style={s.modalBtns}>
                    <Pressable style={[s.modalBtn, s.modalBtnNo]} onPress={() => onRematch(false)}>
                      <Text style={s.modalBtnTxt}>Leave</Text>
                    </Pressable>
                    <Pressable style={[s.modalBtn, s.modalBtnYes]} onPress={() => onRematch(true)}>
                      <Text style={s.modalBtnTxt} numberOfLines={1}>Play Again</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        </View>
       </View>
      </View>
    </SafeAreaView>
   </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  outer:        { flex: 1, backgroundColor: '#2a1808' },
  safe:         { flex: 1, backgroundColor: 'transparent' },
  sceneWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scene:        { width: DESIGN_WIDTH, height: DESIGN_HEIGHT, overflow: 'hidden' },
  // Table artwork fills the scaled canvas. resizeMode 'cover' so the floor
  // decorations bleed off the canvas edges instead of leaving bands.
  bgImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  bgTint:  { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.18)' },
  container: { flex: 1 },

  // Top bar
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6 },
  version: { color: 'rgba(255,255,255,0.2)', fontSize: 11 },
  menuBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  menuBtnTxt: { color: colors.white, fontSize: 16 },
  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  menuPanel: { position: 'absolute', top: 48, right: 12, width: 200, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, overflow: 'hidden', elevation: 8 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  menuItemRed: { borderBottomWidth: 0 },
  menuItemTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },

  // Sections
  disconnectBanner: { marginHorizontal: 12, marginBottom: 4, backgroundColor: 'rgba(251,146,60,0.18)', borderWidth: 1, borderColor: 'rgba(251,146,60,0.5)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  disconnectTxt: { color: '#fb923c', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  oppSection: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 0 },
  // transform: translateY pushes the my-pod visually down without
  // shifting the flex layout (flex:1 on the felt absorbs paddingTop
  // changes). zIndex keeps the pod above the betting controls bg.
  mySection:  {
    paddingHorizontal: 12, paddingTop: 0, paddingBottom: 0,
    transform: [{ translateY: 18 }],
    zIndex: 30,
  },

  // Pod — fixed height. Children placed absolutely so nothing shifts.
  pod: { position: 'relative', height: POD_HEIGHT, marginHorizontal: 8 },

  // Avatar block — vertically centred in the pod, anchored to its own
  // horizontal end. Always on top (zIndex 50, elevation 12).
  avatarBlock: {
    position: 'absolute', top: AVATAR_TOP,
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 50, elevation: 12,
  },
  avatarBlockMe:  { right: 0 },
  avatarBlockOpp: { left:  0 },
  ring: { position: 'absolute', top: (AVATAR_SIZE - RING_BOX) / 2, left: (AVATAR_SIZE - RING_BOX) / 2 },

  // Nameplate — fixed-height capsule, vertically centred on the avatar.
  // Fully opaque background (never transparent) and a higher zIndex than
  // the hole cards so any card overlap is clipped behind the pill.
  nameplate: {
    position: 'absolute',
    top: NAMEPLATE_TOP, height: NAMEPLATE_HEIGHT,
    backgroundColor: '#08080a',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 32,
    paddingVertical: 6,
    justifyContent: 'center',
    gap: 1,
    zIndex: 3, elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    overflow: 'hidden',
  },
  // Horizontally: nameplate is ~15% narrower than the original. The
  // avatar end still overlaps the pill ~44 px past the avatar's inner
  // edge; the OPPOSITE end is shortened by 40 px.
  nameplateMe:  { left:  40, right: AVATAR_SIZE - 44, paddingLeft: 18, paddingRight: 60 },
  nameplateOpp: { right: 40, left:  AVATAR_SIZE - 44, paddingLeft: 60, paddingRight: 18 },
  nameplateActive: { borderColor: colors.gold, shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  // Folded / waiting: only the inner text fades, never the pill itself.
  nameplateFolded: {},
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  podName: { color: colors.white, fontSize: 17, fontWeight: '800', flexShrink: 1 },
  podChips: { color: '#facc15', fontSize: 18, fontWeight: '900' },
  podChipsWin: { color: '#4ade80' },
  podChipsAction: { color: colors.orange, fontSize: 14, fontWeight: '800' },
  badge: { fontSize: 10, color: '#fff', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, fontWeight: '700' },
  badgeSB: { backgroundColor: '#2563eb' },
  badgeBB: { backgroundColor: '#7c3aed' },
  badgeAI: { backgroundColor: '#dc2626' },
  countdown: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '800' },
  countdownUrgent: { color: '#f87171' },

  // Hole cards — anchored by their BOTTOM edge so xl and lg cards
  // (different heights) sit on the same horizontal line just above the
  // nameplate. Close to the avatar (CARD_AVATAR_GAP horizontal gap)
  // and just above the nameplate (CARD_NAMEPLATE_GAP vertical gap),
  // without touching either.
  // Hole cards row: tilted via cardSlot rotation, with a positive gap so
  // the two cards never touch each other.
  // Hole cards held by the player. Slight overlap, fanned via rotation,
  // tucked behind the nameplate (lower zIndex) so any part of the cards
  // crossing the nameplate's top edge is clipped by the pill.
  podCards: { position: 'absolute', flexDirection: 'row', gap: 6, zIndex: 1 },
  podCardsMe:  { bottom: CARDS_BOTTOM, right: AVATAR_SIZE + CARD_AVATAR_GAP },
  podCardsOpp: { bottom: CARDS_BOTTOM, left:  AVATAR_SIZE + CARD_AVATAR_GAP },
  // Rotation only — translation/scale lives on the outer Animated.View
  // so the deal animation can shift world-space coordinates without
  // tripping over the rotation matrix.
  cardSlotLeft:  { transform: [{ rotate: '-8deg' }] },
  cardSlotRight: { transform: [{ rotate:  '8deg' }] },
  hidden: { opacity: 0 },

  // Waiting
  waitingPod: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 18, alignItems: 'center' },
  waitingTxt: { color: colors.gray, fontSize: 14, fontStyle: 'italic' },
  // Placeholder treatment when no player has joined yet — the avatar
  // dims while the nameplate stays SOLID (no transparency).
  avatarPlaceholder: { opacity: 0.45 },
  nameplateWaiting: {},

  // Felt — transparent positioning anchor. The wooden table artwork is
  // drawn behind the whole scene (INGAME_BG), so the felt View itself just
  // holds the community cards, pot, bets and dealer disc at their fixed
  // positions, with the table artwork showing through.
  felt: {
    flex: 1, marginHorizontal: 8,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  // Fixed slots on the felt — community cards, pot, narration, and the
  // two bet pills all sit at known positions and only their content
  // changes. Full-width centring containers keep the chip+amount pair
  // horizontally locked regardless of width.
  communityFixed: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  communityRow:   { flexDirection: 'row', gap: 6, alignItems: 'center' },
  ccPlaceholder:  { width: 42, height: 50 },

  potFixed: { position: 'absolute', left: 0, right: 0, alignItems: 'center', height: 40, justifyContent: 'flex-start', zIndex: 2 },
  potRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4 },
  potAmt:   { color: '#4a2a10', fontSize: 21, fontWeight: '900' },

  narrationFixed: { position: 'absolute', left: 20, right: 20, alignItems: 'center', height: 22, justifyContent: 'flex-start', zIndex: 2 },
  narration:      { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontStyle: 'italic', textAlign: 'center' },

  // Right at the player end of the felt — top bet pushed up into the
  // top oval rim area, bottom bet pushed past the felt's bottom edge
  // so it sits right above the player's hole cards.
  betTop:    { position: 'absolute', top: -40,    left: 0, right: 0, alignItems: 'center', height: 40, justifyContent: 'flex-start', zIndex: 20 },
  betBottom: { position: 'absolute', bottom: -25, left: 0, right: 0, alignItems: 'center', height: 40, justifyContent: 'flex-start', zIndex: 20 },
  betPill:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  betAmt:    { color: '#4a2a10', fontSize: 18, fontWeight: '900' },
  allInTag:  { color: '#f87171', fontSize: 11, fontWeight: '800' },

  dealerBtn: { position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: '#f5f5dc', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#888', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4, zIndex: 60 },
  // Canvas-absolute coordinates on the 393×852 design canvas.
  //   Top (1 o'clock) — nudged a touch further down vs the previous spot.
  //   Bottom (7 o'clock) — moved up onto the felt, just above the LEFT
  //     hole card of the bottom player (no longer down on the floor).
  dealerTop:    { top: 235, left: 247 },
  dealerBottom: { top: 465, left:  88 },
  dealerTxt: { color: '#333', fontSize: 13, fontWeight: '900' },

  // Pot-to-winner banana flight overlay (sits centered on the felt)
  winFlight: { position: 'absolute', top: '50%', alignSelf: 'center', marginTop: -14, zIndex: 30 },

  // Controls — fixed minHeight so the felt + pods don't shift when the
  // BettingControls children appear/disappear (slider + buttons only
  // render on the local player's turn, so the slot collapses otherwise).
  // Fixed height so the avatar+nameplate above never shift whether the
  // BettingControls children are rendered or not. Maximum content =
  // slider row (~40) + buttons (~76) + wrap gap (10) + paddings (16) ≈ 142.
  controls: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 6, height: 158, backgroundColor: 'rgba(0,0,0,0.5)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },

  // Match over modal
  modalOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 24, padding: 28, alignItems: 'center', gap: 14, width: '80%' },
  modalTitle: { color: colors.white, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  eloRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eloChange: { fontSize: 28, fontWeight: '900' },
  eloPos: { color: '#4ade80' },
  eloNeg: { color: '#f87171' },
  eloNew: { color: colors.gray, fontSize: 16 },
  modalSub: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  addFriendBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center' },
  addFriendTxt: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  modalWaiting: { color: colors.gray, fontSize: 14, fontStyle: 'italic' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalBtnNo:  { backgroundColor: 'rgba(255,255,255,0.1)' },
  modalBtnYes: { backgroundColor: colors.gold },
  modalBtnTxt: { color: colors.white, fontSize: 15, fontWeight: '800' },
});
