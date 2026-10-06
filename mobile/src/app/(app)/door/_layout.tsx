import { Stack } from 'expo-router';
import { usePalette } from '@/theme';

export default function DoorLayout() {
  const palette = usePalette();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.ground } }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[eventId]"
        options={{ contentStyle: { backgroundColor: palette.console } }}
      />
    </Stack>
  );
}
