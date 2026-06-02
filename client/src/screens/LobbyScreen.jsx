import React, { useContext, useState, useEffect, useCallback } from 'react';
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
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const AVATARS = [
  { id: 'dk', label: 'Donkey Kong', source: require('../../assets/dk.png') },
  { id: 'diddy', label: 'Diddy Kong', source: require('../../assets/diddy.webp') },
];

export default function LobbyScreen() {
  const { onJoin, error } = useContext(GameContext);
  const [playerName, setPlayerName] = useState('');
  const [avatarId, setAvatarId] = useState(AVATARS[0].id);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleUser, setGoogleUser] = useState(null);

  const redirectUri = AuthSession.makeRedirectUri({ useProxy: true });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.Token,
    },
    GOOGLE_DISCOVERY
  );

  // Load saved user on mount
  useEffect(() => {
    getUser().then(user => {
      if (user?.name) setPlayerName(user.name);
      if (user?.avatarId) setAvatarId(user.avatarId);
      if (user?.email) setGoogleUser(user);
    });
  }, []);

  // Handle Google auth response
  useEffect(() => {
    if (response?.type !== 'success') return;
    const { access_token } = response.params;
    setGoogleLoading(true);
    fetch('https://www.googleapis.com/userinfo/v2/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
      .then(r => r.json())
      .then(async profile => {
        // Tell server about the Google user
        const serverRes = await fetch(`${SERVER_URL}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: access_token }),
        }).then(r => r.json()).catch(() => null);

        const playerId = serverRes?.playerId || ('g_' + profile.id);
        const name = serverRes?.name || profile.given_name || profile.name || '';
        const savedAvatarId = serverRes?.avatarId || avatarId;

        await setUser({ playerId, name, email: profile.email, picture: profile.picture, avatarId: savedAvatarId });
        setGoogleUser({ email: profile.email, picture: profile.picture, name });
        if (name) setPlayerName(name);
        if (savedAvatarId) setAvatarId(savedAvatarId);
      })
      .catch(() => {})
      .finally(() => setGoogleLoading(false));
  }, [response]);

  const handleJoin = useCallback(() => {
    const name = playerName.trim();
    console.log('[lobby] handleJoin called, name:', name, 'avatarId:', avatarId);
    if (!name) { console.log('[lobby] blocked: empty name'); return; }
    const playerId = 'guest_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    console.log('[lobby] calling onJoin with playerId:', playerId);
    onJoin(name, avatarId, playerId);
  }, [playerName, avatarId, onJoin]);

  const handleGoogleSignIn = useCallback(() => {
    setGoogleLoading(true);
    promptAsync({ createTask: false }).finally(() => setGoogleLoading(false));
  }, [promptAsync]);

  const handleReset = () => {
    fetch(`${SERVER_URL}/admin/reset`, { method: 'POST' }).catch(() => {});
  };

  return (
    <ImageBackground source={require('../../assets/jungle.png')} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

              <View style={styles.header}>
                <Text style={styles.logo}>♠ Poker Monkey ♣</Text>
                <Text style={styles.sub}>NL Hold'em Heads-up Bananza</Text>
              </View>

              <Pressable style={styles.resetBtn} onPress={handleReset}>
                <Text style={styles.resetBtnText}>Reset Game</Text>
              </Pressable>

              <View style={styles.card}>
                {/* Google Sign In */}
                {googleUser ? (
                  <View style={styles.googleSignedIn}>
                    {googleUser.picture && (
                      <Image source={{ uri: googleUser.picture }} style={styles.googlePic} />
                    )}
                    <Text style={styles.googleEmail}>{googleUser.email}</Text>
                    <Pressable onPress={async () => { setGoogleUser(null); }}>
                      <Text style={styles.googleSignOut}>Sign out</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.googleBtn, (googleLoading || !request) && styles.googleBtnDisabled]}
                    onPress={handleGoogleSignIn}
                    disabled={googleLoading || !request}
                  >
                    {googleLoading ? (
                      <ActivityIndicator color="#444" size="small" />
                    ) : (
                      <>
                        <Text style={styles.googleG}>G</Text>
                        <Text style={styles.googleBtnText}>Sign in with Google</Text>
                      </>
                    )}
                  </Pressable>
                )}

                {/* Divider */}
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>
                    {googleUser ? 'or update below' : 'or play as a guest'}
                  </Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Name */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Your Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your name"
                    placeholderTextColor={colors.gray}
                    value={playerName}
                    onChangeText={setPlayerName}
                    maxLength={20}
                    returnKeyType="done"
                    onSubmitEditing={handleJoin}
                  />
                </View>

                {/* Avatar */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Choose Your Avatar</Text>
                  <View style={styles.avatarPicker}>
                    {AVATARS.map(av => (
                      <Pressable
                        key={av.id}
                        style={[styles.avatarOption, avatarId === av.id && styles.avatarSelected]}
                        onPress={() => setAvatarId(av.id)}
                      >
                        <Image source={av.source} style={styles.avatarImg} resizeMode="cover" />
                      </Pressable>
                    ))}
                  </View>
                </View>

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  style={[styles.submitBtn, !playerName.trim() && styles.submitBtnDisabled]}
                  onPress={handleJoin}
                  disabled={!playerName.trim()}
                >
                  <Text style={styles.submitBtnText}>Take a Seat</Text>
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
  header: { alignItems: 'center', marginBottom: 12 },
  logo: { fontSize: 32, fontWeight: '900', color: colors.goldLight, letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  sub: { color: colors.gray, marginTop: 4, fontSize: 13, letterSpacing: 1 },
  resetBtn: { alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  resetBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  card: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, width: '100%', maxWidth: 420, padding: 24, gap: 20, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 50, paddingVertical: 12, paddingHorizontal: 20, gap: 10 },
  googleBtnDisabled: { opacity: 0.6 },
  googleG: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  googleBtnText: { fontSize: 15, fontWeight: '600', color: '#444' },
  googleSignedIn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 },
  googlePic: { width: 36, height: 36, borderRadius: 18 },
  googleEmail: { flex: 1, color: colors.white, fontSize: 13 },
  googleSignOut: { color: colors.gray, fontSize: 12, textDecorationLine: 'underline' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  dividerText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, whiteSpace: 'nowrap' },
  formGroup: { gap: 8 },
  label: { color: colors.gray, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, color: colors.white, fontSize: 16 },
  avatarPicker: { flexDirection: 'row', gap: 12 },
  avatarOption: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  avatarSelected: { borderColor: colors.goldLight, elevation: 4 },
  avatarImg: { width: 72, height: 72 },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center' },
  submitBtn: { backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
});
