import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

const CHIP_LOGO = require('../../assets/chip.png');

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLORS_REGULAR = { s: '#1a1a1a', h: '#c81e1e', d: '#c81e1e', c: '#1a1a1a' };
const SUIT_COLORS_FOUR    = { s: '#1a1a1a', h: '#c81e1e', d: '#1f63b0', c: '#1e7a3a' };

// All sizes shrunk ~20% from earlier; hole sizes (lg, xl) are 5% taller
// so the cards read slightly more like proper playing cards.
const SIZES = {
  xs: { width: 22, height: 21, font: 9 },
  sm: { width: 29, height: 26, font: 11 },
  // md (community): +1% width, +10% height for slightly better presence.
  md: { width: 42, height: 50, font: 17 },
  lg: { width: 51, height: 46, font: 21 },
  xl: { width: 58, height: 59, font: 24 },
};

export default function Card({ card, size = 'md', faceDown = false, deckStyle = 'regular' }) {
  const s = SIZES[size] || SIZES.md;

  if (faceDown || !card || card.hidden) {
    // Card back: gold body + subtle inner pattern. No central logo —
    // it looked off; the clean gold-on-gold reads better.
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
  cardBack: { backgroundColor: '#d4a017', alignItems: 'center', justifyContent: 'center' },
  backPattern: {
    position: 'absolute',
    top: 3, left: 3, right: 3, bottom: 3,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.35)',
    backgroundColor: '#f0c040',
    opacity: 0.6,
  },
  // Skull glyph in the table-rim brown so the Poker Monkey mark reads
  // clearly on the gold card back.
  backLogo: { color: '#4a2a10', fontWeight: '900', textAlign: 'center', lineHeight: undefined },
  rank: { fontWeight: '900' },
  suit: { fontWeight: '900' },
});
