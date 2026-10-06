import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { SessionProvider, useSession } from '@/auth/session-context';
import { usePalette } from '@/theme';

// The splash screen stays up until the stored session has been read, so a
// signed-in person never sees the sign-in screen flash past.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

/** Signed out, only the sign-in and sign-up screens exist; signed in, only the app (ADR 9). */
function RootNavigator() {
  const palette = usePalette();
  const { loading, session } = useSession();

  // The window behind the screens, seen during transitions and the keyboard's slide.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palette.ground);
  }, [palette.ground]);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hide();
    }
  }, [loading]);

  if (loading) {
    return null;
  }

  return (
    <>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.ground } }}
      >
        <Stack.Protected guard={session !== null}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
        </Stack.Protected>
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
