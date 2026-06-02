import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

const banana = require('../../assets/bananas.png');

export default function Bananas({ amount, size = 22 }) {
  if (!amount || amount <= 0) return null;
  const count = amount < 100 ? 1 : amount < 500 ? 2 : 3;
  return (
    <View style={styles.stack}>
      {Array.from({ length: count }).map((_, i) => (
        <Image
          key={i}
          source={banana}
          style={[styles.img, { width: size * 1.5, height: size, marginLeft: i > 0 ? -size * 0.7 : 0 }]}
          resizeMode="contain"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { flexDirection: 'row', alignItems: 'center' },
  img: {},
});
