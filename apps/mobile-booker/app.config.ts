import { type ConfigContext, type ExpoConfig } from 'expo/config';

/**
 * SupplyBeacon Booker — Android app for Order Bookers (D-46).
 *
 * The API base URL is environment-driven (EXPO_PUBLIC_API_URL, read at build time):
 *   development  → your local NestJS API, e.g. http://192.168.1.20:3000/api (default below is the
 *                  Android emulator's alias for the host machine)
 *   production   → https://api.supplybeacon.com/api (set in eas.json build profiles)
 * One build serves every tenant: the organization always comes from the signed-in user.
 */
const DEV_API_URL = 'http://10.0.2.2:3000/api';
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? DEV_API_URL;
// plain http is only allowed when the configured API itself is http (local development)
const cleartext = apiUrl.startsWith('http://');

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SupplyBeacon Booker',
  slug: 'supplybeacon-booker',
  scheme: 'supplybeacon-booker',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  platforms: ['android'],
  android: {
    package: 'com.supplybeacon.booker',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundColor: '#15803d',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // business data (orders, shops) must not leave the phone through Android cloud backup
    allowBackup: false,
    // the template's storage / overlay permissions are not needed by this app
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
    softwareKeyboardLayoutMode: 'resize',
  },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-secure-store',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: '#15803d',
      },
    ],
    ['expo-build-properties', { android: { usesCleartextTraffic: cleartext } }],
  ],
  extra: { apiUrl },
});
