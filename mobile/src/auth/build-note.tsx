import Constants from 'expo-constants';
import { StyleSheet } from 'react-native';
import { apiUrl } from '@/api/api-url';
import { Text } from '@/components/text';
import { size, usePalette } from '@/theme';

/**
 * Which build this is and which API it talks to, on the sign-in screens of
 * every build except production. A test build pointed at the wrong
 * environment should be obvious before anyone signs in.
 */
export function BuildNote() {
  const palette = usePalette();
  const variant = Constants.expoConfig?.extra?.variant as string | undefined;
  if (variant === 'production') {
    return null;
  }
  return (
    <Text style={[styles.note, { color: palette.inkSoft }]}>
      {Constants.expoConfig?.name} · API {apiUrl ?? 'not configured'}
    </Text>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: 'auto', fontSize: size.small, textAlign: 'center' },
});
