import * as Brightness from 'expo-brightness';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { formatWhen } from '@/format';
import { displayType, size } from '@/theme';
import { QrCode } from './qr-code';
import { cachedTickets } from './ticket-cache';
import type { Ticket } from './tickets-api';

const PAPER_INK = '#221a3d';

/**
 * One ticket, full screen, for showing at the door: the biggest QR code the
 * screen allows, on white, with the brightness turned up until it closes.
 * It reads the ticket from the phone, so it opens offline too.
 */
export function TicketScreen({ owner, id }: { owner: string; id: string }) {
  const { width } = useWindowDimensions();
  // Insets from the root, not a SafeAreaView: inside an iOS full-screen modal,
  // SafeAreaView reports no top inset and the Done button lands under the clock.
  const insets = useSafeAreaInsets();
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    cachedTickets(owner).then(
      (cached) => current && setTicket(cached?.tickets.find((t) => t.id === id) ?? null),
      () => current && setTicket(null),
    );
    return () => {
      current = false;
    };
  }, [owner, id]);

  useFocusEffect(useCallback(() => brightenUntilBlur(), []));

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.done}
        >
          <Text variant="bold" style={styles.doneText}>
            Done
          </Text>
        </Pressable>
      </View>

      {ticket ? (
        <View style={styles.ticket}>
          <Text variant="bold" style={styles.when}>
            {formatWhen(ticket.startsAt)}
          </Text>
          <Text style={styles.event} accessibilityRole="header">
            {ticket.eventName}
          </Text>
          <Text style={styles.ink}>
            {ticket.venue} · {ticket.ticketTypeName}
          </Text>
          <View style={styles.qr}>
            <QrCode
              value={ticket.code}
              size={Math.min(width - 48, 380)}
              label={`QR code for your ${ticket.ticketTypeName} ticket to ${ticket.eventName}`}
            />
          </View>
          <Text style={styles.admit}>Admit one</Text>
        </View>
      ) : ticket === null ? (
        <Text style={[styles.ink, styles.missing]}>
          This ticket isn&apos;t on this phone any more. Go back and pull down to refresh.
        </Text>
      ) : null}
    </View>
  );
}

/** Full brightness while the ticket shows, then back to how it was. */
function brightenUntilBlur(): () => void {
  let previous: number | null = null;
  let left = false;
  Brightness.getBrightnessAsync()
    .then((level) => {
      previous = level;
      return left ? undefined : Brightness.setBrightnessAsync(1);
    })
    .catch(() => undefined);

  return () => {
    left = true;
    if (Platform.OS === 'android') {
      // Android changed only this screen's brightness; hand it back to the system.
      void Brightness.restoreSystemBrightnessAsync().catch(() => undefined);
    } else if (previous !== null) {
      void Brightness.setBrightnessAsync(previous).catch(() => undefined);
    }
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8 },
  done: { paddingVertical: 6 },
  doneText: { color: '#5b2bd0' },
  ticket: { flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: 24, paddingTop: 12 },
  when: { color: PAPER_INK, fontSize: size.small },
  event: {
    color: PAPER_INK,
    ...displayType(size.display, size.display * 1.02),
    textAlign: 'center',
  },
  ink: { color: PAPER_INK, textAlign: 'center' },
  qr: { marginTop: 18, marginBottom: 10 },
  admit: { color: PAPER_INK, ...displayType(size.title, 30) },
  missing: { padding: 24 },
});
