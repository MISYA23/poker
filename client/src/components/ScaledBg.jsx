import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

export default function ScaledBg({ source, children, tint = 0 }) {
  return (
    <View style={styles.outer}>
      <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {tint > 0 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${tint})` }]} />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#0a1628' },
});
