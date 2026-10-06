import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, usePalette } from '@/theme';

/** An amber note about the state of things, like the web's .notice. */
export function Notice({ children }: PropsWithChildren) {
  const palette = usePalette();
  return (
    <View
      accessibilityRole="summary"
      style={[styles.notice, { backgroundColor: palette.noticeBg }]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { gap: 10, padding: 14, borderRadius: radius.control },
});
