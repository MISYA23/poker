import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Application from 'expo-application';

const KEY = 'poker_user';

export async function getUser() {
  try { const d = await AsyncStorage.getItem(KEY); return d ? JSON.parse(d) : null; }
  catch { return null; }
}
export async function setUser(fields) {
  try { const e = await getUser() || {}; await AsyncStorage.setItem(KEY, JSON.stringify({ ...e, ...fields })); }
  catch {}
}

function browserSlug() {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent;
  if (ua.includes('Edg/'))     return 'edge';
  if (ua.includes('Chrome/'))  return 'chrome';
  if (ua.includes('Firefox/')) return 'firefox';
  if (ua.includes('Safari/'))  return 'safari';
  return 'web';
}

async function generateGuestId() {
  const rand = Math.random().toString(36).slice(2, 7);
  if (Platform.OS === 'android') {
    try {
      const androidId = await Application.getAndroidIdAsync();
      if (androidId) return `guest_android_${androidId.slice(-6)}`;
    } catch {}
    return `guest_android_${rand}`;
  }
  if (Platform.OS === 'ios') return `guest_ios_${rand}`;
  return `guest_${browserSlug()}_${rand}`;
}

export async function getOrCreatePlayerId() {
  const user = await getUser();
  if (user?.playerId) return user.playerId;
  const id = await generateGuestId();
  await setUser({ playerId: id });
  return id;
}
export async function clearUser() {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}
