import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { colors } from '../theme';

const AVATAR_IMAGES = {
  dk:    require('../../assets/dk.png'),
  diddy: require('../../assets/diddy.webp'),
  alfie: require('../../assets/alfie.png'),
  jazz:  require('../../assets/jazz.png'),
  cigar: require('../../assets/cigar.png'),
};

export default function Avatar({ size = 52, avatarId }) {
  const source = AVATAR_IMAGES[avatarId] || AVATAR_IMAGES.cigar;
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={source} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderWidth: 2, borderColor: colors.goldLight, backgroundColor: colors.greenFelt },
});
