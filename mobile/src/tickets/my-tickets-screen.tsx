import { router, useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  RefreshControl,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ScrollView,
  useWindowDimensions,
} from 'react-native';
import { AccountBar } from '@/auth/account-bar';
import type { Session } from '@/auth/session';
import { SignInAgainSheet } from '@/auth/sign-in-again-sheet';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useReducedMotion } from '@/components/use-reduced-motion';
import { formatSavedAt } from '@/format';
import { usePalette } from '@/theme';
import { Arrival } from './arrival';
import { TicketStub } from './ticket-stub';
import { useMyTickets, type MyTickets } from './use-my-tickets';

interface MyTicketsScreenProps {
  session: Session;
  /** Ids of tickets just claimed, comma-separated, from the event screen. */
  claimed?: string;
}

/** My tickets: the stubs, from the API when it answers and from the phone when it doesn't. */
export function MyTicketsScreen({ session, claimed = '' }: MyTicketsScreenProps) {
  const palette = usePalette();
  const myTickets = useMyTickets(session, claimed);
  const justClaimed = useJustClaimed(claimed);
  const [signingIn, setSigningIn] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const scrolledFor = useRef('');
  const reducedMotion = useReducedMotion();
  const { height } = useWindowDimensions();

  const arrived = myTickets.tickets?.filter((ticket) => justClaimed.has(ticket.id)) ?? [];
  const added =
    arrived.length > 0
      ? `${arrived.length === 1 ? '1 ticket' : `${arrived.length} tickets`} added for ${arrived[0].eventName}.`
      : null;

  useEffect(() => {
    if (added) {
      AccessibilityInfo.announceForAccessibility(added);
    }
  }, [added]);

  // Tickets are in event order, so new ones can be far down: bring the first
  // into view, once per claim. If it's near the top already, the note that
  // they were added stays in view too.
  const showArrival = (event: LayoutChangeEvent) => {
    const { y } = event.nativeEvent.layout;
    if (scrolledFor.current === claimed || y < height * 0.6) {
      return;
    }
    scrolledFor.current = claimed;
    scroll.current?.scrollTo({
      y: Math.max(0, y - 12),
      animated: !reducedMotion,
    });
  };

  return (
    <Screen
      ref={scroll}
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

      {added ? (
        <Text variant="bold" accessibilityLiveRegion="polite" style={{ color: palette.ok }}>
          {added}
        </Text>
      ) : null}

      {myTickets.tickets?.map((ticket) => {
        const stub = (
          <TicketStub
            ticket={ticket}
            onPress={() => router.push({ pathname: '/tickets/[id]', params: { id: ticket.id } })}
          />
        );
        return justClaimed.has(ticket.id) ? (
          <Arrival
            key={ticket.id}
            delay={arrived.indexOf(ticket) * 90}
            onLayout={ticket === arrived[0] ? showArrival : undefined}
          >
            {stub}
          </Arrival>
        ) : (
          <Fragment key={ticket.id}>{stub}</Fragment>
        );
      })}

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
      <View style={styles.empty}>
        <Text style={{ color: palette.inkSoft }}>
          No tickets yet. Pick an event under Events and claim tickets, and they&apos;ll show up
          here.
        </Text>
        <Button
          kind="secondary"
          label="See upcoming events"
          onPress={() => router.navigate('/events')}
        />
      </View>
    );
  }
  return null;
}

/**
 * The tickets claimed on the way here, until the person leaves My tickets:
 * as on the web, a later visit shows nothing as new.
 */
function useJustClaimed(claimed: string): ReadonlySet<string> {
  const [seen, setSeen] = useState(claimed);
  const [ids, setIds] = useState<ReadonlySet<string>>(() => idsIn(claimed));
  if (claimed !== seen) {
    setSeen(claimed);
    setIds(idsIn(claimed));
  }
  useFocusEffect(useCallback(() => () => setIds(new Set()), []));
  return ids;
}

function idsIn(claimed: string): ReadonlySet<string> {
  return new Set(claimed.split(',').filter(Boolean));
}

const styles = StyleSheet.create({
  head: { gap: 10 },
  empty: { gap: 14 },
});
