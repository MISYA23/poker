import React, { useContext, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../../App';
import Card from '../components/Card';
import Avatar from '../components/Avatar';
import TimerRing from '../components/TimerRing';
import PlayerSeat, { useActionFlash } from '../components/PlayerSeat';
import BettingControls from '../components/BettingControls';
import { ChipStack } from '../components/PokerChip';
import { colors } from '../theme';
import { SERVER_URL } from '../config';

const TURN_DURATION_MS = 20000;

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

export default function GameScreen() {
  const { gameState, myId, onAction, onLeave } = useContext(GameContext);

  const me = gameState?.players?.find(p => p.id === myId);
  const others = gameState?.players?.filter(p => p.id !== myId) || [];
  const waitlistCount = gameState?.waitlistCount || 0;

  const totalPot = (gameState?.pot || 0) +
    (gameState?.players || []).reduce((s, p) => s + (p.roundBet || 0), 0);

  const winnerMap = {};
  if (gameState?.phase === 'showdown' && gameState?.winners) {
    for (const w of gameState.winners) winnerMap[w.playerId] = w;
  }
  const myWin = winnerMap[myId];

  const isMyTurn = gameState?.currentPlayerId === myId &&
    !['waiting', 'showdown'].includes(gameState?.phase);

  const myTurnDeadline = isMyTurn ? gameState?.turnDeadline : null;
  const myTimeLeft = useCountdown(myTurnDeadline);
  const myShowCountdown = myTimeLeft !== null && myTimeLeft <= 10;
  const myActionLabel = useActionFlash(me, gameState?.lastAction);

  const currentBet = gameState?.currentBet || 0;
  const myBet = me?.roundBet || 0;
  const callAmount = Math.min(currentBet - myBet, me?.chips || 0);
  const bigBlind = gameState?.bigBlind || 20;
  const minRaise = currentBet + (gameState?.minRaise || bigBlind);
  const maxRaise = myBet + (me?.chips || 0);
  const effectiveMin = Math.min(minRaise, maxRaise);

  const [raiseAmount, setRaiseAmount] = useState(effectiveMin);
  useEffect(() => { setRaiseAmount(effectiveMin); }, [gameState?.currentPlayerId]);

  const showdownHandDisplay = (() => {
    if (gameState?.phase !== 'showdown' || !gameState?.winners?.length) return null;
    const w = gameState.winners[0];
    if (!w) return null;
    const winnerName = gameState.players?.find(p => p.id === w.playerId)?.name;
    if (w.handName && w.handName !== 'Winner') return w.handName;
    return winnerName ? `${winnerName} wins` : 'Winner';
  })();

  const handleReset = () => {
    fetch(`${SERVER_URL}/admin/reset`, { method: 'POST' }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* Top bar */}
        <View style={styles.topBar}>
          {waitlistCount > 0 && (
            <View style={styles.waitlistPill}>
              <Text style={styles.waitlistPillText}>{waitlistCount} waiting</Text>
            </View>
          )}
          <View style={styles.topBarRight}>
            <Pressable style={styles.ghostBtn} onPress={onLeave}>
              <Text style={styles.ghostBtnText}>Leave</Text>
            </Pressable>
            <Pressable style={[styles.ghostBtn, styles.ghostBtnRed]} onPress={handleReset}>
              <Text style={styles.ghostBtnText}>Reset</Text>
            </Pressable>
          </View>
        </View>

        {/* Opponent */}
        <View style={styles.aboveTable}>
          {others.length > 0 ? (
            others.map(player => (
              <PlayerSeat
                key={player.id}
                player={player}
                isMe={false}
                win={winnerMap[player.id]}
                lastAction={gameState?.lastAction}
                turnDeadline={player.isCurrentPlayer ? gameState?.turnDeadline : null}
              />
            ))
          ) : (
            <Text style={styles.waitingMsg}>Waiting for opponent…</Text>
          )}
        </View>

        {/* Felt oval */}
        <View style={styles.tableOval}>
          <View style={styles.tableFelt}>

            {/* Dealer buttons */}
            {others[0]?.isDealer && (
              <View style={[styles.dealerBtn, styles.dealerBtnTop]}>
                <Text style={styles.dealerBtnText}>D</Text>
              </View>
            )}
            {me?.isDealer && (
              <View style={[styles.dealerBtn, styles.dealerBtnBottom]}>
                <Text style={styles.dealerBtnText}>D</Text>
              </View>
            )}

            {/* Opponent bet */}
            {others[0]?.roundBet > 0 && (
              <View style={styles.feltBetTop}>
                <ChipStack amount={others[0].roundBet} size={22} />
                <Text style={styles.feltBetAmount}>${others[0].roundBet.toLocaleString()}</Text>
              </View>
            )}

            {/* Community cards + pot */}
            <View style={styles.center}>
              <View style={styles.communityCards}>
                {[0, 1, 2, 3, 4].map(i => (
                  <Card
                    key={i}
                    card={gameState?.communityCards?.[i]}
                    size="md"
                    faceDown={!gameState?.communityCards?.[i]}
                  />
                ))}
              </View>
              {totalPot > 0 && (
                <View style={styles.potInfo}>
                  <ChipStack amount={totalPot} size={22} />
                  <Text style={styles.potAmount}>${totalPot.toLocaleString()}</Text>
                </View>
              )}
              {showdownHandDisplay ? (
                <Text style={styles.handName}>{showdownHandDisplay}</Text>
              ) : null}
            </View>

            {/* My bet */}
            {me?.roundBet > 0 && !myWin && (
              <View style={styles.feltBetBottom}>
                <ChipStack amount={me.roundBet} size={22} />
                <Text style={styles.feltBetAmount}>${me.roundBet.toLocaleString()}</Text>
              </View>
            )}

          </View>
        </View>

        {/* My seat */}
        {me && (
          <View style={[
            styles.mySeat,
            isMyTurn && styles.mySeatActive,
            me.folded && styles.mySeatFolded,
          ]}>
            {/* My hole cards */}
            <View style={[styles.myCards, !me.holeCards?.length && styles.hidden]}>
              {[0, 1].map(i => (
                <View key={i} style={[styles.myCardWrap, i === 0 ? styles.myCardLeft : styles.myCardRight]}>
                  <Card
                    card={me.holeCards?.[i]}
                    size="lg"
                    faceDown={!me.holeCards?.[i] || me.folded}
                  />
                </View>
              ))}
            </View>

            {/* My nameplate */}
            <View style={styles.nameplate}>
              <View style={styles.npText}>
                <View style={styles.nameRow}>
                  <Text style={styles.npName} numberOfLines={1}>{me.name}</Text>
                  {me.isSmallBlind && <View style={[styles.badge, styles.badgeSB]}><Text style={styles.badgeText}>SB</Text></View>}
                  {me.isBigBlind && <View style={[styles.badge, styles.badgeBB]}><Text style={styles.badgeText}>BB</Text></View>}
                  {me.allIn && <View style={[styles.badge, styles.badgeAllin]}><Text style={styles.badgeText}>ALL IN</Text></View>}
                </View>
                <Text style={[styles.npChips, myWin && styles.npChipsWinner, !!myActionLabel && styles.npChipsAction]}>
                  {myWin ? 'Winner' : (myActionLabel || `$${me.chips.toLocaleString()}`)}
                </Text>
                {myShowCountdown && (
                  <Text style={styles.countdown}>{myTimeLeft}s</Text>
                )}
              </View>
              <View style={styles.avatarWrap}>
                <Avatar size={52} avatarId={me.avatarId} />
                <TimerRing turnDeadline={myTurnDeadline} />
              </View>
            </View>

            {/* Betting controls */}
            <BettingControls
              gameState={gameState}
              myId={myId}
              onAction={onAction}
              raiseAmount={raiseAmount}
              onRaiseChange={v => setRaiseAmount(Math.round(v))}
            />
          </View>
        )}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 6,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingHorizontal: 4,
  },
  waitlistPill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  waitlistPillText: {
    color: colors.gray,
    fontSize: 12,
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 'auto',
  },
  ghostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  ghostBtnRed: {
    borderColor: 'rgba(255,100,100,0.35)',
  },
  ghostBtnText: {
    color: colors.white,
    fontSize: 12,
  },
  aboveTable: {
    alignItems: 'center',
    minHeight: 90,
    justifyContent: 'center',
  },
  waitingMsg: {
    color: colors.gray,
    fontSize: 14,
    fontStyle: 'italic',
  },
  tableOval: {
    marginHorizontal: 4,
    borderRadius: 500,
    overflow: 'hidden',
    backgroundColor: colors.greenDark,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    aspectRatio: 2.2,
  },
  tableFelt: {
    flex: 1,
    backgroundColor: colors.greenFelt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealerBtn: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#f5f5dc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#999',
    zIndex: 5,
  },
  dealerBtnTop: {
    top: 8,
    right: 40,
  },
  dealerBtnBottom: {
    bottom: 8,
    right: 40,
  },
  dealerBtnText: {
    color: '#333',
    fontSize: 11,
    fontWeight: '800',
  },
  feltBetTop: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  feltBetBottom: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  feltBetAmount: {
    color: colors.goldLight,
    fontSize: 12,
    fontWeight: '700',
  },
  center: {
    alignItems: 'center',
    gap: 6,
  },
  communityCards: {
    flexDirection: 'row',
    gap: 4,
  },
  potInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  potAmount: {
    color: colors.goldLight,
    fontSize: 13,
    fontWeight: '700',
  },
  handName: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  mySeat: {
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  mySeatActive: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(212,160,23,0.05)',
  },
  mySeatFolded: {
    opacity: 0.45,
  },
  myCards: {
    flexDirection: 'row',
    justifyContent: 'center',
    height: 60,
  },
  hidden: {
    opacity: 0,
  },
  myCardWrap: {
    position: 'relative',
  },
  myCardLeft: {
    transform: [{ rotate: '-4deg' }, { translateX: 4 }],
    zIndex: 1,
  },
  myCardRight: {
    transform: [{ rotate: '4deg' }, { translateX: -4 }],
  },
  nameplate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  npText: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  npName: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  npChips: {
    color: colors.goldLight,
    fontSize: 13,
    fontWeight: '600',
  },
  npChipsAction: { color: colors.orange },
  npChipsWinner: { color: '#4ade80' },
  countdown: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '800',
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  badgeSB: { backgroundColor: colors.blue },
  badgeBB: { backgroundColor: colors.orange },
  badgeAllin: { backgroundColor: colors.red },
  avatarWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
});
