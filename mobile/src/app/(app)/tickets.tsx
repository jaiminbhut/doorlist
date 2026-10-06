import { StyleSheet, View } from 'react-native';
import { AccountBar } from '@/auth/account-bar';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { usePalette } from '@/theme';

/** My tickets. The list, its QR codes and the offline cache come next. */
export default function Tickets() {
  const palette = usePalette();
  return (
    <Screen>
      <AccountBar />
      <View style={styles.head}>
        <Text variant="display" accessibilityRole="header">
          My tickets
        </Text>
        <Text style={{ color: palette.inkSoft }}>
          Your tickets will show here, with QR codes that work offline.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 10 },
});
