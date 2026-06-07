import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

const chipImg = require('../../assets/chip.png');

// Stack of 1–3 chips depending on amount — same tier rule as the legacy
// Bananas component for visual continuity (small/med/big bets). The chip
// asset is a 3D ornate wooden poker chip with the Poker Monkey skull-and-
// crossbones logo and suit accents around the rim.
export default function Chips({ amount, size = 22 }) {
  if (!amount || amount <= 0) return null;
  const count = amount < 100 ? 1 : amount < 500 ? 2 : 3;
  return (
    <View style={styles.stack}>
      {Array.from({ length: count }).map((_, i) => (
        <Image
          key={i}
          source={chipImg}
          style={[
            styles.img,
            {
              width: size * 1.5,
              height: size * 1.5,
              marginLeft: i > 0 ? -size * 0.95 : 0,
              zIndex: count - i,
            },
          ]}
          resizeMode="contain"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { flexDirection: 'row', alignItems: 'center' },
  img:   {},
});
