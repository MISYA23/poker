import { Platform } from 'react-native';

// Web-only analytics. Base codes are loaded in public/index.html (Meta Pixel +
// Google tag), so fbq/gtag only exist on web; everywhere else this no-ops.

const GOOGLE_ADS_ID = 'AW-18227143328';
// Google Ads "Page view" conversion action label
const PAGEVIEW_CONVERSION = `${GOOGLE_ADS_ID}/spAfCOmljbwcEKDFsPND`;

function fbq(...args) {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') window.fbq(...args);
}

function gtag(...args) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') window.gtag(...args);
}

// Custom events — sent to both Meta and Google with the same name/params.
export function track(event, params) {
  if (Platform.OS !== 'web') return;
  fbq('trackCustom', event, params);
  gtag('event', event, { ...params, send_to: GOOGLE_ADS_ID });
}

// Screen views — gtag('config', …) in index.html has send_page_view:false
// because this is a SPA: react-navigation changes screens without real page
// loads, so App.js calls this from onReady/onStateChange instead. The first
// screen view also reports the Google Ads page-view conversion.
let lastScreen = null;
let conversionSent = false;
export function trackScreen(screen) {
  if (Platform.OS !== 'web' || !screen || screen === lastScreen) return;
  lastScreen = screen;
  gtag('event', 'page_view', {
    page_title: screen,
    page_location: `${window.location.origin}/${screen.toLowerCase()}`,
    send_to: GOOGLE_ADS_ID,
  });
  if (!conversionSent) {
    conversionSent = true;
    gtag('event', 'conversion', {
      send_to: PAGEVIEW_CONVERSION,
      value: 1.0,
      currency: 'USD',
    });
  }
}
