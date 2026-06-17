import React, { useContext, useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Easing,
  useWindowDimensions, Image, Platform, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { GameContext } from '../context/GameContext';
import Card from '../components/Card';
import Avatar from '../components/Avatar';
import { ChipStack } from '../components/PokerChip';
import BettingControls from '../components/BettingControls';
import PreviousHandDialog from '../components/PreviousHandDialog';
import SoundButton from '../components/SoundButton';
import { colors } from '../theme';
import { SERVER_URL } from '../config';
import { playSfx } from '../audio/sfx';

const FEEDBACK_OPTIONS = [
  { value: 'bug',        label: '🐞 Bug' },
  { value: 'game_issue', label: '🎮 Game issue' },
  { value: 'feedback',   label: '💬 Feedback' },
];

// Mirror of the server's default blind schedule (server/matchFormat.js) so we can
// tell, at the end of a hand, when blinds are about to escalate for the next one.
const BLIND_SCHEDULE = {
  handsPerLevel: 5,
  levels: [
    { sb: 10,  bb: 20 },
    { sb: 15,  bb: 30 },
    { sb: 25,  bb: 50 },
    { sb: 50,  bb: 100 },
    { sb: 100, bb: 200 },
  ],
};
function blindsForHand(handNumber, fmt = BLIND_SCHEDULE) {
  const per = Math.max(1, fmt.handsPerLevel);
  const idx = Math.min(Math.floor((Math.max(1, handNumber) - 1) / per), fmt.levels.length - 1);
  return fmt.levels[idx];
}

// Table variants — switch by changing TABLE_VARIANT ('tall' | 'fat').
// Each variant carries its own native aspect so the table box always matches it.
// Only the active variant's asset ships; the tall one (game-table.png,
// 1024×1536) lives in git history — restore it and its entry to switch back.
const TABLE_VARIANTS = {
  fat:  { src: require('../../assets/game-table-fat.png'), aspect: 960 / 1536 },
};
const TABLE_VARIANT = 'fat';
const INGAME_TABLE  = TABLE_VARIANTS[TABLE_VARIANT].src;

// Layer 0 ambient — Group C environment fill (spec §1/§2): viewport-anchored,
// rendered with `cover` so it crops rather than distorts on any aspect ratio.
const AMBIENT_BG = require('../../assets/game-bg.jpg');

// All timing constants live in src/timings.js
import {
  BET_HOLD_MS, BET_SLIDE_MS,
  STREET_DEAL_PAUSE, FLOP_CARD_GAP, ALLIN_CARD_GAP, ALLIN_INITIAL_PAUSE,
  FOLD_REVEAL_PAUSE, SHOWDOWN_REVEAL_PAUSE, CHIP_FLIGHT_MS,
} from '../timings';

const TOP_BAR_H    = 50;
const ACTION_BAR_H = 125;

// ─── Group A reference canvas ─────────────────────────────────────────────────
// 393×590 (1:1.5) — matches the content area left between the top bar and the
// betting controls on most phones, so width binds and the canvas fills the screen.
const DESIGN_W = 393;
const DESIGN_H = Math.round(DESIGN_W * 1.6);  // 629 — 1:1.6, matches the table asset
                                              // and budget-Android (20:9) content areas

// ─── Table geometry (spec §16: 1024×1536 asset, aspect 0.667) ────────────────
// The asset is natively 1:1.5 like the canvas — it fills it edge to edge,
// minus ~5px margin per side.
const TABLE_ASPECT = TABLE_VARIANTS[TABLE_VARIANT].aspect;
const TABLE_W  = DESIGN_W - 10;
const TABLE_H  = Math.round(TABLE_W / TABLE_ASPECT);
const TABLE_L  = Math.round((DESIGN_W - TABLE_W) / 2);
const TABLE_T  = Math.round(0.5 * DESIGN_H - TABLE_H / 2);

// ─── Pod geometry — static canvas-unit values ─────────────────────────────────
// Circle diameter drives everything. Nameplate clears the circle with a fixed
// overlap (44px) + padding (10px gap) — works regardless of avatar size.
const RING_W_PX  = 6;
const AVATAR_SZ  = Math.round(96 * 1.6);                   // circle diameter — 60% bigger (96 → 154)
const POD_H      = AVATAR_SZ + 14;                         // snug around circle
const NP_H       = 72;                                     // nameplate height — FIXED, does not scale with avatar
const NP_TOP     = Math.round((POD_H - NP_H) / 2);
const AV_TOP     = Math.round((POD_H - AVATAR_SZ) / 2);
const NAMEPLATE_OVERLAP = 49;                              // FIXED — nameplate size unchanged
const AVATAR_PAD = 24;                                     // clears the avatar overlap (~16px) — small so the ID gets max width
const RING_R     = (AVATAR_SZ - RING_W_PX) / 2;                            // ring sits inside the avatar edge (no overhang)
const RING_BOX   = Math.ceil(RING_R * 2 + RING_W_PX);
const RING_CIRC  = 2 * Math.PI * RING_R;

// ─── Group A layout — pod positions derived from the (Brian-updated) table geometry ──
const POD_W        = Math.round(0.62 * DESIGN_W);                          // 244
const POD_L        = Math.round((DESIGN_W - POD_W) / 2);
const RING_TOP_Y   = Math.round(TABLE_T + 0.065 * TABLE_H);
const RING_BOT_Y   = Math.round(TABLE_T + TABLE_H - 0.065 * TABLE_H);
// Debug-grid column lines: A=0, B=1, C=2, D=3, E=4 (× TABLE_W/4 from TABLE_L)
const COL_C_X    = TABLE_L + 2 * (TABLE_W / 4);                            // used by dealer buttons
// Stage clips at the canvas edges (overflow:hidden), so the visible play-area
// side frames are x=0 (left) and x=DESIGN_W (right). Hug them, but don't touch.
const FRAME_GAP  = 4;                                                      // px gap kept from the side frame
// Opponent pod: avatar LEFT edge just inside the left frame; vertical on the A2/B2 (row-2) line
const ROW2_Y     = TABLE_T + 1 * (TABLE_H / 8);
const OPP_POD_L  = FRAME_GAP;                                              // avatar left edge ≈ left frame
// Push the pod up so the hole cards (ABOVE the nameplate) almost touch the
// play-area top. Card top = OPP_POD_T + NP_TOP + 10 − 59, so this lands it at the gap.
const OPP_CARDS_TOP_GAP = 3;
const OPP_POD_T  = OPP_CARDS_TOP_GAP - (NP_TOP + 10 - 59);
// Player pod: avatar RIGHT edge just inside the right frame; vertical on the D8/E8 (row-8) line
const ROW8_Y     = TABLE_T + 7 * (TABLE_H / 8);
const MY_POD_L   = Math.round(DESIGN_W - FRAME_GAP - POD_W);              // avatar right edge ≈ right frame
const MY_POD_T   = Math.round(ROW8_Y - AV_TOP - AVATAR_SZ / 2);
const CC_T         = Math.round(0.455 * DESIGN_H - 31);                   // nudged up ~6px
const POT_T        = Math.round(TABLE_T + 4 * (TABLE_H / 8) + 14);        // nudged up ~6px
const OPP_BET_T    = Math.round(TABLE_T + 2 * (TABLE_H / 8));             // row 3 line
const MY_BET_T     = Math.round(0.620 * DESIGN_H - 20 + TABLE_H / 16);   // down half row
const MY_BET_L     = Math.round(TABLE_W / 4);                             // right half column (center +62px)
// Player bet grows UPWARD from this baseline (toward the pot) so a tall chip pile
// never reaches down into the player's hole cards below it.
const MY_BET_BASE   = MY_BET_T + 33;                                      // pile bottom — keeps small bets where they were
const MY_BET_SLOT_H = 96;                                                 // headroom for the tallest pile

const DEALER_SZ    = Math.round(0.07 * DESIGN_W);
// Top dealer button: just to the LEFT of the D3 cross (right edge on D-col, centered on row-3 line)
const DEALER_OPP_L = Math.round(TABLE_L + 3 * (TABLE_W / 4) - DEALER_SZ);
const DEALER_OPP_T = Math.round(TABLE_T + 2 * (TABLE_H / 8) - DEALER_SZ / 2);
// Bottom dealer button: just ABOVE the B7 cross (centered on B-col, bottom on row-7 line)
const DEALER_MY_L  = Math.round(TABLE_L + 1 * (TABLE_W / 4) - DEALER_SZ / 2) - 12;
const DEALER_MY_T  = Math.round(TABLE_T + 6 * (TABLE_H / 8) - DEALER_SZ);
// ── Nameplate placement — anchored to each avatar's INNER edge with a fixed
// overlap, so it works on any table width (extends toward center; width unchanged).
const NP_WIDTH    = POD_W - 16 - NAMEPLATE_OVERLAP;                       // 179 — nameplate box width
const NP_RADIUS   = 32;                                                   // outer corner radius (avatar-side corners squared)
const TIMER_OUTER_INSET = 20;                                             // pull the timer's outer end in past the corner so every segment touches the plate
const NP_AV_OVERLAP   = 16;                                              // how far the plate tucks behind the avatar's inner edge
const AV_BOTTOM_INNER = MY_POD_L + POD_W - AVATAR_SZ;                     // bottom avatar's left (inner) edge
const AV_TOP_INNER    = OPP_POD_L + AVATAR_SZ;                            // top avatar's right (inner) edge
// Bottom nameplate: RIGHT edge tucks behind the avatar; plate runs toward center
const NP_ME_LEFT  = Math.round((AV_BOTTOM_INNER + NP_AV_OVERLAP - NP_WIDTH) - MY_POD_L);
const NP_ME_RIGHT = POD_W - NP_ME_LEFT - NP_WIDTH;
// Top nameplate: LEFT edge tucks behind the avatar; plate runs toward center
const NP_OPP_LEFT  = Math.round((AV_TOP_INNER - NP_AV_OVERLAP) - OPP_POD_L);
const NP_OPP_RIGHT = POD_W - NP_OPP_LEFT - NP_WIDTH;
// Cards sit a fixed gap from each avatar's INNER edge → same spacing for both players
const CARD_AV_GAP     = 8;                                                // px between avatar edge and nearest card
const MY_CARD_PAIR_W  = 58 * 2;                                           // player pair width (cards render flush: gap 6 + marginLeft -6 = 0)
const MY_CARDS_L      = AV_BOTTOM_INNER - CARD_AV_GAP - MY_CARD_PAIR_W;   // pair right edge = avatar edge − gap
const MY_CARDS_T      = MY_POD_T + NP_TOP + 10 - 59;                      // cards bottom 10px into nameplate
const OPP_CARDS_L     = AV_TOP_INNER + CARD_AV_GAP;                       // pair left edge = avatar edge + gap
const OPP_CARDS_T     = OPP_POD_T + NP_TOP + 10 - 59;                     // cards ABOVE the nameplate, bottom 10px tucked in

// ─── TimerRing ────────────────────────────────────────────────────────────────
function TimerRing({ deadline, duration }) {
  const [dashOffset, setDashOffset] = useState(RING_CIRC);
  const [timeLeft, setTimeLeft]     = useState(null);
  useEffect(() => {
    if (!deadline || !duration) { setDashOffset(RING_CIRC); setTimeLeft(null); return; }
    const tick = () => {
      const rem = Math.max(0, deadline - Date.now());
      setDashOffset(((duration - rem) / duration) * RING_CIRC);
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

// ─── TimerBar ─────────────────────────────────────────────────────────────────
// Segmented gauge tucked under the nameplate (inset past the rounded corner so it
// starts/stops on the curve, never beyond the plate). Segments run green→red
// left→right; the gauge starts full and depletes from the left as the turn elapses.
const TIMER_SEGMENTS = 20;
function TimerBar({ deadline, duration, isMe }) {
  const [frac, setFrac] = useState(0);   // elapsed fraction 0→1
  useEffect(() => {
    if (!deadline || !duration) { setFrac(0); return; }
    const tick = () => {
      const rem = Math.max(0, deadline - Date.now());
      setFrac(Math.min(1, (duration - rem) / duration));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const offCount = Math.floor(frac * TIMER_SEGMENTS);   // drains from the rounded outer end toward the avatar
  // Clip box mirrors the nameplate exactly → the bar's ends trace the plate's curve
  return (
    <View style={[s.timerClip, isMe ? s.timerClipMe : s.timerClipOpp]} pointerEvents="none">
      <View style={s.timerRow}>
        {Array.from({ length: TIMER_SEGMENTS }, (_, i) => {
          // distance from the OUTER (rounded) end — bottom outer = left, top outer = right
          const d   = isMe ? i : (TIMER_SEGMENTS - 1 - i);
          const hue = Math.round(120 * (1 - d / (TIMER_SEGMENTS - 1)));  // green at outer → red at avatar
          const on  = d >= offCount;                     // green/outer drains first
          return <View key={i} style={[s.timerSeg,
            { backgroundColor: on ? `hsl(${hue}, 85%, 52%)` : 'transparent' }]} />;
        })}
      </View>
    </View>
  );
}

// ─── HoleCards — independent Group A element (spec §5: playerCards / opponentCards)
// Separated from PlayerPod so player and opponent cards anchor at their own
// spec coordinates, independent of where the nameplates sit.
function HoleCards({ player, isMe, deckStyle, onDealComplete, handNumber }) {
  const hasCards = !!player?.holeCards?.length && !player?.folded;

  const dealTy0 = useRef(new Animated.Value(0)).current;
  const dealTy1 = useRef(new Animated.Value(0)).current;
  const dealSc0 = useRef(new Animated.Value(1)).current;
  const dealSc1 = useRef(new Animated.Value(1)).current;
  const dealOp0 = useRef(new Animated.Value(1)).current;
  const dealOp1 = useRef(new Animated.Value(1)).current;
  const wasHas     = useRef(false);
  const seenHand   = useRef(handNumber);

  useEffect(() => {
    // New hand number means new deal — reset so animation always plays
    if (handNumber !== seenHand.current) {
      wasHas.current = false;
      seenHand.current = handNumber;
    }
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
      ]).start(({ finished }) => { if (finished) onDealComplete?.(); });
    }
    wasHas.current = hasCards;
  }, [hasCards, isMe, handNumber]);

  if (!hasCards) return null;

  const size = 'xl';   // opponent cards render the same as the player's for clear reading
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

// ─── PlayerPod — avatar + nameplate only (hole cards are now separate) ────────
function PlayerPod({ player, isMe, observing, turnDeadline, turnDurationMs, lastAction, win, displayChips, deckStyle, avatarOverride, sittingOut }) {
  const actionLbl = useActionFlash(player, lastAction);
  const present   = !!player;
  const isActive  = present && !!player.isCurrentPlayer;
  const displayName = present ? player.name : (isMe && !observing ? 'You' : 'Waiting…');
  const chipLabel = !present ? '—'
    : (win ? '🏆 Winner!' : (actionLbl || (displayChips ?? player.chips).toLocaleString()));

  const avatar = (
    <View style={[
      s.avatarBlock,
      { top: AV_TOP, width: AVATAR_SZ, height: AVATAR_SZ },
      isMe ? s.avatarBlockMe : s.avatarBlockOpp,
      !present && s.avatarPlaceholder,
    ]}>
      <Avatar size={AVATAR_SZ} avatarId={avatarOverride || player?.avatarId} />
    </View>
  );

  const nameplate = (
    <View style={[
      s.nameplate,
      { top: NP_TOP, height: NP_H },
      // Square off the corners that meet the avatar (flat edge tucks behind the
      // circle) — keep the outer corners rounded.
      isMe
        ? { left: NP_ME_LEFT,  right: NP_ME_RIGHT,  paddingLeft: 12, paddingRight: AVATAR_PAD,
            borderTopLeftRadius: NP_RADIUS, borderBottomLeftRadius: NP_RADIUS,
            borderTopRightRadius: 0, borderBottomRightRadius: 0 }
        : { left: NP_OPP_LEFT, right: NP_OPP_RIGHT, paddingLeft: AVATAR_PAD, paddingRight: 12,
            borderTopRightRadius: NP_RADIUS, borderBottomRightRadius: NP_RADIUS,
            borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
      isActive && s.nameplateActive,
      present && player.folded && s.nameplateFolded,
      !present && s.nameplateWaiting,
      sittingOut && s.nameplateSittingOut,
    ]}>
      <View style={s.nameRow}>
        <Text style={[s.podName, present && player.folded && s.podTextFolded]} numberOfLines={1}>{displayName}</Text>
        {present && player.isSmallBlind && <Text style={[s.badge, s.badgeSB]}>SB</Text>}
        {present && player.isBigBlind   && <Text style={[s.badge, s.badgeBB]}>BB</Text>}
        {sittingOut && <Text style={[s.badge, s.badgeSitOut]}>Sitting Out</Text>}
      </View>
      <View style={s.chipsRow}>
        <Text style={[s.podChips, win && s.podChipsWin, !!actionLbl && s.podChipsAction,
          present && player.folded && s.podTextFolded]}
          numberOfLines={1}>{chipLabel}</Text>
      </View>
    </View>
  );

  return (
    <View style={s.pod}>
      {nameplate}
      <TimerBar deadline={turnDeadline} duration={turnDurationMs} isMe={isMe} />
      {avatar}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GameScreen({ navigation }) {
  const {
    gameState, transition, myId, onAction, onLeave, onRematch, onLogout,
    matchOver, navigationRef, deckStyle, playerInfo, onHandEndAnimDone,
    handEventsRef, bustReveal = null, forfeitReveal = null, uiConfig = {},
    onBotActionRequest,
  } = useContext(GameContext);

  useEffect(() => {
    if (Platform.OS === 'web' && !playerInfo) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  }, []);

  const [menuOpen,      setMenuOpen]      = useState(false);
  const [leaveWarning,  setLeaveWarning]  = useState(false);
  const [replayOpen,    setReplayOpen]    = useState(false);

  // Real blind schedule from the server (so the "blinds go up" notice is accurate)
  const [blindFmt, setBlindFmt] = useState(BLIND_SCHEDULE);
  useEffect(() => {
    fetch(`${SERVER_URL}/api/admin/match-format`)
      .then(r => r.json())
      .then(d => { if (d?.levels?.length && d?.handsPerLevel) setBlindFmt({ handsPerLevel: d.handsPerLevel, levels: d.levels }); })
      .catch(() => {});
  }, []);

  // Action sound effects — play when the latest action changes (either player/bot)
  const sfxSeen = useRef(gameState?.lastAction?.t);
  useEffect(() => {
    const a = gameState?.lastAction;
    if (a?.t && a.t !== sfxSeen.current) { sfxSeen.current = a.t; playSfx(a.action); }
  }, [gameState?.lastAction?.t]);

  // Match-over modal reveal animation — staggered fade-in of each section
  const moScrim   = useRef(new Animated.Value(0)).current;
  const moCard    = useRef(new Animated.Value(0)).current;
  const moTitle   = useRef(new Animated.Value(0)).current;
  const moAvatar  = useRef(new Animated.Value(0)).current;
  const moElo     = useRef(new Animated.Value(0)).current;
  const moBtns    = useRef(new Animated.Value(0)).current;
  const moSlide   = useRef(new Animated.Value(30)).current;
  useEffect(() => {
    if (!matchOver) {
      [moScrim, moCard, moTitle, moAvatar, moElo, moBtns].forEach(a => a.setValue(0));
      moSlide.setValue(30);
      return;
    }
    Animated.sequence([
      Animated.parallel([
        Animated.timing(moScrim,  { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(moCard,   { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(moSlide,  { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(moTitle,  { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(moAvatar, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(moElo,    { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(moBtns,   { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [matchOver]);

  // In-game feedback
  const [feedbackOpen,   setFeedbackOpen]   = useState(false);
  const [feedbackType,   setFeedbackType]   = useState('bug');
  const [typeMenuOpen,   setTypeMenuOpen]   = useState(false);
  const [feedbackText,   setFeedbackText]   = useState('');
  const [feedbackState,  setFeedbackState]  = useState('idle'); // idle | sending | done | error

  const openFeedback = () => {
    setFeedbackType('bug');
    setFeedbackText('');
    setFeedbackState('idle');
    setTypeMenuOpen(false);
    setFeedbackOpen(true);
  };

  const submitFeedback = async () => {
    if (!feedbackText.trim() || feedbackState === 'sending') return;
    setFeedbackState('sending');
    try {
      const res = await fetch(`${SERVER_URL}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: feedbackType,
          details: feedbackText.trim(),
          playerId: playerInfo?.playerId,
          playerName: playerInfo?.name,
        }),
      });
      if (!res.ok) throw new Error('bad status');
      setFeedbackState('done');
      setTimeout(() => setFeedbackOpen(false), 1200);
    } catch (e) {
      setFeedbackState('error');
    }
  };

  // Spectators aren't in players[] — seat player1 at the bottom, player2 on top
  const observing = !!gameState?.observing;
  const me       = observing ? gameState?.players?.[0] : gameState?.players?.find(p => p.id === myId);
  const opponent = observing ? gameState?.players?.[1] : gameState?.players?.find(p => p.id !== myId);
  const bottomId = observing ? me?.id : myId;
  const totalPot = gameState?.pot || 0;

  const winnerId = matchOver?.winnerId;
  const winnerAvatarId =
    gameState?.players?.find(p => p.id === winnerId)?.avatarId
    || (winnerId === myId ? playerInfo?.avatarId : undefined);
  const winnerMap = {};
  if (gameState?.phase === 'showdown' && gameState?.winners) {
    for (const w of gameState.winners) winnerMap[w.playerId] = w;
  }
  const sittingOutIds = new Set(gameState?.sittingOut || []);
  const meSittingOut  = me ? sittingOutIds.has(me.id) : false;
  const oppSittingOut = opponent ? sittingOutIds.has(opponent.id) : false;

  // ── Street-close bet collection ─────────────────────────────────────────
  // Driven by the live hand-events stream (arrives just before the game-state
  // that reflects it). When a batch closes a street (deal_board / showdown /
  // hand_end), the settled state has already cleared the bets and grown the
  // board — instead of jumping there, show the final equal bet piles, hold
  // BET_HOLD_MS, slide them into the pot, then release to the live state.
  const [collect, setCollect] = useState(null); // { bets: {playerId: amt}, pot }
  const collecting  = !!collect;
  const collectProg = useRef(new Animated.Value(0)).current;
  const prevSnapRef = useRef(null);
  useEffect(() => {
    const prev = prevSnapRef.current;
    prevSnapRef.current = gameState;
    const batch = handEventsRef?.current;
    if (!batch || !gameState || batch.matchId !== gameState.matchId) return;
    handEventsRef.current = null; // each batch animates at most once
    const rows = batch.rows || [];
    if (!rows.some(r => ['deal_board', 'showdown', 'hand_end'].includes(r.type))) return;
    if (!prev || prev.matchId !== gameState.matchId || prev.handNumber !== gameState.handNumber) return;
    // Final piles = what was already on the felt + what the closing action added
    const bets = {};
    for (const p of prev.players || []) if (p.roundBet > 0) bets[p.id] = p.roundBet;
    for (const r of rows) if (r.type === 'action' && r.amount > 0) bets[r.playerId] = (bets[r.playerId] || 0) + r.amount;
    if (!Object.values(bets).some(v => v > 0)) return;
    setCollect({ bets, pot: prev.pot || 0 });
  }, [gameState]);
  useEffect(() => {
    if (!collect) return;
    collectProg.setValue(0);
    let anim = null;
    const t = setTimeout(() => {
      anim = Animated.timing(collectProg, {
        toValue: 1, duration: BET_SLIDE_MS,
        easing: Easing.bezier(0.45, 0, 0.75, 1), useNativeDriver: true,
      });
      anim.start(({ finished }) => { if (finished) setCollect(null); });
    }, BET_HOLD_MS);
    return () => { clearTimeout(t); if (anim) anim.stop(); };
  }, [collect]);

  // Staggered community card reveal
  const targetCC   = gameState?.communityCards?.length || 0;
  const isShowdown = gameState?.phase === 'showdown';
  const [revealedCC, setRevealedCC] = useState(0);

  // ── dealer_animating — three named flags, one per dealer animation that
  // precedes a player/bot action. All must clear before controls show or bot fires.
  const [dealingHoleCards, setDealingHoleCards] = useState(false);
  const [revealingBoard,   setRevealingBoard]   = useState(false);
  // collecting (bet-slide) is already tracked below as `collecting = !!collect`

  const dealerAnimating = dealingHoleCards || revealingBoard;

  // Gate actions on all streets: buttons/bot are suppressed until every community
  // card on the current street has finished animating in. Preflop is always open
  // because targetCC === 0 → 0 >= 0 is true.
  const isMyTurn    = !observing && gameState?.currentPlayerId === myId && !['waiting','showdown'].includes(gameState?.phase) && revealedCC >= targetCC;
  const myDeadline  = (observing ? me?.isCurrentPlayer : isMyTurn) ? gameState?.turnDeadline : null;
  const oppDeadline = opponent?.isCurrentPlayer ? gameState?.turnDeadline : null;
  useEffect(() => {
    if (targetCC === 0) { setRevealedCC(0); return; }
    if (collecting) return; // hold new cards until the bets finish sliding in
    if (revealedCC >= targetCC) return;
    setRevealingBoard(true);
    const timers = [];
    const anyAllIn = gameState?.players?.some(p => p.allIn) ?? false;
    let acc = (isShowdown && anyAllIn) ? ALLIN_INITIAL_PAUSE : STREET_DEAL_PAUSE;
    for (let i = revealedCC; i < targetCC; i++) {
      const isLast = i === targetCC - 1;
      timers.push(setTimeout(() => {
        setRevealedCC(i + 1);
        if (isLast) setRevealingBoard(false);
      }, acc));
      const next = i + 1;
      if (next < targetCC) {
        if (next <= 2) acc += FLOP_CARD_GAP;
        else if (isShowdown) acc += ALLIN_CARD_GAP;
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [targetCC, isShowdown, collecting]);

  const isBotMatch = !!gameState?.isBotMatch;

  const isHandEnded = transition?.type === 'HAND_ENDED';

  const [showWinners, setShowWinners] = useState(false);
  useEffect(() => {
    if (!isHandEnded) { setShowWinners(false); return; }
    if (revealedCC < targetCC) return;
    if (collecting) return;
    const delay = transition?.reason === 'showdown' ? SHOWDOWN_REVEAL_PAUSE : FOLD_REVEAL_PAUSE;
    const t = setTimeout(() => setShowWinners(true), delay);
    return () => clearTimeout(t);
  }, [isHandEnded, revealedCC, targetCC, collecting, transition]);

  const activeWinners = showWinners ? winnerMap : {};
  const bustWinId = bustReveal?.winnerId ?? null;

  // Deal sound + hole-card animation gate — when a new hand begins
  const dealSeen = useRef(0);
  useEffect(() => {
    const h = gameState?.handNumber || 0;
    if (h > dealSeen.current) {
      playSfx('deal');
      setDealingHoleCards(true);
    }
    dealSeen.current = h;
  }, [gameState?.handNumber]);

  // Community card sound — once per board card as it's revealed (staggered above)
  const ccSeen = useRef(0);
  useEffect(() => {
    if (revealedCC > ccSeen.current) playSfx('community');
    ccSeen.current = revealedCC;
  }, [revealedCC]);

  // Pot sound — when the pot is awarded to the winner
  const potSeen = useRef(false);
  useEffect(() => {
    if (showWinners && !potSeen.current) playSfx('pot');
    potSeen.current = showWinners;
  }, [showWinners]);

  // Turn cue — very soft sound when it becomes the player's turn to act
  const turnSeen = useRef(false);
  useEffect(() => {
    if (isMyTurn && !turnSeen.current) playSfx('turn');
    turnSeen.current = isMyTurn;
  }, [isMyTurn]);

  // Turn-timer alarm — light beep when ~5 of the 20 bars remain (≤5s left to act)
  useEffect(() => {
    if (!myDeadline) return;
    let fired = false;
    const id = setInterval(() => {
      const rem = myDeadline - Date.now();
      if (rem <= 5000 && !fired) { fired = true; playSfx('alarm'); }
      if (rem <= 0 || fired) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [myDeadline]);

  const [winDone, setWinDone] = useState(false);
  useEffect(() => {
    if (!showWinners) { setWinDone(false); return; }
    const t = setTimeout(() => setWinDone(true), CHIP_FLIGHT_MS);
    return () => clearTimeout(t);
  }, [showWinners]);

  // The hand-end animation (runout → reveal → chip flight) is fully done once
  // winDone fires. Tell App to release the buffered next-hand state now, instead
  // of it guessing the duration with a fixed timer — this is what lets the all-in
  // runout play out in full before the next hand can land on top of it.
  useEffect(() => {
    if (isHandEnded && winDone) onHandEndAnimDone?.();
  }, [isHandEnded, winDone, onHandEndAnimDone]);

  // Full dealer_animating gate — all three flags must be clear before controls
  // appear or the bot is triggered. collecting is the third flag.
  const fullDealerAnimating = dealerAnimating || collecting;

  // Bot trigger — fires 1000ms after all animations clear on the bot's turn.
  // botTurnRequestedRef prevents double-firing if multiple flags clear in sequence.
  const botTurnRequestedRef = useRef(false);
  const isBotTurn = !!gameState?.isBotMatch && !!gameState?.botId
    && gameState?.currentPlayerId === gameState?.botId;
  useEffect(() => {
    if (!isBotTurn) botTurnRequestedRef.current = false;
  }, [isBotTurn]);
  useEffect(() => {
    if (fullDealerAnimating) return;
    if (!isBotTurn) return;
    if (['waiting', 'showdown'].includes(gameState?.phase)) return;
    if (botTurnRequestedRef.current) return;
    botTurnRequestedRef.current = true;
    const t = setTimeout(() => onBotActionRequest?.(), 1000);
    return () => clearTimeout(t);
  }, [fullDealerAnimating, isBotTurn, gameState?.phase]);

  const locked   = showWinners && !winDone;
  const winnerPot = gameState?.winners?.reduce((s, w) => s + (w.amount || 0), 0) || 0;
  const animPot  = locked ? winnerPot : null;
  // After showdown, server resets pot to 0 — fall back to winner sum so the
  // pot label stays visible until the chip-flight animation completes.
  const dispPot  = animPot !== null ? animPot : (collecting ? collect.pot : (totalPot || winnerPot));
  const chipsFor = p => {
    if (!locked) return p?.chips ?? 0;
    const win = gameState?.winners?.find(w => w.playerId === p?.id);
    return (p?.chips ?? 0) - (win?.amount ?? 0);
  };

  // While collecting, pills show the final street bets and ride collectProg
  const oppBetShown = collecting ? (collect.bets[opponent?.id] || 0) : (opponent?.roundBet || 0);
  const myBetShown  = collecting ? (collect.bets[me?.id] || 0)      : (me?.roundBet || 0);
  const collectOpacity = collectProg.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });
  const oppCollectStyle = {
    opacity: collectOpacity,
    transform: [{ translateY: collectProg.interpolate({ inputRange: [0, 1], outputRange: [0, POT_T - OPP_BET_T] }) }],
  };
  const myCollectStyle = {
    opacity: collectOpacity,
    transform: [
      { translateY: collectProg.interpolate({ inputRange: [0, 1], outputRange: [0, POT_T - MY_BET_T] }) },
      { translateX: collectProg.interpolate({ inputRange: [0, 1], outputRange: [0, -MY_BET_L / 2] }) },
    ],
  };

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
    const dir = winner.playerId === bottomId ? 1 : -1;
    setFlightAmount(winner.amount || 0);
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

  // Forfeit animation — chip countdown + flight from loser to winner
  const forfeitFlightY       = useRef(new Animated.Value(0)).current;
  const forfeitFlightOpacity = useRef(new Animated.Value(0)).current;
  const forfeitFlightScale   = useRef(new Animated.Value(1)).current;
  const [forfeitChipDisplay, setForfeitChipDisplay] = useState(null);
  useEffect(() => {
    if (!forfeitReveal) {
      setForfeitChipDisplay(null);
      forfeitFlightOpacity.setValue(0);
      return;
    }
    const { loserId, loserChips } = forfeitReveal;
    const loserIsBottom = loserId === bottomId;
    const travelY = loserIsBottom ? -(MY_POD_T - OPP_POD_T - POD_H) : (MY_POD_T - OPP_POD_T - POD_H);
    // Number countdown
    const startTime = Date.now();
    const duration = 1500;
    setForfeitChipDisplay(loserChips);
    const countId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out
      setForfeitChipDisplay(Math.round(loserChips * (1 - eased)));
      if (t >= 1) clearInterval(countId);
    }, 16);
    // Chip flight
    forfeitFlightY.setValue(0);
    forfeitFlightScale.setValue(1);
    forfeitFlightOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(forfeitFlightY, {
        toValue: travelY, duration: 1500,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94), useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(forfeitFlightScale, { toValue: 1.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(forfeitFlightScale, { toValue: 1,   duration: 500,  useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(forfeitFlightOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
    return () => clearInterval(countId);
  }, [forfeitReveal]);

  const currentBet   = gameState?.currentBet || 0;
  const myBet        = me?.roundBet || 0;
  const bigBlind     = gameState?.bigBlind || 20;
  const minRaise     = currentBet + (gameState?.minRaise || bigBlind);
  const maxRaise     = myBet + (me?.chips || 0);
  const effectiveMin = Math.min(minRaise, maxRaise);
  const [raiseAmount, setRaiseAmount] = useState(effectiveMin);
  useEffect(() => { setRaiseAmount(effectiveMin); }, [gameState?.currentPlayerId]);

  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const stageTop       = insets.top + TOP_BAR_H;
  const stageBotOffset = insets.bottom + ACTION_BAR_H;
  const contentH       = winH - stageTop - stageBotOffset;
  const scale          = Math.min(winW / DESIGN_W, contentH / DESIGN_H);

  return (
    <View style={s.root}>

      {/* Layer 0 — ambient (Group C): fills the whole viewport behind the stage.
          Anchored to the device, NOT the stage scale — on screens taller/wider
          than the stage it covers the leftover margins (cover crops, never
          stretches or letterboxes). */}
      <Image source={AMBIENT_BG} style={s.ambientBg} resizeMode="cover" pointerEvents="none" />

      {/* Group A — stage: scaled to content area only (below top bar, above action buttons) */}
      <View style={[s.stageOuter, { top: stageTop, bottom: stageBotOffset }]} pointerEvents="none">
        <View style={[s.stage, { transform: [{ scale }] }]}>

          {/* Layer 2: Table surface */}
          <Image source={INGAME_TABLE} style={s.tableImg} resizeMode="contain" />

          {/* Layer 3: Game elements — all absolutely positioned in canvas coords */}

          {/* Opponent pod */}
          <View style={s.oppPodSlot}>
            <PlayerPod player={opponent} isMe={false}
              turnDeadline={oppDeadline} turnDurationMs={gameState?.turnDurationMs} lastAction={gameState?.lastAction}
              win={bustWinId ? opponent?.id === bustWinId : (opponent ? activeWinners[opponent.id] : null)}
              displayChips={forfeitReveal?.loserId === opponent?.id && forfeitChipDisplay != null ? forfeitChipDisplay : (opponent ? chipsFor(opponent) : 0)}
              deckStyle={deckStyle} sittingOut={oppSittingOut} />
          </View>

          {/* Opponent hole cards — spec §5 opponentCards: (0.50, 0.305) */}
          <HoleCards player={opponent} isMe={false} deckStyle={deckStyle} />

          {/* Opponent bet */}
          <View style={[s.betSlot, { top: OPP_BET_T }]} pointerEvents="none">
            {(oppBetShown > 0 || opponent?.allIn) && (
              <Animated.View style={[s.betPill, collecting && oppCollectStyle]}>
                {opponent?.allIn && <Text style={s.allInTag}>ALL IN</Text>}
                {oppBetShown > 0 && <ChipStack amount={oppBetShown} size={33} />}
                {oppBetShown > 0 && <Text style={s.betAmt}>{oppBetShown.toLocaleString()}</Text>}
              </Animated.View>
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

          {/* Pot — text only ("POT = X"); assets are reserved for bets + the award flight */}
          <View style={[s.potSlot, { top: POT_T }]} pointerEvents="none">
            {dispPot > 0 && (
              <View style={s.potPill}>
                <Text style={s.potAmt}>POT = {dispPot.toLocaleString()}</Text>
              </View>
            )}
          </View>

          {/* Player bet — bottom-anchored, grows up toward the pot (clears hole cards) */}
          <View style={[s.betSlot, { top: MY_BET_BASE - MY_BET_SLOT_H, height: MY_BET_SLOT_H, left: MY_BET_L, justifyContent: 'flex-end' }]} pointerEvents="none">
            {(myBetShown > 0 || me?.allIn) && (
              <Animated.View style={[s.betPill, collecting && myCollectStyle]}>
                {me?.allIn && <Text style={s.allInTag}>ALL IN</Text>}
                {myBetShown > 0 && <ChipStack amount={myBetShown} size={33} />}
                {myBetShown > 0 && <Text style={s.betAmt}>{myBetShown.toLocaleString()}</Text>}
              </Animated.View>
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
              <ChipStack amount={flightAmount} size={45} />
            </Animated.View>
          )}

          {/* Forfeit chip flight — loser's chips slide to winner */}
          {forfeitReveal && (
            <Animated.View pointerEvents="none" style={[s.winFlight, {
              top: forfeitReveal.loserId === bottomId ? MY_POD_T + POD_H / 2 : OPP_POD_T + POD_H / 2,
              opacity: forfeitFlightOpacity,
              transform: [{ translateY: forfeitFlightY }, { scale: forfeitFlightScale }],
            }]}>
              <ChipStack amount={forfeitReveal.loserChips || 0} size={45} />
            </Animated.View>
          )}

          {/* Player hole cards — spec §5 playerCards: (0.43, 0.700) */}
          <HoleCards player={me} isMe={true} deckStyle={deckStyle} onDealComplete={() => setDealingHoleCards(false)} handNumber={gameState?.handNumber} />

          {/* Player pod */}
          <View style={s.myPodSlot}>
            <PlayerPod player={me} isMe={true} observing={observing}
              turnDeadline={myDeadline} turnDurationMs={gameState?.turnDurationMs} lastAction={gameState?.lastAction}
              win={bustWinId ? me?.id === bustWinId : (me ? activeWinners[me.id] : null)}
              displayChips={forfeitReveal?.loserId === me?.id && forfeitChipDisplay != null ? forfeitChipDisplay : (me ? chipsFor(me) : 0)}
              avatarOverride={observing ? undefined : playerInfo?.avatarId}
              deckStyle={deckStyle} sittingOut={meSittingOut} />
          </View>

        </View>
      </View>

      {/* Group B — chrome: docked to device edges, NOT scaled */}
      <SafeAreaView style={s.chrome} pointerEvents="box-none">

        {/* Top bar */}
        <View style={s.topBar} pointerEvents="box-none">
          <View style={s.topBarLeft}>
            <Pressable style={s.menuBtn} onPress={() => setReplayOpen(true)}>
              <Text style={s.menuBtnTxt}>↺</Text>
            </Pressable>
          </View>
          {gameState?.handNumber > 0 && (() => {
            const next = blindsForHand(gameState.handNumber + 1, blindFmt);
            const goingUp = gameState.phase === 'showdown' && next.bb > gameState.bigBlind;
            return (
              <View style={s.blindsPill} pointerEvents="none">
                {goingUp ? (
                  <Text style={s.blindsUpTxt}>Blinds going up · <Text style={s.blindsUpLevel}>{next.sb}/{next.bb}</Text></Text>
                ) : (
                  <Text style={s.blindsTxt}>Hand {gameState.handNumber} · Blinds {gameState.smallBlind}/{gameState.bigBlind}</Text>
                )}
              </View>
            );
          })()}
          <View style={s.topBarRight}>
            <SoundButton style={s.menuBtn} />
            <Pressable style={s.menuBtn} onPress={() => setMenuOpen(o => !o)}>
              <Text style={s.menuBtnTxt}>☰</Text>
            </Pressable>
          </View>
        </View>

        {/* Feedback button — sits just below the hamburger, top-right */}
        <View style={s.feedbackBtnRow} pointerEvents="box-none">
          <Pressable style={s.feedbackBtn} onPress={openFeedback}>
            <Text style={s.feedbackBtnTxt}>Feedback</Text>
          </Pressable>
        </View>

        {/* Spectator banner */}
        {observing && (
          <View style={s.observingBanner} pointerEvents="none">
            <Text style={s.observingTxt}>👁 Spectating</Text>
          </View>
        )}

        {/* Spacer pushes betting controls to the bottom */}
        <View style={{ flex: 1 }} pointerEvents="none" />

        {/* Bottom betting controls (Group B) — fixed ergonomic height */}
        <View style={s.bottomChrome} pointerEvents="box-none">
          {isMyTurn && !fullDealerAnimating && (
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
                  onPress={() => {
                    setMenuOpen(false);
                    if (gameState && me && !matchOver && !observing) { setLeaveWarning(true); } else { onLeave(); }
                  }}>
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

      {/* Leave table warning — shown when match is in progress */}
      {leaveWarning && (
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Leave Table?</Text>
            <Text style={s.modalSub}>Leaving the table will end the match, resulting in a loss. Are you sure?</Text>
            <View style={s.modalBtns}>
              <Pressable style={[s.modalBtn, s.modalBtnNo]} onPress={() => setLeaveWarning(false)}>
                <Text style={s.modalBtnTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={[s.modalBtn, s.modalBtnYes]} onPress={() => { setLeaveWarning(false); onLeave(); }}>
                <Text style={s.modalBtnTxt}>Leave</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Feedback modal */}
      {feedbackOpen && (
        <Pressable style={s.modalOverlay} onPress={() => { setTypeMenuOpen(false); }}>
          <Pressable style={[s.modal, { alignItems: 'stretch', maxWidth: 380 }]} onPress={() => {}}>
            <Text style={s.modalTitle}>Send Feedback</Text>

            {/* Type dropdown */}
            <View style={{ zIndex: 10 }}>
              <Pressable style={s.fbDropdown} onPress={() => setTypeMenuOpen(o => !o)}>
                <Text style={s.fbDropdownTxt}>
                  {FEEDBACK_OPTIONS.find(o => o.value === feedbackType)?.label}
                </Text>
                <Text style={s.fbDropdownCaret}>{typeMenuOpen ? '▲' : '▼'}</Text>
              </Pressable>
              {typeMenuOpen && (
                <View style={s.fbDropdownMenu}>
                  {FEEDBACK_OPTIONS.map(opt => (
                    <Pressable key={opt.value} style={s.fbDropdownItem}
                      onPress={() => { setFeedbackType(opt.value); setTypeMenuOpen(false); }}>
                      <Text style={[s.fbDropdownItemTxt,
                        opt.value === feedbackType && { color: colors.gold, fontWeight: '800' }]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Details text box */}
            <TextInput
              style={s.fbInput}
              placeholder="Describe it…"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={feedbackText}
              onChangeText={setFeedbackText}
              onFocus={() => setTypeMenuOpen(false)}
              multiline
              textAlignVertical="top"
              maxLength={5000}
            />

            {feedbackState === 'error' && (
              <Text style={s.fbError}>Couldn't send — try again.</Text>
            )}
            {feedbackState === 'done' && (
              <Text style={s.fbDone}>✓ Thanks! Sent.</Text>
            )}

            <View style={s.modalBtns}>
              <Pressable style={[s.modalBtn, s.modalBtnNo]} onPress={() => setFeedbackOpen(false)}>
                <Text style={s.modalBtnTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.modalBtn, s.modalBtnYes,
                  (!feedbackText.trim() || feedbackState === 'sending') && { opacity: 0.5 }]}
                disabled={!feedbackText.trim() || feedbackState === 'sending'}
                onPress={submitFeedback}>
                <Text style={s.modalBtnTxt}>
                  {feedbackState === 'sending' ? 'Sending…' : 'Submit'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      )}

      {/* Previous-hand replay dialog — half-screen bottom sheet */}
      <PreviousHandDialog
        visible={replayOpen}
        matchId={gameState?.matchId}
        currentHandNumber={gameState?.handNumber}
        deckStyle={deckStyle}
        onClose={() => setReplayOpen(false)} />

      {/* Match over modal — root-level overlay, not scaled */}
      {matchOver && (
        <Animated.View style={[s.modalOverlay, { opacity: moScrim }]}>
          <Animated.View style={[s.modal, { opacity: moCard, transform: [{ translateY: moSlide }] }]}>
            <Animated.Text style={[s.modalTitle, { opacity: moTitle }]}>
              {matchOver.forfeit
                ? (matchOver.winnerId === myId ? 'You Won By Forfeit' : 'You Lost By Forfeit')
                : (matchOver.winnerId === myId ? '🎉 You Won!' : `${matchOver.winnerName} Won!`)}
            </Animated.Text>

            {matchOver.forfeit && (
              <Animated.Text style={[s.modalSub, { opacity: moTitle }]}>
                {matchOver.loserName} timed out
              </Animated.Text>
            )}

            <Animated.View style={[s.winnerWrap, { opacity: moAvatar }]}>
              <Avatar size={104} avatarId={winnerAvatarId} />
            </Animated.View>

            {matchOver.eloChange != null && (
              <Animated.View style={[s.eloRow, { opacity: moElo }]}>
                <Text style={[s.eloChange, matchOver.eloChange >= 0 ? s.eloPos : s.eloNeg]}>
                  {matchOver.eloChange >= 0 ? '+' : ''}{matchOver.eloChange} ELO
                </Text>
                <Text style={s.eloNew}>→ {matchOver.newElo}</Text>
              </Animated.View>
            )}

            <Animated.View style={{ opacity: moBtns, alignSelf: 'stretch' }}>
              {matchOver.forfeit || matchOver.observer ? (
                <View style={s.modalBtns}>
                  <Pressable style={[s.modalBtn, s.modalBtnYes]} onPress={onLeave}>
                    <Text style={s.modalBtnTxt}>Back to Lobby</Text>
                  </Pressable>
                </View>
              ) : matchOver.myVote ? (
                <>
                  <Text style={s.modalWaiting}>
                    {matchOver.opponentWantsRematch ? 'Starting rematch…' : 'Waiting for opponent…'}
                  </Text>
                  <View style={s.modalBtns}>
                    <Pressable style={[s.modalBtn, s.modalBtnYes]} onPress={onLeave}>
                      <Text style={s.modalBtnTxt}>Back to Lobby</Text>
                    </Pressable>
                  </View>
                </>
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
            </Animated.View>
          </Animated.View>
        </Animated.View>
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Root — dark jungle base colour shows through wherever the bg image is
  // semi-transparent, lifting the crushed-black vignette edges.
  root: { flex: 1, width: '100%', backgroundColor: '#0a1a2e' },

  // Layer 0 — ambient bg, full opacity (no scrim — game elements carry their
  // own opaque pills/plates)
  ambientBg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },

  // Group A: stage container fills screen, centers the scaled canvas
  stageOuter: {
    position: 'absolute', left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  stage: { width: DESIGN_W, height: DESIGN_H, overflow: 'hidden' },

  // Table image — Layer 2, absolutely placed in canvas coords
  tableImg: {
    position: 'absolute',
    left: TABLE_L, top: TABLE_T,
    width: TABLE_W, height: TABLE_H,
  },

  // Pod slots — absolutely placed in canvas coords
  oppPodSlot: {
    position: 'absolute',
    left: OPP_POD_L, top: OPP_POD_T,
    width: POD_W, height: POD_H,
    zIndex: 5,
  },
  myPodSlot: {
    position: 'absolute',
    left: MY_POD_L, top: MY_POD_T,
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
  nameplateActive:     { borderColor: colors.gold, shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  nameplateFolded:     { backgroundColor: '#191920', borderColor: 'rgba(255,255,255,0.08)' },  // greyed but fully opaque
  nameplateSittingOut: { backgroundColor: '#1a1a2e', borderColor: 'rgba(255,255,255,0.12)' },
  podTextFolded:       { color: 'rgba(255,255,255,0.42)' },
  nameplateWaiting:    {},

  // Turn-timer gauge — a clip box that mirrors the nameplate's shape exactly
  // (same width + corner radii); the bar sits at its bottom so its ends follow
  // the plate's rounded corner. Segments run green→red, draining outer→avatar.
  timerClip: {
    position: 'absolute',
    top: NP_TOP + 8, height: NP_H,               // nameplate box shifted down by the bar height
    overflow: 'hidden',
    justifyContent: 'flex-end',                  // bar pinned to the bottom → sits just below the plate, touching it
    zIndex: 4, elevation: 5,
  },
  timerClipMe:  { left: NP_ME_LEFT + TIMER_OUTER_INSET, right: NP_ME_RIGHT,
                  borderTopLeftRadius: NP_RADIUS, borderBottomLeftRadius: NP_RADIUS,
                  borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  timerClipOpp: { left: NP_OPP_LEFT, right: NP_OPP_RIGHT + TIMER_OUTER_INSET,
                  borderTopRightRadius: NP_RADIUS, borderBottomRightRadius: NP_RADIUS,
                  borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  timerRow:    { flexDirection: 'row', alignItems: 'stretch', height: 8, gap: 1.5,
                 paddingHorizontal: 2, backgroundColor: 'transparent' },
  timerSeg:    { flex: 1, borderRadius: 1 },

  nameRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 6, flexWrap: 'nowrap' },
  chipsRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 6 },
  podName:   { color: colors.white, fontSize: 17, fontWeight: '800', flexShrink: 1, minWidth: 0 },
  podChips:  { color: '#facc15', fontSize: 18, fontWeight: '900' },
  podChipsWin:    { color: '#4ade80' },
  podChipsAction: { color: colors.orange, fontSize: 14, fontWeight: '800' },
  badge:   { fontSize: 10, color: '#fff', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, fontWeight: '700' },
  badgeSB:     { backgroundColor: '#2563eb' },
  badgeBB:     { backgroundColor: '#7c3aed' },
  badgeSitOut: { backgroundColor: '#6b7280' },

  // Hole cards — absolutely placed in canvas coords (spec §5)
  holeCardsPair: { position: 'absolute', flexDirection: 'row', gap: 6, zIndex: 3 },
  myHoleCards:  { left: MY_CARDS_L,  top: MY_CARDS_T  },
  oppHoleCards: { left: OPP_CARDS_L, top: OPP_CARDS_T },
  cardSlotLeft:  { transform: [{ rotate: '-8deg' }] },
  cardSlotRight: { transform: [{ rotate:  '8deg' }] },

  // Felt slots — full-width containers that centre their content
  communitySlot: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  communityRow:  { flexDirection: 'row', gap: 4, alignItems: 'center' },
  ccPlaceholder: { width: 54, height: 64 },
  potSlot: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  potPill: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 11, paddingHorizontal: 16, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(240,192,64,0.45)' },
  potAmt:  { color: '#f5d061', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  betSlot: { position: 'absolute', left: 0, right: 0, alignItems: 'center', height: 40, justifyContent: 'flex-start', zIndex: 20 },
  betPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  betAmt:  { color: '#f5d061', fontSize: 15, fontWeight: '900', letterSpacing: 0.3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 2, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(240,192,64,0.4)' },
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
  topBarLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  version:    { color: 'rgba(255,255,255,0.2)', fontSize: 11 },
  blindsPill: {
    position: 'absolute', left: 0, right: 0, top: 0, height: TOP_BAR_H,
    alignItems: 'center', justifyContent: 'center',
  },
  blindsTxt:  { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '600' },
  blindsUpTxt:   { color: colors.gold, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
  blindsUpLevel: { color: colors.goldLight, fontSize: 13, fontWeight: '700', letterSpacing: 0.6 },
  menuBtn:    { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  menuBtnTxt: { color: colors.white, fontSize: 16 },
  observingBanner: { alignSelf: 'center', marginTop: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 12 },
  observingTxt:    { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700' },
  disconnectBanner: { marginHorizontal: 12, marginTop: 4, backgroundColor: 'rgba(251,146,60,0.18)', borderWidth: 1, borderColor: 'rgba(251,146,60,0.5)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  disconnectTxt:    { color: '#fb923c', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  bottomChrome: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 6, alignItems: 'center' },

  // Disconnect banner

  // Menu scrim + panel
  menuScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50 },
  menuPanelRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: TOP_BAR_H + 4 },
  menuPanel: { width: 200, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, overflow: 'hidden', elevation: 8 },
  menuItem:    { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  menuItemRed: { borderBottomWidth: 0 },
  menuItemTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },

  // Match over modal
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal:       { backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 24, padding: 22, alignItems: 'center', gap: 14, width: '90%', maxWidth: 380 },
  modalTitle:  { color: colors.white, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  winnerWrap:  { alignItems: 'center', justifyContent: 'center', marginTop: 2 },
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

  // Feedback button (below hamburger)
  feedbackBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, marginTop: -3 },
  feedbackBtn:    { backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  feedbackBtnTxt: { color: colors.white, fontSize: 12, fontWeight: '600' },

  // Feedback modal
  fbDropdown:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  fbDropdownTxt:  { color: colors.white, fontSize: 15, fontWeight: '600' },
  fbDropdownCaret:{ color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  fbDropdownMenu: { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, backgroundColor: '#1b1b1b', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 12, overflow: 'hidden', elevation: 8 },
  fbDropdownItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  fbDropdownItemTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 15 },
  fbInput:        { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 12, color: colors.white, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12, minHeight: 110, maxHeight: 220 },
  fbError:        { color: '#f87171', fontSize: 13, textAlign: 'center' },
  fbDone:         { color: '#4ade80', fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
