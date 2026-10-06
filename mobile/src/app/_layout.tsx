import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { usePalette } from '@/theme';

export default function RootLayout() {
  const palette = usePalette();

  // The window behind the screens, seen during transitions and the keyboard's slide.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palette.ground);
  }, [palette.ground]);

  return (
    <>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.ground } }}
      />
      <StatusBar style="auto" />
    </>
  );
}
