import Constants from 'expo-constants';

/** API base URL (with the /api prefix), chosen at build time — see app.config.ts. */
export const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://10.0.2.2:3000/api';
