import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, TextInput, Pressable, Image,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import { GameContext } from '../context/GameContext';
import { colors } from '../theme';
import { SERVER_URL, VERSION_DISPLAY } from '../config';
import { getUser, setUser, getOrCreatePlayerId } from '../utils/user';
import ScreenBackground from '../components/ScreenBackground';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID     = '1056319941649-g1feki5rvo6bm7jltur6eo4oanrn1tvo.apps.googleusercontent.com';
const GOOGLE_ANDROID_CLIENT_ID = '1056319941649-see3orn4pr726lj32s8leecpn98sidpf.apps.googleusercontent.com';
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

const MOBILE_MAX_WIDTH = 768;

// Fire ad conversion pixels (web only, no-op if SDK not loaded)
function trackAdEvent(name, params = {}) {
  if (Platform.OS !== 'web') return;
  if (typeof window.fbq === 'function') window.fbq('track', name, params);
  if (typeof window.gtag === 'function') window.gtag('event', 'conversion', { send_to: 'AW-18227143328', ...params });
}

export default function AdLandingScreen() {
  const { onLogin } = useContext(GameContext);
  const { width: windowWidth } = useWindowDimensions();
  const isMobileLayout = windowWidth <= MOBILE_MAX_WIDTH;

  const [name, setName]             = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const isExpoGo = Constants.appOwnership === 'expo';

  const clientId = (Platform.OS === 'android' && !isExpoGo)
    ? GOOGLE_ANDROID_CLIENT_ID
    : GOOGLE_WEB_CLIENT_ID;

  const redirectUri = Platform.OS === 'web'
    ? window.location.origin + '/'
    : (Platform.OS === 'android' && !isExpoGo)
      ? AuthSession.makeRedirectUri({ native: 'com.googleusercontent.apps.1056319941649-see3orn4pr726lj32s8leecpn98sidpf:/oauth2redirect/google' })
      : AuthSession.makeRedirectUri({ useProxy: true });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId, redirectUri, scopes: ['openid', 'profile', 'email'], responseType: AuthSession.ResponseType.Code, usePKCE: true },
    GOOGLE_DISCOVERY
  );

  const finishGoogleLogin = async (accessToken) => {
    const profile = await fetch('https://www.googleapis.com/userinfo/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(r => r.json());

    const serverRes = await fetch(`${SERVER_URL}/auth/google`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: accessToken }),
    }).then(r => r.json()).catch(() => null);

    const playerId   = serverRes?.playerId || `g_${profile.id}`;
    const playerName = serverRes?.name || profile.given_name || profile.name || '';
    const av         = serverRes?.avatarId || 'captain';

    trackAdEvent('Lead', { content_name: 'google_login' });
    await setUser({ playerId, name: playerName, email: profile.email });
    onLogin(playerName, av, playerId);
  };

  // Auto-login if saved session exists
  useEffect(() => {
    getUser().then(async (user) => {
      if (!user?.playerId || !user?.name) return;
      let av = 'captain';
      try {
        const data = await fetch(`${SERVER_URL}/api/player/${user.playerId}/profile`).then(r => r.json());
        if (data.avatarId) av = data.avatarId;
      } catch (_) {}
      onLogin(user.name, av, user.playerId);
    });
  }, []);

  // Web: handle OAuth redirect-back
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    setGoogleLoading(true);
    const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
    window.history.replaceState({}, '', '/ad');

    fetch(`${SERVER_URL}/auth/google/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri: window.location.origin + '/', codeVerifier }),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.access_token) throw new Error(JSON.stringify(data));
        return finishGoogleLogin(data.access_token);
      })
      .catch(e => console.error('[google-web] exchange failed:', e.message))
      .finally(() => setGoogleLoading(false));
  }, []);

  // Native: handle OAuth response
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (response?.type !== 'success') return;
    setGoogleLoading(true);

    AuthSession.exchangeCodeAsync(
      { clientId, code: response.params.code, redirectUri, extraParams: { code_verifier: request?.codeVerifier } },
      GOOGLE_DISCOVERY
    )
      .then(tokens => finishGoogleLogin(tokens.accessToken))
      .catch(() => {})
      .finally(() => setGoogleLoading(false));
  }, [response]);

  const handleGuestJoin = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const playerId = await getOrCreatePlayerId();
    await fetch(`${SERVER_URL}/api/player/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, name: trimmed }),
    });
    trackAdEvent('Lead', { content_name: 'guest_join' });
    await setUser({ name: trimmed, playerId });
    onLogin(trimmed, 'captain', playerId);
  };

  return (
    <View style={s.root}>
      {isMobileLayout ? (
        <>
          <Image source={require('../../assets/login-island.jpg')} style={s.bg} resizeMode="cover" />
          <Image source={require('../../assets/login-monkey.png')} style={s.bg} resizeMode="cover" />
          <View style={s.logoWrap} pointerEvents="none">
            <Image source={require('../../assets/flag-logo.png')} style={s.logo} resizeMode="contain" />
          </View>
        </>
      ) : (
        <ScreenBackground />
      )}

      <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kav}>
        <View style={s.center}>
          <View style={s.card}>
            <Pressable
              style={[s.googleBtn, (googleLoading || !request) && s.dim]}
              onPress={() => {
                if (Platform.OS === 'web') {
                  if (!request) return;
                  sessionStorage.setItem('pkce_code_verifier', request.codeVerifier || '');
                  window.location.href = request.url;
                } else {
                  setGoogleLoading(true);
                  promptAsync({ createTask: false }).finally(() => setGoogleLoading(false));
                }
              }}
              disabled={googleLoading || !request}
            >
              {googleLoading
                ? <ActivityIndicator color="#444" size="small" />
                : <><Text style={s.googleG}>G</Text><Text style={s.googleTxt}>Log in with Google</Text></>
              }
            </Pressable>
            <View style={s.divider}>
              <View style={s.divLine} /><Text style={s.divTxt}>or</Text><View style={s.divLine} />
            </View>
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
            <Pressable style={[s.joinBtn, !name.trim() && s.dim]} onPress={handleGuestJoin} disabled={!name.trim()}>
              <Text style={s.joinTxt}>Play as Guest</Text>
            </Pressable>
          </View>

          <View style={s.complyRow}>
            <View style={s.ageBadge}>
              <Text style={s.ageBadgeText}>18+</Text>
            </View>
            <View style={s.complyBadge}><Text style={s.complyBadgeTxt}>NO REAL MONEY</Text></View>
            <View style={s.complyBadge}><Text style={s.complyBadgeTxt}>FREE TO PLAY</Text></View>
            <View style={s.complyBadge}><Text style={s.complyBadgeTxt}>NO IN-APP PURCHASES</Text></View>
          </View>
          <Text style={s.complyText}>
            Free social poker for adults 18+. Virtual chips only — no real-money gambling, no cash prizes, nothing to buy. Practice at social gaming does not imply success at real-money gambling.
          </Text>
        </View>
      </KeyboardAvoidingView>
      <Text style={s.versionSmall}>{VERSION_DISPLAY}</Text>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#0a1628', ...Platform.select({ web: { minHeight: '100%', height: '100dvh', width: '100%' } }) },
  bg:      { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  logoWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '33%',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  logo:    { width: '100%', maxWidth: 420, height: '100%' },
  safe:    { flex: 1 },
  kav:     { flex: 1 },
  center:  {
    flex: 1, alignItems: 'center', justifyContent: 'flex-end', padding: 24, gap: 14,
    paddingBottom: Platform.OS === 'web' ? 'calc(38px + env(safe-area-inset-bottom))' : 38,
  },
  versionSmall: {
    position: 'absolute', right: 12, bottom: 12,
    fontSize: 11, color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  card: {
    backgroundColor: '#12121e',
    borderWidth: 3, borderColor: 'rgba(222,184,110,0.9)',
    borderRadius: 18,
    width: '100%', maxWidth: 400, padding: 22, gap: 16,
    shadowColor: colors.goldLight, shadowOpacity: 0.45, shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  googleBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 50, paddingVertical: 13, gap: 10 },
  dim:         { opacity: 0.45 },
  googleG:     { fontSize: 17, fontWeight: '700', color: '#4285F4' },
  googleTxt:   { fontSize: 15, fontWeight: '600', color: '#444' },
  divider:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divLine:     { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  divTxt:      { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  sectionLabel:{ color: colors.gray, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  input:       { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, color: colors.white, fontSize: 16 },
  joinBtn:     { backgroundColor: colors.goldLight, borderRadius: 12, paddingVertical: 14, alignItems: 'center', shadowColor: colors.goldLight, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  joinTxt:     { color: '#000', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  // Compliance
  complyRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, width: '100%', maxWidth: 400 },
  ageBadge:    { width: 34, height: 34, borderRadius: 6, backgroundColor: '#000', borderWidth: 1.5, borderColor: 'rgba(222,184,110,0.7)', alignItems: 'center', justifyContent: 'center' },
  ageBadgeText:{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: -0.5 },
  complyBadge: { borderWidth: 1, borderColor: 'rgba(222,184,110,0.55)', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  complyBadgeTxt: { color: 'rgba(222,184,110,0.85)', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  complyText:  { width: '100%', maxWidth: 400, textAlign: 'center', fontSize: 10.5, color: 'rgba(255,255,255,0.38)', lineHeight: 16 },
});
