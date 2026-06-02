import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLORS = { s: '#1a1a1a', h: '#c81e1e', d: '#c81e1e', c: '#1a1a1a' };

const SIZES = {
  xs: { width: 32, height: 29, font: 12 },
  sm: { width: 42, height: 36, font: 16 },
  md: { width: 56, height: 60, font: 22 },
  lg: { width: 68, height: 58, font: 28 },
  xl: { width: 76, height: 73, font: 32 },
};

export default function Card({ card, size = 'md', faceDown = false }) {
  const s = SIZES[size] || SIZES.md;

  if (faceDown || !card || card.hidden) {
    return (
      <View style={[styles.card, styles.cardBack, { width: s.width, height: s.height }]}>
        <View style={styles.backPattern} />
      </View>
    );
  }

  const symbol = SUIT_SYMBOLS[card.suit] || card.suit;
  const color = SUIT_COLORS[card.suit] || '#1a1a1a';
  const rankFont = card.rank === '10' ? s.font * 0.82 : s.font;

  return (
    <View style={[styles.card, styles.cardFace, { width: s.width, height: s.height }]}>
      <Text style={[styles.rank, { fontSize: rankFont, color }]}>{card.rank}</Text>
      <Text style={[styles.suit, { fontSize: s.font, color }]}>{symbol}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    flexShrink: 0,
  },
  cardFace: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 1,
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  cardBack: {
    backgroundColor: '#d4a017',
  },
  backPattern: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.35)',
    backgroundColor: '#f0c040',
    opacity: 0.6,
  },
  rank: {
    fontWeight: '900',
    lineHeight: undefined,
  },
  suit: {
    fontWeight: '900',
  },
});
