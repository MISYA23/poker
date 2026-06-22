// Dynamic config layered on top of app.json.
// app.json stays the single source of truth; we override the bits that must
// differ between the two Play Store listings so one codebase can ship to both.
//
//   (default)            -> hu.poker.app        (personal account)
//   APP_VARIANT=pro      -> com.pokermonkey.app (ANW LLC account)
//
// Each listing is a distinct package + signing key, so it needs its own Google
// Android OAuth client (package + SHA-1 bound). We pick the matching client id
// here and expose it via `extra` for the login screens, and register the
// matching reversed-client-id URL scheme for the OAuth redirect.
//
// The EAS build profile sets APP_VARIANT; see eas.json.
module.exports = ({ config }) => {
  const isPro = process.env.APP_VARIANT === 'pro';

  const googleAndroidClientId = isPro
    ? '1056319941649-tu8c46p18lq5fm1qbl4bpm14fdraiumd.apps.googleusercontent.com'
    : '1056319941649-see3orn4pr726lj32s8leecpn98sidpf.apps.googleusercontent.com';

  // Reversed client id, used as the OAuth redirect URL scheme.
  const googleScheme =
    'com.googleusercontent.apps.' +
    googleAndroidClientId.replace(/\.apps\.googleusercontent\.com$/, '');

  return {
    ...config,
    scheme: ['poker-monkey', googleScheme],
    android: {
      ...config.android,
      package: isPro ? 'com.pokermonkey.app' : 'hu.poker.app',
    },
    extra: {
      ...config.extra,
      googleAndroidClientId,
    },
  };
};
