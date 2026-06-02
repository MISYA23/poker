import React from 'react';
import { Image, View, StyleSheet } from 'react-native';

const AVATAR_IMAGES = {
  dk: require('../../assets/dk.png'),
  diddy: require('../../assets/diddy.webp'),
};

export default function Avatar({ size = 52, avatarId }) {
  const source = AVATAR_IMAGES[avatarId] || AVATAR_IMAGES.dk;
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={source}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});
