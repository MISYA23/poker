import React, { useContext, useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, Image, ScrollView, StyleSheet, ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../context/GameContext';
import { LobbyContext } from '../context/LobbyContext';
import { colors } from '../theme';
import { SERVER_URL } from '../config';
import { getUser, setUser } from '../utils/user';
import { isMusicMuted, setMusicMuted } from '../audio/music';
import { isSfxEnabled, setSfxEnabled } from '../audio/sfx';

// Static image map — Metro requires these to be known at build time
const AVATAR_IMAGES = {
  cigar: require('../../assets/cigar.png'),
  queen: require('../../assets/queen.png'),
  lemur: require('../../assets/lemur.png'),
  captain: require('../../assets/captain.png'),
  baboon: require('../../assets/baboon.png'),
  sailor: require('../../assets/sailor.png'),
  banana: require('../../assets/banana.png'),
  parrot: require('../../assets/parrot.png'),
};

// captain is the default avatar → always show it first in the picker
const captainFirst = (list) =>
  [...list].sort((a, b) => (a.avatar_id === 'captain' ? -1 : 0) - (b.avatar_id === 'captain' ? -1 : 0));

// Avatar picker grid: 5 per row, sized to the screen width (capped for desktop web)
const AV_COLS = 5;
const AV_GAP  = 10;
const AV_SIZE = Math.floor((Math.min(Dimensions.get('window').width, 440) - 40 - AV_GAP * (AV_COLS - 1)) / AV_COLS);

export default function ProfileScreen({ navigation }) {
  const { playerInfo, onUpdateProfile, deckStyle, setDeckStyle } = useContext(GameContext);
  const { myElo } = useContext(LobbyContext);

  useEffect(() => {
    if (Platform.OS === 'web' && !playerInfo) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  }, []);

  const [name, setName]         = useState(playerInfo?.name || '');
  const [avatars, setAvatars]   = useState(
    captainFirst(Object.keys(AVATAR_IMAGES).map(id => ({ avatar_id: id, image_key: id })))
  );
  const [avatarId, setAvatarId] = useState(
    AVATAR_IMAGES[playerInfo?.avatarId] ? playerInfo.avatarId : 'captain'
  );
  const [saving, setSaving]     = useState(false);
  const [musicOn, setMusicOn]   = useState(!isMusicMuted());
  const [sfxOn, setSfxOn]       = useState(isSfxEnabled());
  const [history, setHistory]   = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/avatars`)
      .then(r => r.json())
      .then(rows => {
        const serverAvs = rows.filter(a => AVATAR_IMAGES[a.image_key]);
        const known = new Set(serverAvs.map(a => a.avatar_id));
        // also offer any locally-bundled avatar the server doesn't list yet
        const localOnly = Object.keys(AVATAR_IMAGES)
          .filter(id => !known.has(id))
          .map(id => ({ avatar_id: id, image_key: id }));
        setAvatars(captainFirst([...serverAvs, ...localOnly]));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!playerInfo?.playerId) return;
    fetch(`${SERVER_URL}/api/player/${playerInfo.playerId}/profile`)
      .then(r => r.json())
      .then(data => {
        setHistory(data.history || []);
        if (typeof data.musicEnabled === 'boolean') {
          setMusicOn(data.musicEnabled);
          setMusicMuted(!data.musicEnabled);
        }
        if (typeof data.sfxEnabled === 'boolean') {
          setSfxOn(data.sfxEnabled);
          setSfxEnabled(data.sfxEnabled);
        }
      })
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [playerInfo?.playerId]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    await Promise.all([
      setUser({ name: trimmed }),
      fetch(`${SERVER_URL}/api/player/${playerInfo.playerId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed, avatarId, musicEnabled: musicOn, sfxEnabled: sfxOn }),
      }),
    ]);
    setMusicMuted(!musicOn);
    setSfxEnabled(sfxOn);
    onUpdateProfile(trimmed, avatarId);
    setSaving(false);
    navigation.goBack();
  };

  return (
   <View style={s.root}>
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backTxt}>← Back</Text>
        </Pressable>
        <Text style={s.title}>Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>

        {/* ELO */}
        {myElo != null && (
          <View style={s.eloCard}>
            <Text style={s.eloNum}>{myElo}</Text>
            <Text style={s.eloLbl}>ELO Rating</Text>
          </View>
        )}

        {/* Name */}
        <View style={s.section}>
          <Text style={s.sectionLbl}>Username</Text>
          <TextInput style={s.input} value={name} onChangeText={setName}
            maxLength={20} placeholder="Your name" placeholderTextColor={colors.gray} />
          <Text style={s.uuidTxt}>{playerInfo?.playerId}</Text>
        </View>

        {/* Avatar */}
        <View style={s.section}>
          <Text style={s.sectionLbl}>Avatar</Text>
          <View style={s.avatarRow}>
            {avatars.map(av => (
              <Pressable key={av.avatar_id} style={[s.avatarOpt, avatarId === av.avatar_id && s.avatarSel]}
                onPress={() => setAvatarId(av.avatar_id)}>
                <Image source={AVATAR_IMAGES[av.image_key]} style={s.avatarImg} resizeMode="cover" />
              </Pressable>
            ))}
          </View>
        </View>

        {/* 4-Color deck */}
        <View style={s.section}>
          <Text style={s.sectionLbl}>Card Style</Text>
          <Pressable style={s.toggle} onPress={() => setDeckStyle(d => d === 'four-color' ? 'regular' : 'four-color')}>
            <Text style={s.toggleLbl}>4-Color Deck</Text>
            <View style={[s.toggleTrack, deckStyle === 'four-color' && s.toggleOn]}>
              <View style={[s.toggleThumb, deckStyle === 'four-color' && s.toggleThumbOn]} />
            </View>
          </Pressable>
          <Pressable style={s.toggle} onPress={() => setMusicOn(v => !v)}>
            <Text style={s.toggleLbl}>Music</Text>
            <View style={[s.toggleTrack, musicOn && s.toggleOn]}>
              <View style={[s.toggleThumb, musicOn && s.toggleThumbOn]} />
            </View>
          </Pressable>
          <Pressable style={s.toggle} onPress={() => setSfxOn(v => !v)}>
            <Text style={s.toggleLbl}>Game Sounds</Text>
            <View style={[s.toggleTrack, sfxOn && s.toggleOn]}>
              <View style={[s.toggleThumb, sfxOn && s.toggleThumbOn]} />
            </View>
          </Pressable>
        </View>

        {/* Save */}
        <Pressable style={[s.saveBtn, (!name.trim() || saving) && s.saveDim]}
          onPress={handleSave} disabled={!name.trim() || saving}>
          {saving ? <ActivityIndicator color="#000" size="small" />
            : <Text style={s.saveTxt}>Save Changes</Text>}
        </Pressable>

        {/* Game history */}
        <View style={s.section}>
          <Text style={s.sectionLbl}>Match History</Text>
          {loadingHistory ? (
            <ActivityIndicator color={colors.gold} />
          ) : history?.length === 0 ? (
            <Text style={s.emptyTxt}>No matches yet</Text>
          ) : (
            history?.map((m, i) => (
              <Pressable key={m.matchId || i} style={s.historyRow}
                onPress={() => navigation.navigate('HandReplay', {
                  matchId: m.matchId,
                  matchLabel: `vs ${m.opponentName}`,
                })}>
                <View style={[s.resultDot, m.won ? s.dotWin : s.dotLoss]} />
                <View style={s.historyInfo}>
                  <Text style={s.historyOpp}>vs {m.opponentName}</Text>
                  <Text style={s.historyDate}>{new Date(m.date).toLocaleDateString()}</Text>
                </View>
                <Text style={[s.eloChange, m.eloChange >= 0 ? s.eloPos : s.eloNeg]}>
                  {m.eloChange >= 0 ? '+' : ''}{m.eloChange}
                </Text>
                <Text style={s.replayArrow}>▶</Text>
              </Pressable>
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
   </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1628' },
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  backBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  backTxt: { color: colors.goldLight, fontSize: 15 },
  title: { color: colors.white, fontSize: 18, fontWeight: '800' },
  scroll: { padding: 20, gap: 24 },
  eloCard: { backgroundColor: 'rgba(212,160,23,0.12)', borderWidth: 1, borderColor: 'rgba(212,160,23,0.3)', borderRadius: 16, padding: 20, alignItems: 'center' },
  eloNum: { color: colors.goldLight, fontSize: 48, fontWeight: '900' },
  eloLbl: { color: colors.gray, fontSize: 13, marginTop: 2 },
  section: { gap: 10 },
  sectionLbl: { color: colors.gray, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: colors.white, fontSize: 16 },
  uuidTxt: { color: 'rgba(255,255,255,0.3)', fontSize: 11, paddingHorizontal: 4 },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: AV_GAP },
  avatarOpt: { width: AV_SIZE, height: AV_SIZE, borderRadius: AV_SIZE / 2, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  avatarSel: { borderColor: colors.goldLight },
  avatarImg: { width: AV_SIZE, height: AV_SIZE },
  saveBtn: { backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveDim: { opacity: 0.45 },
  saveTxt: { color: '#000', fontSize: 16, fontWeight: '800' },
  emptyTxt: { color: colors.gray, fontSize: 14, fontStyle: 'italic' },
  historyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12, gap: 10 },
  resultDot: { width: 10, height: 10, borderRadius: 5 },
  dotWin: { backgroundColor: '#4ade80' },
  dotLoss: { backgroundColor: '#f87171' },
  historyInfo: { flex: 1 },
  historyOpp: { color: colors.white, fontSize: 14, fontWeight: '600' },
  historyDate: { color: colors.gray, fontSize: 11, marginTop: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 14 },
  toggleLbl: { color: colors.white, fontSize: 14 },
  toggleTrack: { width: 44, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', padding: 2 },
  toggleOn: { backgroundColor: colors.gold },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  toggleThumbOn: { alignSelf: 'flex-end' },
  replayArrow: { color: colors.gold, fontSize: 12, marginLeft: 4 },
  eloChange: { fontSize: 15, fontWeight: '800' },
  eloPos: { color: '#4ade80' },
  eloNeg: { color: '#f87171' },
});
