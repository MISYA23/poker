import React, { useContext, useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import { SERVER_URL } from '../config';
import { colors } from '../theme';

export default function TableSelectScreen() {
  const { onJoinTable, onLeave, error, lobbyRooms } = useContext(GameContext);
  const [seedRooms, setSeedRooms] = useState(null);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/rooms`)
      .then(r => r.json())
      .then(setSeedRooms)
      .catch(() => setSeedRooms([]));
  }, []);

  const rooms = lobbyRooms ?? seedRooms;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.logo}>♠ Poker Monkey ♣</Text>
          <Pressable style={s.leaveBtn} onPress={onLeave}>
            <Text style={s.leaveTxt}>Sign Out</Text>
          </Pressable>
        </View>

        <Text style={s.subtitle}>Choose a table</Text>
        {error && <Text style={s.error}>{error}</Text>}

        {!rooms ? (
          <View style={s.loading}>
            <ActivityIndicator color={colors.gold} size="large" />
            <Text style={s.loadingTxt}>Connecting…</Text>
          </View>
        ) : (
          <ScrollView style={s.list} contentContainerStyle={s.listContent}>
            {rooms.map(room => (
              <Pressable key={room.id} style={s.card} onPress={() => onJoinTable(room.id)}>
                <View style={s.cardTop}>
                  <View style={s.cardLeft}>
                    <Text style={s.emoji}>{room.emoji || '🎲'}</Text>
                    <View>
                      <Text style={s.roomName}>{room.name}</Text>
                      <Text style={s.variant}>No Limit Hold'em</Text>
                    </View>
                  </View>
                  <View style={s.cardRight}>
                    <Text style={s.playerCount}>{room.playerCount ?? 0}</Text>
                    <Text style={s.playerLabel}>/ {room.maxPlayers}</Text>
                  </View>
                </View>
                <View style={s.cardBottom}>
                  <View style={[s.dot, room.phase === 'waiting' ? s.dotWait : s.dotActive]} />
                  <Text style={s.phase}>{room.phase === 'waiting' ? 'Waiting for players' : 'Hand in progress'}</Text>
                  <Text style={s.join}>Join →</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 20, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { fontSize: 20, fontWeight: '900', color: colors.goldLight },
  leaveBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  leaveTxt: { color: colors.white, fontSize: 13 },
  subtitle: { color: colors.gray, fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700' },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingTxt: { color: colors.gray, fontSize: 14 },
  list: { flex: 1 },
  listContent: { gap: 12 },
  card: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 16, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 30 },
  roomName: { color: colors.white, fontSize: 17, fontWeight: '800' },
  variant: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  cardRight: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  playerCount: { color: colors.goldLight, fontSize: 22, fontWeight: '700' },
  playerLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotWait: { backgroundColor: '#facc15' },
  dotActive: { backgroundColor: '#4ade80' },
  phase: { flex: 1, color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  join: { color: colors.gold, fontSize: 13, fontWeight: '700' },
});
