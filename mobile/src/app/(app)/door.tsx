import { StyleSheet, View } from 'react-native';
import { AccountBar } from '@/auth/account-bar';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { usePalette } from '@/theme';

/** The door. Picking an event and the scanner come next. */
export default function Door() {
  const palette = usePalette();
  return (
    <Screen>
      <AccountBar />
      <View style={styles.head}>
        <Text variant="display" accessibilityRole="header">
          Door
        </Text>
        <Text style={{ color: palette.inkSoft }}>
          Pick an event here to check its tickets, with or without a connection.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 10 },
});
