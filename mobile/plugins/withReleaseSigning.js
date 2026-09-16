const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Signs the release build with the project's own keystore when the build environment provides
 * one (CI decodes it from a secret): `SEA_RELEASE_KEYSTORE` (a file path), `SEA_RELEASE_STORE_PASSWORD`,
 * `SEA_RELEASE_KEY_ALIAS`, `SEA_RELEASE_KEY_PASSWORD`. Without all four the generated project keeps
 * the template's debug signing, so a local build or a fork still produces an installable APK.
 *
 * The generated `app/build.gradle` reads the values from the environment at build time, so no
 * secret is ever written into the project tree.
 */
const ENV = ['SEA_RELEASE_KEYSTORE', 'SEA_RELEASE_STORE_PASSWORD', 'SEA_RELEASE_KEY_ALIAS', 'SEA_RELEASE_KEY_PASSWORD'];
const DEBUG_SIGNING = 'signingConfig signingConfigs.debug';
const RELEASE_BLOCK = `        release {
            storeFile file(System.getenv("SEA_RELEASE_KEYSTORE"))
            storePassword System.getenv("SEA_RELEASE_STORE_PASSWORD")
            keyAlias System.getenv("SEA_RELEASE_KEY_ALIAS")
            keyPassword System.getenv("SEA_RELEASE_KEY_PASSWORD")
        }
`;

module.exports = function withReleaseSigning(config) {
  if (!ENV.every((name) => (process.env[name] ?? '') !== '')) return config;
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes('signingConfigs.release')) return cfg;
    const configsAt = gradle.indexOf('signingConfigs {');
    const lastDebug = gradle.lastIndexOf(DEBUG_SIGNING);
    if (configsAt === -1 || lastDebug === -1) {
      throw new Error('withReleaseSigning: the generated app/build.gradle no longer looks like the template');
    }
    // The last `signingConfig signingConfigs.debug` is the release build type's (the debug build
    // type's comes first); the template's comment above it says exactly this line is the one to change.
    gradle = gradle.slice(0, lastDebug) + 'signingConfig signingConfigs.release' + gradle.slice(lastDebug + DEBUG_SIGNING.length);
    const openBrace = gradle.indexOf('{', configsAt) + 1;
    gradle = gradle.slice(0, openBrace) + '\n' + RELEASE_BLOCK + gradle.slice(openBrace);
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
