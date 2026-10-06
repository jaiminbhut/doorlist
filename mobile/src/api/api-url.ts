import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** The API's port in the local stack (docker-compose.yml). */
export const LOCAL_API_PORT = 5080;

export interface ApiUrlSources {
  /** EXPO_PUBLIC_API_URL, set per build profile in eas.json, or in .env.local. */
  configured: string | undefined;
  /** True in a development build. */
  dev: boolean;
  /** Where Metro serves the bundle from, as "host:port". */
  metroHost: string | undefined;
  platform: string;
}

/**
 * Where the API is, or null if this build doesn't know.
 *
 * A configured address always wins. Without one, only a development build
 * works it out: the local stack runs on the same machine as Metro, so the API
 * is on Metro's host. That reaches it from a simulator, an emulator, or a
 * phone on the same network. A preview or production build never guesses: if
 * its profile forgot the address, the app says so instead of quietly talking
 * to some other environment.
 */
export function resolveApiUrl({
  configured,
  dev,
  metroHost,
  platform,
}: ApiUrlSources): string | null {
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  if (!dev || !metroHost) {
    return null;
  }

  let host = metroHost.replace(/:\d+$/, '');
  // On the Android emulator, localhost is the emulator itself; 10.0.2.2 is the computer.
  if (platform === 'android' && (host === 'localhost' || host === '127.0.0.1')) {
    host = '10.0.2.2';
  }
  return `http://${host}:${LOCAL_API_PORT}`;
}

export const apiUrl = resolveApiUrl({
  configured: process.env.EXPO_PUBLIC_API_URL,
  dev: __DEV__,
  metroHost: Constants.expoConfig?.hostUri,
  platform: Platform.OS,
});
