import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native';
import { AccountBar } from '@/auth/account-bar';
import { canCheckIn, isAttendee } from '@/auth/session';
import { useSession } from '@/auth/session-context';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';

/** Sends each account to its home: the door for door staff and organizers, tickets otherwise. */
export default function Home() {
  const { session } = useSession();
  if (session && canCheckIn(session.user)) {
    return <Redirect href="/door" />;
  }
  if (session && isAttendee(session.user)) {
    return <Redirect href="/tickets" />;
  }
  return (
    <Screen>
      <AccountBar />
      <Text style={styles.message}>
        This account has nothing to do in the app yet. Organizers manage events on the web.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  message: { marginTop: 12 },
});
