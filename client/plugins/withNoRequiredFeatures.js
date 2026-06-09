const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = withAndroidManifest(config => {
  const manifest = config.modResults?.manifest;
  if (!manifest) return config;
  const features = manifest['uses-feature'];
  if (Array.isArray(features)) {
    features.forEach(f => {
      f.$['android:required'] = 'false';
    });
  }
  return config;
});
