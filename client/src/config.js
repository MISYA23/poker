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

// True whenever the client is pointed at a non-prod server (EXPO_PUBLIC_SERVER_URL
// is only set in client/.env for local dev). Used to surface a dev-mode visual cue.
export const IS_DEV_SERVER = !!envUrl;

export const VERSION = 'v1.63';
export const VERSION_DISPLAY = VERSION;
