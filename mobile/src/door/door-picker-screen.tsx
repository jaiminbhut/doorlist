import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { AccountBar } from '@/auth/account-bar';
import { ErrorText } from '@/components/error-text';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { listEvents, type DoorlistEvent } from '@/events/events-api';
import { formatDayAndMonth, formatWeekdayTime } from '@/format';
import { fonts, size, usePalette } from '@/theme';
import { doorName, setDoorName } from './door-device';

/** Picks the event to check tickets for, and names this door, as on the web. */
export function DoorPickerScreen() {
  const palette = usePalette();
  const [name, setName] = useState('');
  const [events, setEvents] = useState<DoorlistEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    doorName().then(
      (saved) => current && setName(saved),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    listEvents().then(
      (upcoming) => {
        if (current) {
          setEvents(upcoming);
          setFailed(false);
          setRefreshing(false);
        }
      },
      () => {
        if (current) {
          setFailed(true);
          setRefreshing(false);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  const open = async (event: DoorlistEvent) => {
    await setDoorName(name).catch(() => undefined);
    router.push({
      pathname: '/door/[eventId]',
      params: { eventId: String(event.id), name: event.name },
    });
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            setAttempt((count) => count + 1);
          }}
          tintColor={palette.stamp}
          colors={[palette.stamp]}
        />
      }
    >
      <AccountBar />
      <View style={styles.head}>
        <Text variant="display" accessibilityRole="header">
          Door
        </Text>
        <Text style={{ color: palette.inkSoft }}>
          Pick the event you&apos;re checking tickets for. This phone keeps working if the
          connection drops.
        </Text>
      </View>

      <Field
        testID="door-name"
        label="This door"
        hint="Shown when a ticket is refused, so other doors know where it was used."
        placeholder="North door"
        maxLength={50}
        value={name}
        onChangeText={setName}
        onEndEditing={() => void setDoorName(name).catch(() => undefined)}
        returnKeyType="done"
      />

      {failed && !events ? (
        <ErrorText>Could not load events. Pull down to try again.</ErrorText>
      ) : !events ? (
        <Text style={{ color: palette.inkSoft }}>Loading events…</Text>
      ) : events.length === 0 ? (
        <Text style={{ color: palette.inkSoft }}>No upcoming events to check tickets for.</Text>
      ) : (
        <View style={[styles.lineup, { borderTopColor: palette.line }]}>
          {events.map((event) => {
            const { day, month } = formatDayAndMonth(event.startsAt);
            return (
              <Pressable
                key={event.id}
                accessibilityRole="button"
                accessibilityLabel={`${event.name}, ${event.venue}, ${formatWeekdayTime(event.startsAt)}`}
                onPress={() => void open(event)}
                style={({ pressed }) => [
                  styles.event,
                  { borderBottomColor: palette.line, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={styles.date}>
                  <Text style={[styles.day, { color: palette.stamp }]}>{day}</Text>
                  <Text variant="bold" style={[styles.month, { color: palette.stamp }]}>
                    {month}
                  </Text>
                </View>
                <View style={styles.what}>
                  <Text style={styles.name}>{event.name}</Text>
                  <Text style={[styles.meta, { color: palette.inkSoft }]}>
                    {event.venue}, {formatWeekdayTime(event.startsAt)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 10 },
  lineup: { borderTopWidth: 1 },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  date: { width: 52, alignItems: 'center' },
  day: { fontFamily: fonts.display, fontSize: size.display, lineHeight: size.display },
  month: { fontSize: size.small, textTransform: 'uppercase', letterSpacing: 1 },
  what: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.display, fontSize: size.title, lineHeight: size.title * 1.05 },
  meta: { fontSize: size.small },
});
