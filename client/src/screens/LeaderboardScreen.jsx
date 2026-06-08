import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Image, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import { colors } from '../theme';
import { SERVER_URL } from '../config';

const AVATAR_IMAGES = {
  dk:    require('../../assets/dk.png'),
  diddy: require('../../assets/diddy.webp'),
  alfie: require('../../assets/alfie.png'),
  jazz:  require('../../assets/jazz.png'),
};

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default function LeaderboardScreen({ navigation }) {
  const { playerInfo } = useContext(GameContext);

  useEffect(() => {
    if (Platform.OS === 'web' && !playerInfo) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  }, []);

  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null); // player tapped for action sheet

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${SERVER_URL}/api/leaderboard`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, []);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()}><Text style={s.back}>← Back</Text></Pressable>
        <Text style={s.title}>Leaderboard</Text>
        <Pressable onPress={load}><Text style={s.refresh}>↻</Text></Pressable>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.gold} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {/* Header row */}
          <View style={s.headerRow}>
            <Text style={[s.col, s.colRank]}>#</Text>
            <Text style={[s.col, s.colName]}>Player</Text>
            <Text style={[s.col, s.colElo]}>ELO</Text>
            <Text style={[s.col, s.colStat]}>W</Text>
            <Text style={[s.col, s.colStat]}>L</Text>
          </View>

          {data?.map(p => (
            <Pressable key={p.playerId} style={[s.row, p.rank <= 3 && s.rowTop]}
              onPress={() => p.playerId !== playerInfo?.playerId && setSelected(p)}>
              <Text style={[s.col, s.colRank, { color: RANK_COLORS[p.rank - 1] || colors.gray }]}>
                {p.rank <= 3 ? ['🥇','🥈','🥉'][p.rank - 1] : p.rank}
              </Text>
              <View style={s.colName}>
                <Image
                  source={AVATAR_IMAGES[p.avatarId] || AVATAR_IMAGES.dk}
                  style={s.avatar}
                />
                <Text style={s.name} numberOfLines={1}>{p.displayName}</Text>
              </View>
              <Text style={[s.col, s.colElo, s.eloTxt]}>{p.elo}</Text>
              <Text style={[s.col, s.colStat, s.winTxt]}>{p.wins}</Text>
              <Text style={[s.col, s.colStat, s.lossTxt]}>{p.losses}</Text>
            </Pressable>
          ))}

          {data?.length === 0 && (
            <Text style={s.empty}>No players yet. Be the first!</Text>
          )}
        </ScrollView>
      )}

      {/* Action sheet for tapped player */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={s.sheetOverlay} onPress={() => setSelected(null)}>
          <View style={s.sheet}>
            <Text style={s.sheetName}>{selected?.displayName}</Text>
            <Text style={s.sheetElo}>ELO {selected?.elo}</Text>
            <Pressable style={s.sheetBtn} onPress={() => {
              if (selected && playerInfo?.playerId) {
                fetch(`${SERVER_URL}/api/friends/request`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ requesterId: playerInfo.playerId, addresseeId: selected.playerId }),
                });
              }
              setSelected(null);
            }}>
              <Text style={s.sheetBtnTxt}>+ Add Friend</Text>
            </Pressable>
            <Pressable style={[s.sheetBtn, s.sheetBtnCancel]} onPress={() => setSelected(null)}>
              <Text style={[s.sheetBtnTxt, { color: colors.gray }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a1628' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  back: { color: colors.goldLight, fontSize: 15, width: 60 },
  title: { color: colors.white, fontSize: 18, fontWeight: '800' },
  refresh: { color: colors.gray, fontSize: 20, width: 60, textAlign: 'right' },
  list: { padding: 12, gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  rowTop: { backgroundColor: 'rgba(212,160,23,0.08)', borderColor: 'rgba(212,160,23,0.2)' },
  col: { color: colors.gray, fontSize: 12, fontWeight: '600' },
  colRank: { width: 36, textAlign: 'center', fontSize: 16 },
  colName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  colElo: { width: 52, textAlign: 'right' },
  colStat: { width: 32, textAlign: 'right' },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  name: { flex: 1, color: colors.white, fontSize: 14, fontWeight: '700' },
  eloTxt: { color: colors.goldLight, fontSize: 14, fontWeight: '800' },
  winTxt: { color: '#4ade80', fontWeight: '700' },
  lossTxt: { color: '#f87171', fontWeight: '700' },
  empty: { color: colors.gray, textAlign: 'center', marginTop: 40, fontStyle: 'italic' },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.1)' },
  sheetName: { color: colors.white, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  sheetElo: { color: colors.goldLight, fontSize: 14, textAlign: 'center', marginBottom: 4 },
  sheetBtn: { backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sheetBtnCancel: { backgroundColor: 'rgba(255,255,255,0.08)' },
  sheetBtnTxt: { color: '#000', fontSize: 15, fontWeight: '800' },
});
