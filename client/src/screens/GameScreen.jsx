import React, { useContext, useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { GameContext } from '../context/GameContext';
import Card from '../components/Card';
import Avatar from '../components/Avatar';
import { ChipStack } from '../components/PokerChip';
import BettingControls from '../components/BettingControls';
import { colors } from '../theme';
import { SERVER_URL, VERSION } from '../config';

const TURN_DURATION_MS = 20000;
const RING_R = 26;
const RING_CIRC = 2 * Math.PI * RING_R;

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
  if (!deadline) return null;
  const ringColor = timeLeft <= 5 ? '#f87171' : timeLeft <= 10 ? '#fb923c' : colors.gold;
  return (
    <Svg width={56} height={56} viewBox="0 0 56 56" style={s.ring}>
      <Circle cx="28" cy="28" r={RING_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={3} />
      <Circle cx="28" cy="28" r={RING_R} fill="none" stroke={ringColor} strokeWidth={3}
        strokeDasharray={RING_CIRC} strokeDashoffset={dashOffset}
        strokeLinecap="round" transform="rotate(-90, 28, 28)" />
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
    const map = { fold: 'Fold', check: 'Check', call: `Call $${a.amount?.toLocaleString() || ''}`,
      bet: `Bet $${a.amount?.toLocaleString() || ''}`, raise: `Raise $${a.amount?.toLocaleString() || ''}`, 'all-in': 'All In' };
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
  if (!player) return null;

  const isActive = !!player.isCurrentPlayer;
  const hasCards = player.holeCards?.length > 0 && !player.folded;
  const chipLabel = win ? '🏆 Winner!' : (actionLbl || `$${(displayChips ?? player.chips).toLocaleString()}`);

  const cards = (
    <View style={[s.podCards, !hasCards && s.hidden]}>
      {[0, 1].map(i => (
        <View key={i} style={[s.cardWrap, i === 0 ? s.cardLeft : s.cardRight]}>
          <Card card={player.holeCards?.[i]} size={isMe ? 'xl' : 'lg'} deckStyle={deckStyle}
            faceDown={!player.holeCards?.[i] || !!player.holeCards[i]?.hidden} />
        </View>
      ))}
    </View>
  );

  const nameplate = (
    <View style={[s.nameplate, isActive && s.nameplateActive, player.folded && s.nameplateFolded]}>
      <View style={s.avatarWrap}>
        <Avatar size={52} avatarId={player.avatarId} />
        <TimerRing deadline={turnDeadline} />
      </View>
      <View style={s.podInfo}>
        <View style={s.nameRow}>
          <Text style={s.podName} numberOfLines={1}>{player.name}</Text>
          {player.isDealer     && <Text style={s.badge}>D</Text>}
          {player.isSmallBlind && <Text style={[s.badge, s.badgeSB]}>SB</Text>}
          {player.isBigBlind   && <Text style={[s.badge, s.badgeBB]}>BB</Text>}
          {player.allIn        && <Text style={[s.badge, s.badgeAI]}>ALL IN</Text>}
        </View>
        <Text style={[s.podChips, win && s.podChipsWin, !!actionLbl && s.podChipsAction]}
          numberOfLines={1}>{chipLabel}</Text>
      </View>
      {timeLeft !== null && timeLeft <= 10 && (
        <Text style={[s.countdown, timeLeft <= 5 && s.countdownUrgent]}>{timeLeft}s</Text>
      )}
    </View>
  );

  return (
    <View style={s.pod}>
      {isMe  ? <>{cards}{nameplate}</> : <>{nameplate}{cards}</>}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function GameScreen() {
  const { gameState, myId, onAction, onLeave, onRematch, onLogout, emit, matchOver, navigationRef, deckStyle, opponentDisconnected } = useContext(GameContext);

  const [menuOpen, setMenuOpen] = useState(false);

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

  return (
    <SafeAreaView style={s.safe}>
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

        {/* Opponent pod */}
        <View style={s.oppSection}>
          {opponent ? (
            <PlayerPod player={opponent} isMe={false}
              turnDeadline={oppDeadline} lastAction={gameState?.lastAction}
              win={activeWinners[opponent.id]} displayChips={chipsFor(opponent)}
              deckStyle={deckStyle} />
          ) : (
            <View style={s.waitingPod}>
              <Text style={s.waitingTxt}>Waiting for opponent…</Text>
            </View>
          )}
        </View>

        {/* Felt table */}
        <View style={s.felt}>

          {/* Opponent bet */}
          {(opponent?.roundBet > 0 || opponent?.allIn) && (
            <View style={s.betTop}>
              {opponent.roundBet > 0 && <ChipStack amount={opponent.roundBet} size={24} />}
              {opponent.roundBet > 0 && <Text style={s.betAmt}>${opponent.roundBet.toLocaleString()}</Text>}
              {opponent.allIn && <Text style={s.allInTag}>ALL IN</Text>}
            </View>
          )}

          {/* Center: community cards + pot + narration */}
          <View style={s.center}>
            <View style={s.communityRow}>
              {[0,1,2,3,4].map(i => {
                const card = i < revealedCC ? gameState?.communityCards?.[i] : null;
                if (!card) return <View key={i} style={s.ccPlaceholder} />;
                return <Card key={i} card={card} size="md" deckStyle={deckStyle} faceDown={false} />;
              })}
            </View>
            {dispPot > 0 && (
              <View style={s.potRow}>
                <ChipStack amount={dispPot} size={24} />
                <Text style={s.potAmt}>${dispPot.toLocaleString()}</Text>
              </View>
            )}
            {(centerAction || handName) && (
              <Text style={s.narration}>{handName || centerAction}</Text>
            )}
          </View>

          {/* My bet */}
          {(me?.roundBet > 0 || me?.allIn) && (
            <View style={s.betBottom}>
              {me.roundBet > 0 && <ChipStack amount={me.roundBet} size={24} />}
              {me.roundBet > 0 && <Text style={s.betAmt}>${me.roundBet.toLocaleString()}</Text>}
              {me.allIn && <Text style={s.allInTag}>ALL IN</Text>}
            </View>
          )}

          {/* Dealer buttons */}
          {opponent?.isDealer && <View style={[s.dealerBtn, s.dealerTop]}><Text style={s.dealerTxt}>D</Text></View>}
          {me?.isDealer       && <View style={[s.dealerBtn, s.dealerBottom]}><Text style={s.dealerTxt}>D</Text></View>}
        </View>

        {/* My pod */}
        <View style={s.mySection}>
          {me && (
            <PlayerPod player={me} isMe={true}
              turnDeadline={myDeadline} lastAction={gameState?.lastAction}
              win={activeWinners[myId]} displayChips={chipsFor(me)}
              deckStyle={deckStyle} />
          )}
        </View>

        {/* Betting controls */}
        <View style={s.controls}>
          <BettingControls gameState={gameState} myId={myId}
            onAction={onAction} raiseAmount={raiseAmount}
            onRaiseChange={v => setRaiseAmount(Math.round(v))} />
        </View>

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
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a1628' },
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
  mySection:  { paddingHorizontal: 12, paddingTop: 0, paddingBottom: 4 },

  // Pod
  pod: { gap: 0 },
  nameplate: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
  },
  nameplateActive: { borderColor: colors.gold, shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 10, elevation: 4 },
  nameplateFolded: { opacity: 0.4 },
  avatarWrap: { width: 56, height: 56, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', top: -2, left: -2 },
  podInfo: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  podName: { color: colors.white, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  podChips: { color: colors.goldLight, fontSize: 15, fontWeight: '700' },
  podChipsWin: { color: '#4ade80' },
  podChipsAction: { color: colors.orange },
  badge: { fontSize: 10, color: '#fff', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, fontWeight: '700' },
  badgeSB: { backgroundColor: '#2563eb' },
  badgeBB: { backgroundColor: '#7c3aed' },
  badgeAI: { backgroundColor: '#dc2626' },
  countdown: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '800' },
  countdownUrgent: { color: '#f87171' },

  // Cards coming out of pod
  podCards: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 4, gap: 6 },
  hidden: { opacity: 0 },
  cardWrap: {},
  cardLeft:  {},
  cardRight: {},

  // Waiting
  waitingPod: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 18, alignItems: 'center' },
  waitingTxt: { color: colors.gray, fontSize: 14, fontStyle: 'italic' },

  // Felt
  felt: {
    flex: 1, marginHorizontal: 8, borderRadius: 120,
    backgroundColor: '#0d2148',
    borderWidth: 14, borderColor: '#2a1408',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
    position: 'relative',
  },
  center: { alignItems: 'center', gap: 8 },
  communityRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  ccPlaceholder: { width: 52, height: 56 },
  potRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  potAmt: { color: colors.goldLight, fontSize: 14, fontWeight: '800' },
  narration: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontStyle: 'italic', textAlign: 'center' },

  betTop: { position: 'absolute', top: 14, flexDirection: 'row', alignItems: 'center', gap: 5 },
  betBottom: { position: 'absolute', bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 5 },
  betAmt: { color: colors.goldLight, fontSize: 12, fontWeight: '700' },
  allInTag: { color: '#f87171', fontSize: 11, fontWeight: '800' },

  dealerBtn: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: '#f5f5dc', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#999' },
  dealerTop:    { top: 10, right: 20 },
  dealerBottom: { bottom: 10, right: 20 },
  dealerTxt: { color: '#333', fontSize: 11, fontWeight: '800' },

  // Controls
  controls: { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },

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
  modalWaiting: { color: colors.gray, fontSize: 14, fontStyle: 'italic' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalBtnNo:  { backgroundColor: 'rgba(255,255,255,0.1)' },
  modalBtnYes: { backgroundColor: colors.gold },
  modalBtnTxt: { color: colors.white, fontSize: 15, fontWeight: '800' },
});
