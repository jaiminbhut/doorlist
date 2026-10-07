import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { ApiError, ApiUnreachableError } from '@/api/client';
import { isAttendee, type Session } from '@/auth/session';
import { SignInAgainSheet } from '@/auth/sign-in-again-sheet';
import { Button } from '@/components/button';
import { ErrorText } from '@/components/error-text';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Tag } from '@/components/tag';
import { Text } from '@/components/text';
import { formatTime, formatWhen } from '@/format';
import { addTickets } from '@/tickets/ticket-cache';
import { claimTickets, MAX_TICKETS_PER_ATTENDEE } from '@/tickets/tickets-api';
import { displayType, radius, size, usePalette } from '@/theme';
import { claimMessage } from './claim-message';
import { getEvent, type DoorlistEvent, type TicketType } from './events-api';

type Problem = 'notFound' | 'offline' | 'failed';

const quantities = Array.from({ length: MAX_TICKETS_PER_ATTENDEE }, (_, i) => i + 1);

/**
 * An event, and claiming its tickets, as on the web's event page: pick a
 * ticket type and how many, up to 4 per event (ADR 7). The API has the last
 * word on what's left and on the limit, and its reasons are shown as it
 * gives them. New tickets go straight to the phone, then to My tickets.
 */
export function EventScreen({ id, session }: { id: number; session: Session }) {
  const palette = usePalette();
  const attendee = isAttendee(session.user);
  const [event, setEvent] = useState<DoorlistEvent | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  /** The token the API refused: a fresh sign-in replaces it, which ends the expired state. */
  const [refusedToken, setRefusedToken] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const load = useCallback(() => {
    let current = true;
    getEvent(id).then(
      (loaded) => {
        if (!current) {
          return;
        }
        setEvent(loaded);
        setProblem(null);
        setRefreshing(false);
        // Keep the choice while it has tickets left; otherwise the first type that has.
        setTypeId((chosen) =>
          loaded.ticketTypes.some((type) => type.id === chosen && type.remaining > 0)
            ? chosen
            : (loaded.ticketTypes.find((type) => type.remaining > 0)?.id ?? null),
        );
      },
      (error: unknown) => {
        if (!current) {
          return;
        }
        setProblem(
          error instanceof ApiError && error.status === 404
            ? 'notFound'
            : error instanceof ApiUnreachableError
              ? 'offline'
              : 'failed',
        );
        setRefreshing(false);
      },
    );
    return () => {
      current = false;
    };
  }, [id]);

  // Each time the event comes into view, so what's left is current.
  useFocusEffect(load);

  const type = event?.ticketTypes.find((candidate) => candidate.id === typeId) ?? null;
  const most = type ? Math.min(MAX_TICKETS_PER_ATTENDEE, type.remaining) : 0;
  const count = Math.min(quantity, Math.max(most, 1));
  const expired = refusedToken === session.accessToken;

  const claim = async () => {
    if (!event || !type || claiming) {
      return;
    }
    setClaiming(true);
    setClaimError(null);
    try {
      const tickets = await claimTickets(event.id, session.accessToken, type.id, count);
      await addTickets(session.user.email, tickets, new Date().toISOString()).catch(
        () => undefined,
      );
      setClaiming(false);
      setQuantity(1);
      router.navigate({
        pathname: '/tickets',
        params: { claimed: tickets.map((ticket) => ticket.id).join(',') },
      });
    } catch (error) {
      setClaiming(false);
      if (error instanceof ApiError && error.status === 401) {
        setRefusedToken(session.accessToken);
      } else {
        setClaimError(claimMessage(error));
      }
    }
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={palette.stamp}
          colors={[palette.stamp]}
        />
      }
    >
      <Pressable
        accessibilityRole="link"
        hitSlop={10}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/events'))}
      >
        <Text variant="bold" style={[styles.back, { color: palette.inkSoft }]}>
          ← All events
        </Text>
      </Pressable>

      {!event ? (
        problem === 'notFound' ? (
          <ErrorText>This event does not exist.</ErrorText>
        ) : problem === 'offline' ? (
          <Notice>
            <Text style={{ color: palette.noticeInk }}>
              Can&apos;t reach Doorlist. Pull down to try again once you&apos;re connected.
            </Text>
          </Notice>
        ) : problem === 'failed' ? (
          <ErrorText>Could not load this event. Pull down to try again.</ErrorText>
        ) : (
          <Text style={{ color: palette.inkSoft }}>Loading…</Text>
        )
      ) : (
        <>
          <View style={styles.poster}>
            <Text variant="bold" style={{ color: palette.stamp }}>
              {formatWhen(event.startsAt)} to {formatTime(event.endsAt)}
            </Text>
            <Text accessibilityRole="header" style={styles.name}>
              {event.name}
            </Text>
            <Text style={styles.venue}>{event.venue}</Text>
          </View>

          {event.description ? <Text>{event.description}</Text> : null}

          {problem ? (
            <Notice>
              <Text style={{ color: palette.noticeInk }}>
                Couldn&apos;t update this event. Pull down to try again.
              </Text>
            </Notice>
          ) : null}

          <View
            style={[styles.panel, { backgroundColor: palette.paper, borderColor: palette.line }]}
          >
            <Text variant="bold" accessibilityRole="header" style={styles.panelHeading}>
              Tickets
            </Text>
            <View accessibilityRole={attendee ? 'radiogroup' : undefined}>
              {event.ticketTypes.map((ticketType) => (
                <TicketTypeRow
                  key={ticketType.id}
                  type={ticketType}
                  choosable={attendee}
                  chosen={ticketType.id === typeId}
                  onChoose={() => setTypeId(ticketType.id)}
                />
              ))}
            </View>

            {attendee ? (
              <View style={styles.claim}>
                <Text variant="bold">How many</Text>
                <View accessibilityRole="radiogroup" style={styles.quantities}>
                  {quantities.map((n) => {
                    const chosen = n === count && most > 0;
                    const unavailable = n > most;
                    return (
                      <Pressable
                        key={n}
                        accessibilityRole="radio"
                        accessibilityLabel={n === 1 ? '1 ticket' : `${n} tickets`}
                        accessibilityState={{ checked: chosen, disabled: unavailable }}
                        disabled={unavailable}
                        onPress={() => setQuantity(n)}
                        style={[
                          styles.quantity,
                          chosen
                            ? { backgroundColor: palette.stamp, borderColor: palette.stamp }
                            : { borderColor: palette.line },
                          { opacity: unavailable ? 0.4 : 1 },
                        ]}
                      >
                        <Text
                          variant="bold"
                          style={{ color: chosen ? palette.onStamp : palette.ink }}
                        >
                          {n}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Button
                  testID="claim"
                  label="Get tickets"
                  busyLabel="Claiming…"
                  busy={claiming}
                  disabled={!type}
                  onPress={() => void claim()}
                />
                {claimError ? <ErrorText>{claimError}</ErrorText> : null}
                {expired ? (
                  <Notice>
                    <Text style={{ color: palette.noticeInk }}>
                      Your session has expired, so nothing was claimed. Sign in again, then get your
                      tickets.
                    </Text>
                    <Button label="Sign in again" onPress={() => setSigningIn(true)} />
                  </Notice>
                ) : null}
              </View>
            ) : null}
          </View>
        </>
      )}

      <SignInAgainSheet
        visible={signingIn}
        reassurance="Nothing was claimed. Sign in, then get your tickets."
        onClose={() => setSigningIn(false)}
      />
    </Screen>
  );
}

interface TicketTypeRowProps {
  type: TicketType;
  /** Attendees choose a type to claim; anyone else just sees what's left. */
  choosable: boolean;
  chosen: boolean;
  onChoose(): void;
}

function TicketTypeRow({ type, choosable, chosen, onChoose }: TicketTypeRowProps) {
  const palette = usePalette();
  const soldOut = type.remaining === 0;
  const left = `${type.remaining} of ${type.capacity} left`;

  return (
    <Pressable
      accessibilityRole={choosable ? 'radio' : undefined}
      accessibilityLabel={`${type.name}, ${soldOut ? 'sold out' : left}`}
      accessibilityState={choosable ? { checked: chosen, disabled: soldOut } : undefined}
      disabled={!choosable || soldOut}
      onPress={onChoose}
      style={[styles.type, { borderTopColor: palette.line }]}
    >
      {choosable ? (
        <View style={[styles.radio, { borderColor: soldOut ? palette.line : palette.stamp }]}>
          {chosen ? <View style={[styles.radioDot, { backgroundColor: palette.stamp }]} /> : null}
        </View>
      ) : null}
      <Text variant="bold" style={[styles.typeName, { opacity: soldOut ? 0.6 : 1 }]}>
        {type.name}
      </Text>
      {soldOut ? (
        <Tag color={palette.danger}>Sold out</Tag>
      ) : (
        <Text style={[styles.typeLeft, { color: palette.inkSoft }]}>{left}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { fontSize: size.small },
  poster: { gap: 6 },
  name: displayType(size.poster, size.poster * 0.95),
  venue: { fontSize: size.large },
  panel: {
    gap: 4,
    padding: 18,
    borderWidth: 1,
    borderRadius: radius.surface,
  },
  panelHeading: { fontSize: size.large, marginBottom: 8 },
  type: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderTopWidth: 1,
  },
  radio: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 11,
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  typeName: { flex: 1 },
  typeLeft: { fontSize: size.small },
  claim: { gap: 12, marginTop: 12 },
  quantities: { flexDirection: 'row', gap: 10 },
  quantity: {
    width: 52,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: radius.control,
  },
});
