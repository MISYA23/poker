import React, { useContext, useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, Image,
  ImageBackground, ScrollView, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import { colors } from '../theme';
import { SERVER_URL } from '../config';
import { getUser, setUser, getOrCreatePlayerId } from '../utils/user';

const AVATARS = [
  { id: 'dk',    source: require('../../assets/dk.png') },
  { id: 'diddy', source: require('../../assets/diddy.webp') },
  { id: 'alfie', source: require('../../assets/alfie.png') },
  { id: 'jazz',  source: require('../../assets/jazz.png') },
];

export default function LobbyScreen() {
  const { onFindMatch, onCancelMatch, onObserve, error, matchList, inQueue, myElo } = useContext(GameContext);

  const [playerName, setPlayerName]       = useState('');
  const [avatarId, setAvatarId]           = useState(AVATARS[0].id);
  const [savedPlayerId, setSavedPlayerId] = useState(null);

  useEffect(() => {
    getUser().then(user => {
      if (user?.name)     setPlayerName(user.name);
      if (user?.avatarId) setAvatarId(user.avatarId);
      if (user?.playerId) setSavedPlayerId(user.playerId);
    });
  }, []);

  const handlePlay = async () => {
    const name = playerName.trim();
    if (!name) return;
    const playerId = savedPlayerId || await getOrCreatePlayerId();
    setSavedPlayerId(playerId);
    await setUser({ name, avatarId, playerId });
    onFindMatch(name, avatarId, playerId);
  };

  const handleReset = () =>
    fetch(`${SERVER_URL}/admin/reset`, { method: 'POST' }).catch(() => {});

  return (
    <ImageBackground source={require('../../assets/jungle.png')} style={s.bg} resizeMode="cover">
      <View style={s.overlay}>
        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kav}>
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

              <View style={s.header}>
                <Text style={s.logo}>♠ Poker Monkey ♣</Text>
                {myElo != null && <Text style={s.elo}>ELO: {myElo}</Text>}
              </View>

              <Pressable style={s.resetBtn} onPress={handleReset}>
                <Text style={s.resetBtnTxt}>Reset</Text>
              </Pressable>

              <View style={s.card}>
                <View style={s.formGroup}>
                  <Text style={s.label}>Your Name</Text>
                  <TextInput
                    style={s.input}
                    placeholder="Enter your name"
                    placeholderTextColor={colors.gray}
                    value={playerName}
                    onChangeText={setPlayerName}
                    maxLength={20}
                    returnKeyType="done"
                    editable={!inQueue}
                  />
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.avatarRow}>
                  {AVATARS.map(av => (
                    <Pressable
                      key={av.id}
                      style={[s.avatarOpt, avatarId === av.id && s.avatarSel]}
                      onPress={() => !inQueue && setAvatarId(av.id)}
                    >
                      <Image source={av.source} style={s.avatarImg} resizeMode="cover" />
                    </Pressable>
                  ))}
                </ScrollView>

                {error && <Text style={s.error}>{error}</Text>}

                {inQueue ? (
                  <View style={s.queueRow}>
                    <ActivityIndicator color={colors.gold} />
                    <Text style={s.queueTxt}>Finding opponent…</Text>
                    <Pressable style={s.cancelBtn} onPress={onCancelMatch}>
                      <Text style={s.cancelTxt}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={[s.playBtn, !playerName.trim() && s.playBtnDim]}
                    onPress={handlePlay}
                    disabled={!playerName.trim()}
                  >
                    <Text style={s.playBtnTxt}>PLAY!</Text>
                  </Pressable>
                )}
              </View>

              {matchList.length > 0 && (
                <View style={s.observeSection}>
                  <Text style={s.observeTitle}>Observe:</Text>
                  {matchList.map(m => (
                    <Pressable key={m.id} style={s.matchRow} onPress={() => onObserve(m.id)}>
                      <View style={s.matchInfo}>
                        <Text style={s.matchNames}>{m.player1} vs {m.player2}</Text>
                        <Text style={s.matchPhase}>
                          {m.phase === 'waiting' ? 'Starting…' : `Hand ${m.handCount} · ${m.phase}`}
                        </Text>
                      </View>
                      <Text style={s.watchTxt}>Watch →</Text>
                    </Pressable>
                  ))}
                </View>
              )}

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  safe: { flex: 1 },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 14 },
  header: { alignItems: 'center', gap: 6 },
  logo: { fontSize: 28, fontWeight: '900', color: colors.goldLight, letterSpacing: 2 },
  elo: { fontSize: 13, color: colors.gray, fontWeight: '600' },
  resetBtn: { alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  resetBtnTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  card: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 16, width: '100%', maxWidth: 420, padding: 20, gap: 16 },
  formGroup: { gap: 6 },
  label: { color: colors.gray, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, color: colors.white, fontSize: 16 },
  avatarRow: { flexDirection: 'row', gap: 10 },
  avatarOpt: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  avatarSel: { borderColor: colors.goldLight },
  avatarImg: { width: 60, height: 60 },
  error: { color: '#f87171', fontSize: 12, textAlign: 'center' },
  playBtn: { backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  playBtnDim: { opacity: 0.4 },
  playBtnTxt: { color: '#000', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 6 },
  queueTxt: { color: colors.white, fontSize: 15, fontWeight: '600', flex: 1 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  cancelTxt: { color: colors.white, fontSize: 13 },
  observeSection: { width: '100%', maxWidth: 420, gap: 8 },
  observeTitle: { color: colors.gray, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  matchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, gap: 8 },
  matchInfo: { flex: 1 },
  matchNames: { color: colors.white, fontSize: 14, fontWeight: '700' },
  matchPhase: { color: colors.gray, fontSize: 11, marginTop: 2 },
  watchTxt: { color: colors.gold, fontSize: 12, fontWeight: '700' },
});
