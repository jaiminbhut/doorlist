import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { queuedCount } from '@/door/door-store';
import { size, usePalette } from '@/theme';
import { describeRoles } from './session';
import { useSession } from './session-context';

/** The top of every signed-in screen: the wordmark, who is signed in, and signing out. */
export function AccountBar() {
  const palette = usePalette();
  const { session, signOut } = useSession();
  if (!session) {
    return null;
  }

  // Scans waiting to sync belong to the door, not the person (ADR 9): signing
  // out keeps them, and says so.
  const confirmSignOut = async () => {
    const waiting = await queuedCount().catch(() => 0);
    const scans = waiting === 1 ? '1 door scan hasn’t' : `${waiting} door scans haven’t`;
    Alert.alert(
      'Sign out?',
      waiting > 0
        ? `${scans} synced yet. They stay on this phone and sync after door staff sign in again.`
        : `You're signed in as ${session.user.email}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  };

  return (
    <View style={styles.bar}>
      <Wordmark />
      <View style={styles.account}>
        <View style={styles.who}>
          <Text variant="bold" numberOfLines={1}>
            {session.user.displayName}
          </Text>
          <Text style={[styles.role, { color: palette.inkSoft }]}>
            {describeRoles(session.user)}
          </Text>
        </View>
        <Pressable
          testID="sign-out"
          accessibilityRole="button"
          onPress={() => void confirmSignOut()}
          hitSlop={8}
          style={({ pressed }) => [
            styles.signOut,
            { borderColor: palette.line, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text variant="bold" style={[styles.signOutText, { color: palette.stamp }]}>
            Sign out
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 14 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  who: { flex: 1 },
  role: { fontSize: size.small, lineHeight: size.small * 1.4 },
  signOut: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderRadius: 999 },
  signOutText: { fontSize: size.small },
});
