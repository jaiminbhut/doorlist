import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { formatDayAndMonth, formatWeekdayTime } from '@/format';
import { displayType, size, usePalette } from '@/theme';
import type { DoorlistEvent } from './events-api';

/** Events listed like a venue's lineup, as on the web: the door picker and Events use it. */
export function Lineup({ children }: PropsWithChildren) {
  const palette = usePalette();
  return <View style={[styles.lineup, { borderTopColor: palette.line }]}>{children}</View>;
}

interface LineupRowProps {
  event: DoorlistEvent;
  onPress(): void;
  /** A line under the venue and time, such as how many tickets are left. */
  detail?: ReactNode;
  /** The detail in words, for screen readers. */
  detailLabel?: string;
}

/** One event: the day big, then its name, venue and time. */
export function LineupRow({ event, onPress, detail, detailLabel }: LineupRowProps) {
  const palette = usePalette();
  const { day, month } = formatDayAndMonth(event.startsAt);
  const when = formatWeekdayTime(event.startsAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[event.name, event.venue, when, detailLabel].filter(Boolean).join(', ')}
      onPress={onPress}
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
          {event.venue}, {when}
        </Text>
        {detail}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lineup: { borderTopWidth: 1 },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  date: { width: 52, alignItems: 'center' },
  day: displayType(size.display, size.display),
  month: { fontSize: size.small, textTransform: 'uppercase', letterSpacing: 1 },
  what: { flex: 1, gap: 2 },
  name: displayType(size.title, size.title * 1.05),
  meta: { fontSize: size.small },
});
