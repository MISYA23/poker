import React, { useContext, useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, Image,
  ImageBackground, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { GameContext } from '../context/GameContext';
import { colors } from '../theme';
import { SERVER_URL } from '../config';
import { getUser, setUser, getOrCreatePlayerId } from '../utils/user';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = '1056319941649-g1feki5rvo6bm7jltur6eo4oanrn1tvo.apps.googleusercontent.com';
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

const AVATARS = [
  { id: 'dk',    label: 'Donkey Kong', source: require('../../assets/dk.png') },
  { id: 'diddy', label: 'Diddy Kong',  source: require('../../assets/diddy.webp') },
  { id: 'alfie', label: 'Alfie',       source: require('../../assets/alfie.png') },
  { id: 'jazz',  label: 'Jazz',        source: require('../../assets/jazz.png') },
];

export default function LobbyScreen() {
  const { onJoin, error } = useContext(GameContext);
  const [playerName, setPlayerName] = useState('');
  const [avatarId, setAvatarId] = useState(AVATARS[0].id);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleUser, setGoogleUser] = useState(null);

  const redirectUri = AuthSession.makeRedirectUri({ useProxy: true });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId: GOOGLE_CLIENT_ID, redirectUri, scopes: ['openid', 'profile', 'email'], responseType: AuthSession.ResponseType.Token },
    GOOGLE_DISCOVERY
  );

  useEffect(() => {
    getUser().then(user => {
      if (user?.name) setPlayerName(user.name);
      if (user?.avatarId) setAvatarId(user.avatarId);
      if (user?.email) setGoogleUser(user);
    });
  }, []);

  useEffect(() => {
    if (response?.type !== 'success') return;
    const { access_token } = response.params;
    setGoogleLoading(true);
    fetch('https://www.googleapis.com/userinfo/v2/me', { headers: { Authorization: `Bearer ${access_token}` } })
      .then(r => r.json())
      .then(async profile => {
        const serverRes = await fetch(`${SERVER_URL}/auth/google`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: access_token }),
        }).then(r => r.json()).catch(() => null);
        const playerId = serverRes?.playerId || ('g_' + profile.id);
        const name = serverRes?.name || profile.given_name || profile.name || '';
        const savedAvatarId = serverRes?.avatarId || avatarId;
        await setUser({ playerId, name, email: profile.email, picture: profile.picture, avatarId: savedAvatarId });
        setGoogleUser({ email: profile.email, picture: profile.picture });
        if (name) setPlayerName(name);
        if (savedAvatarId) setAvatarId(savedAvatarId);
      })
      .catch(() => {})
      .finally(() => setGoogleLoading(false));
  }, [response]);

  const handleJoin = () => {
    const name = playerName.trim();
    if (!name) return;
    getOrCreatePlayerId().then(playerId => {
      setUser({ name, avatarId }).catch(() => {});
      fetch(`${SERVER_URL}/api/player/guest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, name, avatarId }),
      }).catch(() => {});
      onJoin(name, avatarId, playerId);
    }).catch(() => {
      const playerId = 'guest_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      onJoin(name, avatarId, playerId);
    });
  };

  const handleReset = () => fetch(`${SERVER_URL}/admin/reset`, { method: 'POST' }).catch(() => {});

  return (
    <ImageBackground source={require('../../assets/jungle.png')} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.header}>
                <Text style={styles.logo}>♠ Poker Monkey ♣</Text>
                <Text style={styles.sub}>NL Hold'em • Multi-Table</Text>
              </View>

              <Pressable style={styles.resetBtn} onPress={handleReset}>
                <Text style={styles.resetBtnTxt}>Reset Game</Text>
              </Pressable>

              <View style={styles.card}>
                {/* Google Sign In */}
                {googleUser ? (
                  <View style={styles.googleSignedIn}>
                    {googleUser.picture && <Image source={{ uri: googleUser.picture }} style={styles.googlePic} />}
                    <Text style={styles.googleEmail}>{googleUser.email}</Text>
                    <Pressable onPress={() => setGoogleUser(null)}>
                      <Text style={styles.googleSignOut}>Sign out</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.googleBtn, (googleLoading || !request) && styles.googleBtnDim]}
                    onPress={() => { setGoogleLoading(true); promptAsync({ createTask: false }).finally(() => setGoogleLoading(false)); }}
                    disabled={googleLoading || !request}
                  >
                    {googleLoading
                      ? <ActivityIndicator color="#444" size="small" />
                      : <><Text style={styles.googleG}>G</Text><Text style={styles.googleBtnTxt}>Sign in with Google</Text></>
                    }
                  </Pressable>
                )}

                <View style={styles.divider}>
                  <View style={styles.divLine} />
                  <Text style={styles.divTxt}>{googleUser ? 'or update below' : 'or play as a guest'}</Text>
                  <View style={styles.divLine} />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Your Name</Text>
                  <TextInput style={styles.input} placeholder="Enter your name" placeholderTextColor={colors.gray}
                    value={playerName} onChangeText={setPlayerName} maxLength={20}
                    returnKeyType="done" onSubmitEditing={handleJoin} />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Choose Your Avatar</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarRow}>
                    {AVATARS.map(av => (
                      <Pressable key={av.id} style={[styles.avatarOpt, avatarId === av.id && styles.avatarSel]} onPress={() => setAvatarId(av.id)}>
                        <Image source={av.source} style={styles.avatarImg} resizeMode="cover" />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable style={[styles.submitBtn, !playerName.trim() && styles.submitDim]} onPress={handleJoin} disabled={!playerName.trim()}>
                  <Text style={styles.submitTxt}>Take a Seat</Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  safe: { flex: 1 },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 },
  header: { alignItems: 'center', marginBottom: 8 },
  logo: { fontSize: 30, fontWeight: '900', color: colors.goldLight, letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  sub: { color: colors.gray, marginTop: 4, fontSize: 12, letterSpacing: 1 },
  resetBtn: { alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  resetBtnTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  card: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, width: '100%', maxWidth: 420, padding: 22, gap: 18, elevation: 8 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 50, paddingVertical: 12, paddingHorizontal: 20, gap: 10 },
  googleBtnDim: { opacity: 0.6 },
  googleG: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  googleBtnTxt: { fontSize: 14, fontWeight: '600', color: '#444' },
  googleSignedIn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 },
  googlePic: { width: 32, height: 32, borderRadius: 16 },
  googleEmail: { flex: 1, color: colors.white, fontSize: 12 },
  googleSignOut: { color: colors.gray, fontSize: 11, textDecorationLine: 'underline' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  divLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  divTxt: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  formGroup: { gap: 8 },
  label: { color: colors.gray, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, color: colors.white, fontSize: 16 },
  avatarRow: { flexDirection: 'row', gap: 10 },
  avatarOpt: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  avatarSel: { borderColor: colors.goldLight, elevation: 4 },
  avatarImg: { width: 64, height: 64 },
  error: { color: '#f87171', fontSize: 12, textAlign: 'center' },
  submitBtn: { backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  submitDim: { opacity: 0.45 },
  submitTxt: { color: '#000', fontSize: 16, fontWeight: '800' },
});
