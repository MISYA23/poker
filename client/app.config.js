// Dynamic config layered on top of app.json.
// app.json stays the single source of truth; we only override the Android
// package so one codebase can ship to two Play Store listings.
//
//   (default)            -> hu.poker.app        (personal account)
//   APP_VARIANT=pro      -> com.pokermonkey.app (ANW LLC account)
//
// The EAS build profile sets APP_VARIANT; see eas.json.
module.exports = ({ config }) => {
  const isPro = process.env.APP_VARIANT === 'pro';

  return {
    ...config,
    android: {
      ...config.android,
      package: isPro ? 'com.pokermonkey.app' : 'hu.poker.app',
    },
  };
};
