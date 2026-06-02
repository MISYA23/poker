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

  const phaseLabel = phase === 'waiting'
    ? 'Waiting for players'
    : phase?.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        <View style={styles.header}>
          <Text style={styles.logo}>♠ Poker ♣</Text>
          <Pressable style={styles.leaveBtn} onPress={onLeave}>
            <Text style={styles.leaveBtnText}>Leave</Text>
          </Pressable>
        </View>

        <View style={styles.badge}>
          <Text style={styles.badgeNumber}>#{position}</Text>
          <Text style={styles.badgeLabel}>on the waitlist</Text>
          <Text style={styles.badgeSub}>You'll be seated when a spot opens up</Text>
        </View>

        <View style={styles.tableInfo}>
          <Text style={styles.tableLabel}>Current Table</Text>
          <Text style={styles.tablePhase}>{phaseLabel}</Text>

          {gameState?.communityCards?.length > 0 && (
            <View style={styles.communityCards}>
              {gameState.communityCards.map((card, i) => (
                <Card key={i} card={card} size="sm" />
              ))}
            </View>
          )}

          <ScrollView style={styles.playersList}>
            {players.map(p => (
              <View key={p.id} style={[styles.playerRow, p.folded && styles.playerFolded]}>
                <Text style={styles.playerName}>{p.name}</Text>
                <Text style={styles.playerChips}>${p.chips.toLocaleString()}</Text>
                {p.isCurrentPlayer && (
                  <View style={styles.turnDot}>
                    <Text style={styles.turnDotText}>●</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          {gameState?.pot > 0 && (
            <Text style={styles.pot}>Pot: ${gameState.pot.toLocaleString()}</Text>
          )}
        </View>

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
    padding: 20,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.goldLight,
  },
  leaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  leaveBtnText: {
    color: colors.white,
    fontSize: 13,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: 'rgba(212,160,23,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.3)',
    borderRadius: 16,
    padding: 24,
    gap: 4,
  },
  badgeNumber: {
    fontSize: 48,
    fontWeight: '900',
    color: colors.goldLight,
  },
  badgeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  badgeSub: {
    fontSize: 13,
    color: colors.gray,
    textAlign: 'center',
  },
  tableInfo: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    flex: 1,
  },
  tableLabel: {
    color: colors.gray,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tablePhase: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  communityCards: {
    flexDirection: 'row',
    gap: 6,
  },
  playersList: {
    flex: 1,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    gap: 8,
  },
  playerFolded: {
    opacity: 0.5,
  },
  playerName: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
  },
  playerChips: {
    color: colors.goldLight,
    fontSize: 13,
    fontWeight: '600',
  },
  turnDot: {
    marginLeft: 4,
  },
  turnDotText: {
    color: colors.gold,
    fontSize: 10,
  },
  pot: {
    color: colors.gray,
    fontSize: 13,
    textAlign: 'center',
  },
});
