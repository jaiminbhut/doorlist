import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiStatus } from '@/components/api-status';
import { Text } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { size, usePalette } from '@/theme';

/** The first screen. Sign-in replaces it next (ADR 9). */
export default function Home() {
  const palette = usePalette();
  return (
    <SafeAreaView style={styles.screen}>
      <Wordmark />
      <View style={styles.poster}>
        <Text variant="display" style={styles.headline}>
          Your tickets, and the door.
        </Text>
        <Text style={{ color: palette.inkSoft }}>
          Free event tickets with QR codes that work offline, and a door scanner that keeps going
          when the venue&apos;s network doesn&apos;t.
        </Text>
      </View>
      <ApiStatus />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 32, paddingHorizontal: 20, paddingTop: 12 },
  poster: { gap: 12 },
  headline: { fontSize: size.poster, lineHeight: size.poster * 0.95 },
});
