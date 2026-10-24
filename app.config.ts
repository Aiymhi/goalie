import type { ExpoConfig } from 'expo/config';

// Single source of truth for the shared app group id (§4.4).
// Injected into entitlements by the config plugin in FEAT-003.
const APP_GROUP_ID = 'group.com.goalie.app.focus';

const config: ExpoConfig = {
  name: 'Goalie',
  slug: 'goalie',
  ios: {
    bundleIdentifier: 'com.goalie.app',
  },
  plugins: [
    'expo-dev-client',
    ['expo-build-properties', { ios: { deploymentTarget: '16.0' } }],
    // TODO(FEAT-003): add './modules/goalie-focus/plugin/withGoalieFocus' here
    // (pass APP_GROUP_ID). Do not reference it until the file exists, or
    // typecheck/prebuild will fail.
  ],
};

export default config;
