import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { apiUrl } from '@/api/api-url';
import { request } from '@/api/client';
import { radius, size, usePalette } from '@/theme';
import { Text } from './text';

type Status = 'checking' | 'up' | 'down';

/** Which API this build talks to, and whether it answers. */
export function ApiStatus() {
  const palette = usePalette();
  const [status, setStatus] = useState<Status>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!apiUrl) {
      return;
    }
    let current = true;
    request<string>('/api/health', { timeoutMs: 5_000 }).then(
      () => current && setStatus('up'),
      () => current && setStatus('down'),
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  const checkAgain = () => {
    setStatus('checking');
    setAttempt((count) => count + 1);
  };

  if (!apiUrl) {
    return (
      <View style={[styles.card, { backgroundColor: palette.noticeBg }]}>
        <Text style={{ color: palette.noticeInk }}>
          This build has no API address. Set EXPO_PUBLIC_API_URL for its profile in eas.json.
        </Text>
      </View>
    );
  }

  const message = {
    checking: 'Checking…',
    up: 'Connected',
    down: "Can't reach it. Is the stack running? (docker compose up)",
  }[status];

  return (
    <View style={[styles.card, { backgroundColor: palette.paper, borderColor: palette.line }]}>
      <Text style={[styles.label, { color: palette.inkSoft }]}>API</Text>
      <Text variant="bold">{apiUrl}</Text>
      <Text
        accessibilityLiveRegion="polite"
        style={{
          color:
            status === 'down' ? palette.danger : status === 'up' ? palette.ok : palette.inkSoft,
        }}
      >
        {message}
      </Text>
      {status === 'down' && (
        <Pressable
          accessibilityRole="button"
          onPress={checkAgain}
          style={({ pressed }) => [
            styles.button,
            { borderColor: palette.stamp, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text variant="bold" style={{ color: palette.stamp }}>
            Check again
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.surface,
  },
  label: { fontSize: size.small, textTransform: 'uppercase', letterSpacing: 1 },
  button: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderRadius: radius.control,
  },
});
