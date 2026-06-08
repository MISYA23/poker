import React from 'react';
import { View, Image, StyleSheet, useWindowDimensions } from 'react-native';

// Reference dimensions of the jungle background PNGs (same for menu + ingame).
const IMAGE_W = 853;
const IMAGE_H = 1844;

// Renders a background image scaled uniformly behind its children.
//   cover=false (default): image fits inside the device; leftover area is
//     filled with a dark backdrop (letterboxing).
//   cover=true: image fills the device (may overflow on the cropped axis).
export default function ScaledBg({ source, children, tint = 0, cover = false }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const scale = cover
    ? Math.max(winW / IMAGE_W, winH / IMAGE_H)
    : Math.min(winW / IMAGE_W, winH / IMAGE_H);
  const bgW = IMAGE_W * scale;
  const bgH = IMAGE_H * scale;
  return (
    <View style={styles.outer}>
      <View style={{
        position: 'absolute',
        top: (winH - bgH) / 2,
        left: (winW - bgW) / 2,
        width: bgW,
        height: bgH,
      }}>
        <Image source={source} style={styles.image} resizeMode="cover" />
        {tint > 0 && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${tint})` }]} />
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#0a1628' },
  image: { width: '100%', height: '100%' },
});
