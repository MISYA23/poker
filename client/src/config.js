// Android emulator uses 10.0.2.2 to reach host machine localhost.
// For a physical device on the same WiFi, change to your machine's local IP.
export const SERVER_URL = __DEV__
  ? 'http://10.0.2.2:3843'
  : 'https://poker-production-d726.up.railway.app';
