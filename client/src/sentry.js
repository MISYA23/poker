// Crash + error reporting. Catches native crashes (the kind that killed the app
// at launch in vc14) as well as JS exceptions and unhandled promise rejections.
//
// Setup (one-time, in the Sentry dashboard):
//   1. Create a project (platform: React Native) → copy its DSN.
//   2. Put the DSN in client/.env as EXPO_PUBLIC_SENTRY_DSN=... and add the same
//      var to the EAS "production"/"preview" environments.
//   3. Alerts → New alert → "Issue is first seen" → email brian.danilo@gmail.com.
// Until a DSN is set this is a no-op, so the app runs fine without it.
import * as Sentry from '@sentry/react-native';
import { VERSION_DISPLAY } from './config';

// DSN is a public client key (safe to commit — it ships in the bundle anyway).
// Env var lets you point a local/dev build elsewhere without touching code.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN
  || 'https://fb8850cde5921e897ffcbc0706f7270a@o4511571048005632.ingest.us.sentry.io/4511571049906176';

export function initSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    release: VERSION_DISPLAY,
    environment: __DEV__ ? 'development' : 'production',
    // Report crashes/errors only — no performance tracing for now.
    tracesSampleRate: 0,
    // Don't ship user PII; we only need the stack trace + device/version.
    sendDefaultPii: false,
  });
}

export { Sentry };
