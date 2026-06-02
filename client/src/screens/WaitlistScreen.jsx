import React, { useContext } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import Card from '../components/Card';
import { colors } from '../theme';

export default function WaitlistScreen() {
  const { gameState, onLeave } = useContext(GameContext);
  const players = gameState?.players || [];
  const phase = gameState?.phase;
  const position = gameState?.waitlistPosition || '?';
  const phaseLabel = phase === 'waiting' ? 'Waiting for players'
    : phase?.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.logo}>♠ Poker ♣</Text>
          <Pressable style={s.leaveBtn} onPress={onLeave}><Text style={s.leaveTxt}>Leave</Text></Pressable>
        </View>
        <View style={s.badge}>
          <Text style={s.num}>#{position}</Text>
          <Text style={s.badgeLabel}>on the waitlist</Text>
          <Text style={s.badgeSub}>You'll be seated when a spot opens up</Text>
        </View>
        <View style={s.info}>
          <Text style={s.infoLabel}>Current Table</Text>
          <Text style={s.infoPhase}>{phaseLabel}</Text>
          {gameState?.communityCards?.length > 0 && (
            <View style={s.cc}>
              {gameState.communityCards.map((card, i) => <Card key={i} card={card} size="sm" />)}
            </View>
          )}
          <ScrollView style={s.playerList}>
            {players.map(p => (
              <View key={p.id} style={[s.playerRow, p.folded && s.playerFolded]}>
                <Text style={s.pName}>{p.name}</Text>
                <Text style={s.pChips}>${p.chips.toLocaleString()}</Text>
                {p.isCurrentPlayer && <Text style={s.turnDot}>●</Text>}
              </View>
            ))}
          </ScrollView>
          {gameState?.pot > 0 && <Text style={s.pot}>Pot: ${gameState.pot.toLocaleString()}</Text>}
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 20, gap: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { fontSize: 22, fontWeight: '900', color: colors.goldLight },
  leaveBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  leaveTxt: { color: colors.white, fontSize: 13 },
  badge: { alignItems: 'center', backgroundColor: 'rgba(212,160,23,0.1)', borderWidth: 1, borderColor: 'rgba(212,160,23,0.3)', borderRadius: 16, padding: 24, gap: 4 },
  num: { fontSize: 48, fontWeight: '900', color: colors.goldLight },
  badgeLabel: { fontSize: 16, fontWeight: '600', color: colors.white },
  badgeSub: { fontSize: 13, color: colors.gray, textAlign: 'center' },
  info: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16, gap: 10, flex: 1 },
  infoLabel: { color: colors.gray, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  infoPhase: { color: colors.white, fontSize: 15, fontWeight: '600' },
  cc: { flexDirection: 'row', gap: 6 },
  playerList: { flex: 1 },
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: 8 },
  playerFolded: { opacity: 0.5 },
  pName: { flex: 1, color: colors.white, fontSize: 14 },
  pChips: { color: colors.goldLight, fontSize: 13, fontWeight: '600' },
  turnDot: { color: colors.gold, fontSize: 10 },
  pot: { color: colors.gray, fontSize: 13, textAlign: 'center' },
});
