import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Image, View, StyleSheet } from 'react-native';

// Backgrounds at several aspect ratios — at runtime we pick whichever is
// closest to the viewport so `cover` trims as little as possible on any device.
// Portrait (phones/tablets) gets the pirate monkey; landscape keeps the jungle art.
const BGS = [
  { ar: 21 / 9,     src: require('../../assets/login-bg-21-9.jpg') },
  { ar: 16 / 9,     src: require('../../assets/login-bg-16-9.jpg') },
  { ar: 4 / 3,      src: require('../../assets/login-bg-4-3.jpg') },
  { ar: 852 / 1846, src: require('../../assets/login-bg-9-19.jpg') },
];

// Drop in as the FIRST child of a screen's root <View> (which should be flex:1).
// Renders the closest-aspect image + a subtle scrim behind the screen content.
//
// Art selection is keyed to the SCREEN (device) dimensions, not the window:
// the window shrinks when the soft keyboard or mobile-browser toolbars appear,
// which would swap the artwork mid-interaction. The screen only changes on
// rotation — exactly when a re-pick is wanted.
export default function ScreenBackground({ scrim = 0.3 }) {
  const [screen, setScreen] = useState(() => Dimensions.get('screen'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', (dims) => setScreen(dims.screen));
    return () => sub.remove();
  }, []);
  const bg = useMemo(() => {
    const vAR = screen.width / Math.max(1, screen.height);
    return BGS.reduce((best, cur) =>
      Math.abs(Math.log(cur.ar / vAR)) < Math.abs(Math.log(best.ar / vAR)) ? cur : best
    ).src;
  }, [screen.width, screen.height]);
  return (
    <>
      <Image source={bg} style={styles.bg} resizeMode="cover" />
      <View style={[styles.scrim, { backgroundColor: `rgba(0,0,0,${scrim})` }]} pointerEvents="none" />
    </>
  );
}

const styles = StyleSheet.create({
  bg:    { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  scrim: { ...StyleSheet.absoluteFillObject },
});
