import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { AccountBar } from '@/auth/account-bar';
import type { Session } from '@/auth/session';
import { SignInAgainSheet } from '@/auth/sign-in-again-sheet';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { formatSavedAt } from '@/format';
import { usePalette } from '@/theme';
import { TicketStub } from './ticket-stub';
import { useMyTickets, type MyTickets } from './use-my-tickets';

/** My tickets: the stubs, from the API when it answers and from the phone when it doesn't. */
export function MyTicketsScreen({ session }: { session: Session }) {
  const palette = usePalette();
  const myTickets = useMyTickets(session);
  const [signingIn, setSigningIn] = useState(false);

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={myTickets.refreshing}
          onRefresh={myTickets.refresh}
          tintColor={palette.stamp}
          colors={[palette.stamp]}
        />
      }
    >
      <AccountBar />
      <View style={styles.head}>
        <Text variant="display" accessibilityRole="header">
          My tickets
        </Text>
        <Text style={{ color: palette.inkSoft }}>
          Show the QR code at the door. It works even if the venue&apos;s internet doesn&apos;t.
        </Text>
      </View>

      <Status myTickets={myTickets} onSignInAgain={() => setSigningIn(true)} />

      {myTickets.tickets?.map((ticket) => (
        <TicketStub
          key={ticket.id}
          ticket={ticket}
          onPress={() => router.push({ pathname: '/tickets/[id]', params: { id: ticket.id } })}
        />
      ))}

      <SignInAgainSheet
        visible={signingIn}
        reassurance="Your saved tickets stay on this phone, and their QR codes still work."
        onClose={() => setSigningIn(false)}
      />
    </Screen>
  );
}

function Status({ myTickets, onSignInAgain }: { myTickets: MyTickets; onSignInAgain(): void }) {
  const palette = usePalette();
  const { status, tickets, fetchedAt } = myTickets;
  const saved = fetchedAt ? formatSavedAt(fetchedAt) : null;
  const ink = { color: palette.noticeInk };

  if (status === 'loading' && !tickets) {
    return <Text style={{ color: palette.inkSoft }}>Loading your tickets…</Text>;
  }
  if (status === 'signInAgain') {
    return (
      <Notice>
        <Text style={ink}>
          Your session has expired. {tickets ? 'These tickets still work at the door. ' : ''}
          Sign in again to update them.
        </Text>
        <Button label="Sign in again" onPress={onSignInAgain} />
      </Notice>
    );
  }
  if (status === 'offline') {
    return (
      <Notice>
        <Text style={ink}>
          {tickets
            ? `Offline. These are your tickets as saved on ${saved}, and their QR codes still work.`
            : "Can't reach Doorlist, and this phone has no saved tickets yet. Connect once to load them."}
        </Text>
      </Notice>
    );
  }
  if (status === 'failed') {
    return (
      <Notice>
        <Text style={ink}>
          Couldn&apos;t update your tickets. Pull down to try again.
          {tickets ? ` These are as saved on ${saved}.` : ''}
        </Text>
      </Notice>
    );
  }
  if (tickets?.length === 0) {
    return (
      <Text style={{ color: palette.inkSoft }}>
        No tickets yet. Claim tickets for an event on the Doorlist website, and they&apos;ll show up
        here.
      </Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  head: { gap: 10 },
});
