import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, TextInput, Pressable, Image, ImageBackground,
  ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { GameContext } from '../context/GameContext';
import { colors } from '../theme';
import { SERVER_URL, VERSION } from '../config';
import { getUser, setUser, getOrCreatePlayerId } from '../utils/user';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = '1056319941649-g1feki5rvo6bm7jltur6eo4oanrn1tvo.apps.googleusercontent.com';
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

const AVATARS = [
  { id: 'dk',    source: require('../../assets/dk.png') },
  { id: 'diddy', source: require('../../assets/diddy.webp') },
  { id: 'alfie', source: require('../../assets/alfie.png') },
  { id: 'jazz',  source: require('../../assets/jazz.png') },
];

export default function LoginScreen() {
  const { onLogin } = useContext(GameContext);

  const [name, setName]       = useState('');
  const [avatarId, setAvatar] = useState(AVATARS[0].id);
  const [googleLoading, setGoogleLoading] = useState(false);

  const redirectUri = AuthSession.makeRedirectUri({ useProxy: true });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId: GOOGLE_CLIENT_ID, redirectUri, scopes: ['openid', 'profile', 'email'], responseType: AuthSession.ResponseType.Code, usePKCE: true },
    GOOGLE_DISCOVERY
  );

  // Auto-login if saved session exists
  useEffect(() => {
    getUser().then(user => {
      if (user?.playerId && user?.name) {
        onLogin(user.name, user.avatarId || AVATARS[0].id, user.playerId);
      }
    });
  }, []);

  // Handle Google OAuth response (authorization code flow)
  useEffect(() => {
    if (response?.type !== 'success') return;
    setGoogleLoading(true);

    AuthSession.exchangeCodeAsync(
      {
        clientId: GOOGLE_CLIENT_ID,
        code: response.params.code,
        redirectUri,
        extraParams: { code_verifier: request?.codeVerifier },
      },
      GOOGLE_DISCOVERY
    ).then(tokens => {
      return fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      }).then(r => r.json()).then(async profile => {
        const serverRes = await fetch(`${SERVER_URL}/auth/google`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokens.accessToken }),
        }).then(r => r.json()).catch(() => null);

        const playerId   = serverRes?.playerId || `g_${profile.id}`;
        const playerName = serverRes?.name || profile.given_name || profile.name || '';
        const av         = serverRes?.avatarId || avatarId;

        await setUser({ playerId, name: playerName, avatarId: av, email: profile.email });
        onLogin(playerName, av, playerId);
      });
    })
    .catch(() => {})
    .finally(() => setGoogleLoading(false));
  }, [response]);

  const handleGuestJoin = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const playerId = await getOrCreatePlayerId();
    await setUser({ name: trimmed, avatarId, playerId });
    onLogin(trimmed, avatarId, playerId);
  };

  return (
    <ImageBackground source={require('../../assets/jungle.png')} style={s.bg} resizeMode="cover">
      <View style={s.overlay}>
        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kav}>
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

              <View style={s.header}>
                <Text style={s.logo}>♠ Poker Monkey ♣ <Text style={s.logoVersion}>{VERSION}</Text></Text>
                <Text style={s.sub}>NL Hold'em · 1v1</Text>
              </View>

              <View style={s.card}>
                {/* Google */}
                <Pressable
                  style={[s.googleBtn, (googleLoading || !request) && s.dim]}
                  onPress={() => { setGoogleLoading(true); promptAsync({ createTask: false }).finally(() => setGoogleLoading(false)); }}
                  disabled={googleLoading || !request}
                >
                  {googleLoading
                    ? <ActivityIndicator color="#444" size="small" />
                    : <><Text style={s.googleG}>G</Text><Text style={s.googleTxt}>Log in with Google</Text></>
                  }
                </Pressable>

                {/* Divider */}
                <View style={s.divider}>
                  <View style={s.divLine} /><Text style={s.divTxt}>or</Text><View style={s.divLine} />
                </View>

                {/* Guest */}
                <Text style={s.sectionLabel}>Play as Guest</Text>

                <TextInput
                  style={s.input}
                  placeholder="Enter your name"
                  placeholderTextColor={colors.gray}
                  value={name}
                  onChangeText={setName}
                  maxLength={20}
                  returnKeyType="done"
                  onSubmitEditing={handleGuestJoin}
                />

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.avatarRow}>
                  {AVATARS.map(av => (
                    <Pressable key={av.id} style={[s.avatarOpt, avatarId === av.id && s.avatarSel]} onPress={() => setAvatar(av.id)}>
                      <Image source={av.source} style={s.avatarImg} resizeMode="cover" />
                    </Pressable>
                  ))}
                </ScrollView>

                <Pressable style={[s.joinBtn, !name.trim() && s.dim]} onPress={handleGuestJoin} disabled={!name.trim()}>
                  <Text style={s.joinTxt}>Join</Text>
                </Pressable>
              </View>

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
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  header: { alignItems: 'center', gap: 6 },
  logo: { fontSize: 28, fontWeight: '900', color: colors.goldLight, letterSpacing: 2 },
  sub: { fontSize: 12, color: colors.gray, letterSpacing: 1 },
  logoVersion: { fontSize: 20, fontWeight: '900', color: colors.goldLight },
  card: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 16, width: '100%', maxWidth: 400, padding: 22, gap: 16 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 50, paddingVertical: 13, gap: 10 },
  dim: { opacity: 0.45 },
  googleG: { fontSize: 17, fontWeight: '700', color: '#4285F4' },
  googleTxt: { fontSize: 15, fontWeight: '600', color: '#444' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  divTxt: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  sectionLabel: { color: colors.gray, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, color: colors.white, fontSize: 16 },
  avatarRow: { flexDirection: 'row', gap: 10 },
  avatarOpt: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  avatarSel: { borderColor: colors.goldLight },
  avatarImg: { width: 60, height: 60 },
  joinBtn: { backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  joinTxt: { color: '#000', fontSize: 16, fontWeight: '800' },
});
