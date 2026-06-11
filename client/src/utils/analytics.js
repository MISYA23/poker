import { Platform } from 'react-native';

// Meta Pixel custom events — web only. The pixel base code is loaded in
// public/index.html, so fbq only exists on web; everywhere else this no-ops.
export function track(event, params) {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  window.fbq('trackCustom', event, params);
}
