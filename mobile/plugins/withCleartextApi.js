const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Allows plain-HTTP traffic only when the API URL itself is http:// (a LAN dev backend).
 * Production builds point at an https:// API and keep Android's default cleartext block.
 */
module.exports = function withCleartextApi(config) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  if (!apiUrl.startsWith('http://')) return config;
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = 'true';
    return cfg;
  });
};
