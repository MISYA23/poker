import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isMusicMuted, onMusicMutedChange, setMusicMuted } from '../audio/music';
import { isSfxEnabled, onSfxEnabledChange, setSfxEnabled } from '../audio/sfx';
import { SERVER_URL } from '../config';

export default function SoundToggleRows({ playerId, itemStyle }) {
  const [musicOn, setMusicOn] = useState(!isMusicMuted());
  const [sfxOn, setSfxState] = useState(isSfxEnabled());

  useEffect(() => {
    const unsub1 = onMusicMutedChange(muted => setMusicOn(!muted));
    const unsub2 = onSfxEnabledChange(enabled => setSfxState(enabled));
    return () => { unsub1(); unsub2(); };
  }, []);

  const saveSound = (music, sfx) => {
    if (!playerId) return;
    fetch(`${SERVER_URL}/api/player/${encodeURIComponent(playerId)}/sound`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ musicEnabled: music, sfxEnabled: sfx }),
    }).catch(() => {});
  };

  const toggleMusic = () => {
    const next = !musicOn;
    setMusicMuted(!next);
    saveSound(next, sfxOn);
  };

  const toggleSfx = () => {
    const next = !sfxOn;
    setSfxEnabled(next);
    saveSound(musicOn, next);
  };

  return (
    <>
      <Pressable style={[st.row, itemStyle]} onPress={toggleMusic}>
        <Text style={st.label}>🎵 Music</Text>
        <View style={[st.pill, musicOn && st.pillOn]}>
          <Text style={[st.pillTxt, musicOn && st.pillTxtOn]}>{musicOn ? 'ON' : 'OFF'}</Text>
        </View>
      </Pressable>
      <Pressable style={[st.row, itemStyle]} onPress={toggleSfx}>
        <Text style={st.label}>🔊 Game sounds</Text>
        <View style={[st.pill, sfxOn && st.pillOn]}>
          <Text style={[st.pillTxt, sfxOn && st.pillTxtOn]}>{sfxOn ? 'ON' : 'OFF'}</Text>
        </View>
      </Pressable>
    </>
  );
}

const st = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label:     { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  pill:      { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  pillOn:    { backgroundColor: 'rgba(240,192,64,0.18)', borderColor: 'rgba(240,192,64,0.5)' },
  pillTxt:   { color: '#8a98aa', fontSize: 11, fontWeight: '800' },
  pillTxtOn: { color: '#f0c040' },
});
