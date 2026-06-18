import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { colors } from '../theme';
import { SERVER_URL } from '../config';

export default function BananaStore({ visible, onClose, lives = 0, maxLives = 3, playerInfo, onBought }) {
  const [loading, setLoading] = useState(false);
  const atMax = lives >= maxLives;

  async function buyOne() {
    if (!playerInfo?.id || atMax) return;
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/player/${playerInfo.id}/buy-life`, { method: 'POST' });
      if (res.ok) onBought?.();
    } catch (_) {}
    setLoading(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={bs.backdrop} onPress={onClose}>
        <Pressable style={bs.sheet} onPress={() => {}}>
          <View style={bs.handle} />

          <Text style={bs.icon}>🍌</Text>
          <Text style={bs.title}>Banana Store</Text>

          {atMax ? (
            <>
              <Text style={bs.sub}>You have {lives} banana{lives !== 1 ? 's' : ''}{'\n'}You're ready to play</Text>
              <View style={bs.readyBox}>
                <Text style={bs.readyBoxTxt}>🍌 ×{lives} · Ready to play</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={bs.sub}>
                {lives === 0
                  ? 'Out of bananas?\nGrab one to keep playing'
                  : `You have ${lives} banana${lives !== 1 ? 's' : ''}\nBuy more to build up your stash`}
              </Text>
              <Pressable style={bs.tierActive} onPress={buyOne} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#0c151f" />
                  : <><Text style={bs.tierActiveTxt}>1 Banana</Text><Text style={bs.tierActiveTag}>FREE</Text></>
                }
              </Pressable>
            </>
          )}

          <View style={bs.tierSoon}>
            <Text style={bs.tierSoonTxt}>5 Bananas</Text>
            <Text style={bs.tierSoonTag}>Soon</Text>
          </View>
          <View style={bs.tierSoon}>
            <Text style={bs.tierSoonTxt}>20 Bananas</Text>
            <Text style={bs.tierSoonTag}>Soon</Text>
          </View>

          <Text style={bs.footer}>Paid bananas coming soon · no real-money gambling</Text>

          <Pressable style={bs.closeBtn} onPress={onClose}>
            <Text style={bs.closeTxt}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const bs = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,11,17,0.72)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#16222f', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12, paddingBottom: 36, paddingHorizontal: 22,
    alignItems: 'center', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 20 },
  icon:  { fontSize: 48, marginBottom: 6 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 6 },
  sub:   { color: '#8a98aa', fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 21, marginBottom: 20 },

  readyBox: {
    alignSelf: 'stretch', backgroundColor: 'rgba(231,178,59,0.12)',
    borderWidth: 1, borderColor: 'rgba(231,178,59,0.4)',
    borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  readyBoxTxt: { color: colors.goldLight, fontSize: 16, fontWeight: '900' },

  tierActive: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.goldLight, borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 18, marginBottom: 10, minHeight: 54,
  },
  tierActiveTxt: { color: '#0c151f', fontSize: 16, fontWeight: '900' },
  tierActiveTag: { color: '#0c151f', fontSize: 13, fontWeight: '900', opacity: 0.7 },
  tierSoon: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 18, marginBottom: 10,
  },
  tierSoonTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '900' },
  tierSoonTag: { color: '#8a98aa', fontSize: 13, fontWeight: '800' },

  footer: { color: 'rgba(255,255,255,0.25)', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 10, marginBottom: 18 },
  closeBtn: {
    alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16,
    paddingVertical: 14, alignItems: 'center',
  },
  closeTxt: { color: '#8a98aa', fontSize: 15, fontWeight: '800' },
});
