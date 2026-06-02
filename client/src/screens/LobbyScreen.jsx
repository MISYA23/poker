import React, { useContext, useState } from 'react';
import {
  View, Text, TextInput, Pressable, Image,
  ImageBackground, ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameContext } from '../../App';
import { colors } from '../theme';
import { SERVER_URL } from '../config';

const AVATARS = [
  { id: 'dk', label: 'Donkey Kong', source: require('../../assets/dk.png') },
  { id: 'diddy', label: 'Diddy Kong', source: require('../../assets/diddy.webp') },
];

export default function LobbyScreen() {
  const { onJoin, error } = useContext(GameContext);
  const [playerName, setPlayerName] = useState('');
  const [avatarId, setAvatarId] = useState(AVATARS[0].id);

  const handleJoin = () => {
    if (!playerName.trim()) return;
    onJoin(playerName.trim(), avatarId);
  };

  const handleReset = () => {
    fetch(`${SERVER_URL}/admin/reset`, { method: 'POST' }).catch(() => {});
  };

  return (
    <ImageBackground
      source={require('../../assets/jungle.png')}
      style={styles.bg}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.kav}
          >
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

              <View style={styles.header}>
                <Text style={styles.logo}>♠ Poker Monkey ♣</Text>
                <Text style={styles.sub}>NL Hold'em Heads-up Bananza</Text>
              </View>

              <Pressable style={styles.resetBtn} onPress={handleReset}>
                <Text style={styles.resetBtnText}>Reset Game</Text>
              </Pressable>

              <View style={styles.card}>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Your Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your name"
                    placeholderTextColor={colors.gray}
                    value={playerName}
                    onChangeText={setPlayerName}
                    maxLength={20}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleJoin}
                  />
                </View>

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
  bg: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  safe: {
    flex: 1,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
  },
  logo: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.goldLight,
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  sub: {
    color: colors.gray,
    marginTop: 4,
    fontSize: 13,
    letterSpacing: 1,
  },
  resetBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  resetBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    width: '100%',
    maxWidth: 420,
    padding: 24,
    gap: 20,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    color: colors.gray,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.white,
    fontSize: 16,
  },
  avatarPicker: {
    flexDirection: 'row',
    gap: 12,
  },
  avatarOption: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  avatarSelected: {
    borderColor: colors.goldLight,
    shadowColor: colors.gold,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  avatarImg: {
    width: 72,
    height: 72,
  },
  error: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
});
