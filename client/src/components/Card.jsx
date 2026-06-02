import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLORS_REGULAR = { s: '#1a1a1a', h: '#c81e1e', d: '#c81e1e', c: '#1a1a1a' };
const SUIT_COLORS_FOUR    = { s: '#1a1a1a', h: '#c81e1e', d: '#1f63b0', c: '#1e7a3a' };

const SIZES = {
  xs: { width: 28, height: 26, font: 11 },
  sm: { width: 36, height: 32, font: 14 },
  md: { width: 52, height: 56, font: 20 },
  lg: { width: 64, height: 55, font: 26 },
  xl: { width: 72, height: 70, font: 30 },
};

export default function Card({ card, size = 'md', faceDown = false, deckStyle = 'regular' }) {
  const s = SIZES[size] || SIZES.md;

  if (faceDown || !card || card.hidden) {
    return (
      <View style={[styles.card, styles.cardBack, { width: s.width, height: s.height }]}>
        <View style={styles.backPattern} />
      </View>
    );
  }

  const colors = deckStyle === 'four-color' ? SUIT_COLORS_FOUR : SUIT_COLORS_REGULAR;
  const symbol = SUIT_SYMBOLS[card.suit] || card.suit;
  const color = colors[card.suit] || '#1a1a1a';
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
    borderRadius: 5,
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
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  cardBack: { backgroundColor: '#d4a017' },
  backPattern: {
    position: 'absolute',
    top: 3, left: 3, right: 3, bottom: 3,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.35)',
    backgroundColor: '#f0c040',
    opacity: 0.6,
  },
  rank: { fontWeight: '900' },
  suit: { fontWeight: '900' },
});
