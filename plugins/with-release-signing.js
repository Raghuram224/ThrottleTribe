// Adds a `release` signingConfig to the generated android/app/build.gradle.
// Reads credentials/keystore.properties when present; otherwise falls back to
// the debug keystore so other machines / CI can still build.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @with-release-signing';

const LOAD_BLOCK = `${MARKER}-load
def releaseKeystoreProps = new Properties()
def releaseKeystoreFile = new File(rootDir, "../credentials/keystore.properties")
if (releaseKeystoreFile.exists()) {
    releaseKeystoreFile.withInputStream { releaseKeystoreProps.load(it) }
}
`;

const SIGNING_CONFIG = `        ${MARKER}-config
        release {
            if (releaseKeystoreFile.exists()) {
                storeFile new File(releaseKeystoreFile.parentFile, releaseKeystoreProps['storeFile'])
                storePassword releaseKeystoreProps['storePassword']
                keyAlias releaseKeystoreProps['keyAlias']
                keyPassword releaseKeystoreProps['keyPassword']
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    // 1. property loader before the `android {` block
    src = src.replace(/^android\s*\{/m, (m) => `${LOAD_BLOCK}\n${m}`);

    // 2. release signingConfig appended inside signingConfigs { ... }
    src = src.replace(/signingConfigs\s*\{/, (m) => `${m}\n${SIGNING_CONFIG}`);

    // 3. point buildTypes.release at it (replace debug signing in release block)
    src = src.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release'
    );

    cfg.modResults.contents = src;
    return cfg;
  });
};
