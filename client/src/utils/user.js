import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'poker_user';

export async function getUser() {
  try {
    const data = await AsyncStorage.getItem(KEY);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

export async function setUser(fields) {
  try {
    const existing = await getUser() || {};
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...existing, ...fields }));
  } catch {}
}

export async function getOrCreatePlayerId() {
  const user = await getUser();
  if (user?.playerId) return user.playerId;
  const id = 'guest_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  await setUser({ playerId: id });
  return id;
}

export async function clearUser() {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}
