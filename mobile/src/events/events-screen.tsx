import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { ApiUnreachableError } from '@/api/client';
import { AccountBar } from '@/auth/account-bar';
import { ErrorText } from '@/components/error-text';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Tag } from '@/components/tag';
import { Text } from '@/components/text';
import { size, usePalette } from '@/theme';
import { listEvents, remaining, type DoorlistEvent } from './events-api';
import { Lineup, LineupRow } from './lineup';

type Problem = 'offline' | 'failed';

/** Upcoming events, as on the web's Events page. Claiming happens on each event's screen. */
export function EventsScreen() {
  const palette = usePalette();
  const [events, setEvents] = useState<DoorlistEvent[] | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    let current = true;
    listEvents().then(
      (upcoming) => {
        if (current) {
          setEvents(upcoming);
          setProblem(null);
          setRefreshing(false);
        }
      },
      (error: unknown) => {
        if (current) {
          setProblem(error instanceof ApiUnreachableError ? 'offline' : 'failed');
          setRefreshing(false);
        }
      },
    );
    return () => {
      current = false;
    };
  }, []);

  // Each time Events comes into view, so what's left is current after a claim.
  useFocusEffect(load);

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
      <AccountBar />
      <View style={styles.head}>
        <Text variant="display" accessibilityRole="header">
          Upcoming events
        </Text>
        <Text style={{ color: palette.inkSoft }}>
          Free tickets. Claim one, and show its QR code at the door.
        </Text>
      </View>

      {problem === 'offline' ? (
        <Notice>
          <Text style={{ color: palette.noticeInk }}>
            {events
              ? 'Offline. These events may be out of date, and claiming tickets needs a connection.'
              : "Can't reach Doorlist. Pull down to try again once you're connected."}
          </Text>
        </Notice>
      ) : problem === 'failed' ? (
        <ErrorText>Could not load events. Pull down to try again.</ErrorText>
      ) : null}

      {!events ? (
        problem ? null : (
          <Text style={{ color: palette.inkSoft }}>Loading events…</Text>
        )
      ) : events.length === 0 ? (
        <Text style={{ color: palette.inkSoft }}>No upcoming events yet. Check back soon.</Text>
      ) : (
        <Lineup>
          {events.map((event) => {
            const left = remaining(event);
            return (
              <LineupRow
                key={event.id}
                event={event}
                onPress={() =>
                  router.push({ pathname: '/events/[id]', params: { id: String(event.id) } })
                }
                detail={
                  left > 0 ? (
                    <Text variant="bold" style={styles.left}>
                      {left} left
                    </Text>
                  ) : (
                    <Tag color={palette.danger}>Sold out</Tag>
                  )
                }
                detailLabel={left > 0 ? `${left} left` : 'sold out'}
              />
            );
          })}
        </Lineup>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 10 },
  left: { marginTop: 2, fontSize: size.small },
});
