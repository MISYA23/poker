import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { colors } from '../theme';

const AVATAR_IMAGES = {
  cigar: require('../../assets/cigar.png'),
  queen: require('../../assets/queen.png'),
  lemur: require('../../assets/lemur.png'),
  captain: require('../../assets/captain.png'),
};

export default function Avatar({ size = 52, avatarId }) {
  const source = AVATAR_IMAGES[avatarId] || AVATAR_IMAGES.cigar || AVATAR_IMAGES.queen;
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={source} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderWidth: 2, borderColor: colors.goldLight, backgroundColor: colors.greenFelt },
});
