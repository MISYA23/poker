import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, useWindowDimensions } from 'react-native';
import { isMusicMuted, setMusicMuted } from '../audio/music';
import { isSfxEnabled, setSfxEnabled } from '../audio/sfx';

// Sound control — sits inline in a screen's header, next to the hamburger.
// Tapping the icon opens a small menu: Music on/off + Game sounds on/off.
// Icon shows active (🔊) if either is on, muted (🔇) if both are off.
// The menu renders in a Modal anchored under the button (measured on open) so
// it overlays the whole screen and tap-outside-to-close works on Android,
// where touches outside a parent's bounds don't register.
export default function SoundButton({ style }) {
  const { width: winW } = useWindowDimensions();
  const btnRef = useRef(null);
  const [anchor, setAnchor]   = useState(null);   // null = menu closed
  const [musicOn, setMusicOn] = useState(!isMusicMuted());
  const [sfxOn, setSfxOn]     = useState(isSfxEnabled());
  const anyOn = musicOn || sfxOn;

  const toggleMusic = () => { const v = !musicOn; setMusicOn(v); setMusicMuted(!v); };
  const toggleSfx   = () => { const v = !sfxOn;   setSfxOn(v);   setSfxEnabled(v); };

  const openMenu = () => {
    btnRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ top: y + h + 6, right: Math.max(8, winW - (x + w)) });
    });
  };

  return (
    <>
      <Pressable ref={btnRef} style={[st.btn, style]} onPress={openMenu} hitSlop={8}>
        <Text style={st.txt}>{anyOn ? '🔊' : '🔇'}</Text>
      </Pressable>
      {anchor && (
        <Modal transparent animationType="none" onRequestClose={() => setAnchor(null)}>
          <Pressable style={st.scrim} onPress={() => setAnchor(null)} />
          <View style={[st.menu, anchor]}>
            <Pressable style={st.row} onPress={toggleMusic}>
              <Text style={[st.box, musicOn && st.boxOn]}>{musicOn ? '✓' : ''}</Text>
              <Text style={st.label}>Music</Text>
            </Pressable>
            <Pressable style={st.row} onPress={toggleSfx}>
              <Text style={[st.box, sfxOn && st.boxOn]}>{sfxOn ? '✓' : ''}</Text>
              <Text style={st.label}>Game sounds</Text>
            </Pressable>
          </View>
        </Modal>
      )}
    </>
  );
}

const st = StyleSheet.create({
  btn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  txt: { fontSize: 17, lineHeight: 21 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  menu: {
    position: 'absolute', minWidth: 158,
    backgroundColor: 'rgba(15,15,18,0.97)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10, paddingVertical: 4, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingHorizontal: 12 },
  box: {
    width: 18, height: 18, borderRadius: 4, textAlign: 'center', lineHeight: 18,
    fontSize: 13, fontWeight: '900', color: '#0d1117',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'transparent',
  },
  boxOn: { backgroundColor: '#f0c040', borderColor: '#f0c040' },
  label: { fontSize: 13, color: '#fff', fontWeight: '600' },
});
