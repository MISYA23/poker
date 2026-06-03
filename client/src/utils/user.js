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

async function generateGuestId() {
  if (Platform.OS === 'android') {
    const androidId = await Application.getAndroidIdAsync();
    if (androidId) return `a_${androidId}`;
  }
  return 'guest_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
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
