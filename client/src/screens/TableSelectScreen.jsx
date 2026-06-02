import React, { useContext, useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import { SERVER_URL } from '../config';
import { colors } from '../theme';

export default function TableSelectScreen() {
  const { onJoinTable, onLeave, error, lobbyRooms } = useContext(GameContext);
  const [seedRooms, setSeedRooms] = useState(null);

  // One-time HTTP fetch to seed the list; after that socket lobby-state events take over
  useEffect(() => {
    fetch(`${SERVER_URL}/api/rooms`)
      .then(r => r.json())
      .then(setSeedRooms)
      .catch(() => setSeedRooms([]));
  }, []);

  const rooms = lobbyRooms ?? seedRooms;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        <View style={styles.header}>
          <Text style={styles.logo}>♠ Poker Monkey ♣</Text>
          <Pressable style={styles.leaveBtn} onPress={onLeave}>
            <Text style={styles.leaveBtnText}>Sign Out</Text>
          </Pressable>
        </View>

        <Text style={styles.subtitle}>Choose a table</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        {!rooms ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.gold} size="large" />
            <Text style={styles.loadingText}>Connecting…</Text>
          </View>
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {rooms.map(room => (
              <Pressable
                key={room.id}
                style={styles.tableCard}
                onPress={() => onJoinTable(room.id)}
              >
                <View style={styles.tableLeft}>
                  <Text style={styles.tableEmoji}>{room.emoji || '🎲'}</Text>
                  <View>
                    <Text style={styles.tableName}>{room.name}</Text>
                    <Text style={styles.tableVariant}>No Limit Hold'em</Text>
                  </View>
                </View>

                <View style={styles.tableRight}>
                  <Text style={styles.playerCount}>{room.playerCount ?? 0}</Text>
                  <Text style={styles.playerLabel}>players</Text>
                </View>

                <View style={styles.tableFooter}>
                  <View style={[
                    styles.phaseDot,
                    room.phase === 'waiting' ? styles.dotWaiting : styles.dotActive,
                  ]} />
                  <Text style={styles.phaseLabel}>
                    {room.phase === 'waiting' ? 'Waiting for players' : 'Hand in progress'}
                  </Text>
                  <Text style={styles.joinLabel}>Join →</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 20, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { fontSize: 20, fontWeight: '900', color: colors.goldLight },
  leaveBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  leaveBtnText: { color: colors.white, fontSize: 13 },
  subtitle: { color: colors.gray, fontSize: 13, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700' },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.gray, fontSize: 14 },
  list: { flex: 1 },
  listContent: { gap: 12 },
  tableCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  tableLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tableEmoji: { fontSize: 32 },
  tableName: { color: colors.white, fontSize: 17, fontWeight: '800' },
  tableVariant: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  tableRight: { alignItems: 'flex-end' },
  playerCount: { color: colors.goldLight, fontSize: 24, fontWeight: '700' },
  playerLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  tableFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phaseDot: { width: 8, height: 8, borderRadius: 4 },
  dotWaiting: { backgroundColor: '#facc15' },
  dotActive: { backgroundColor: '#4ade80' },
  phaseLabel: { flex: 1, color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  joinLabel: { color: colors.gold, fontSize: 13, fontWeight: '700' },
});
