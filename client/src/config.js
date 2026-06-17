import { Platform } from 'react-native';

const envUrl = process.env.EXPO_PUBLIC_SERVER_URL;
const prodUrl = 'https://pokermonkey.app';

// Android emulator can't reach host machine via 'localhost' — must use 10.0.2.2
function resolveUrl(url) {
  if (!url) return prodUrl;
  if (Platform.OS === 'android' && url.includes('localhost')) {
    return url.replace('localhost', '10.0.2.2');
  }
  return url;
}

export const SERVER_URL = resolveUrl(envUrl);
export const VERSION = 'v1.6';
export const BRANCH_VERSION = 'b30.36';
export const VERSION_DISPLAY = VERSION;
