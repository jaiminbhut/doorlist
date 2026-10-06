import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Text } from '@/components/text';
import { formatWhen } from '@/format';
import { fonts, size, usePalette } from '@/theme';
import { QrCode } from './qr-code';
import type { Ticket } from './tickets-api';

const NOTCH = 12;

/** Dark ink on the white stub in both themes, as on the web: the stub is paper, not UI. */
const STUB_INK = '#221a3d';

/**
 * A paper ticket, as on the web's phone layout: the event on violet, and a
 * white stub with the QR code below a perforated seam, notched at both ends.
 */
export function TicketStub({ ticket, onPress }: { ticket: Ticket; onPress(): void }) {
  const palette = usePalette();
  const when = formatWhen(ticket.startsAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ticket.ticketTypeName} ticket for ${ticket.eventName}, ${when}, ${ticket.venue}`}
      accessibilityHint="Shows the QR code full screen"
      onPress={onPress}
      style={({ pressed }) => [styles.ticket, { opacity: pressed ? 0.92 : 1 }]}
    >
      <View style={[styles.body, { backgroundColor: palette.stamp }]}>
        <Text variant="bold" style={[styles.when, { color: palette.onStamp }]}>
          {when}
        </Text>
        <Text style={[styles.event, { color: palette.onStamp }]}>{ticket.eventName}</Text>
        <Text style={{ color: palette.onStamp }}>{ticket.venue}</Text>
        <Text variant="bold" style={[styles.type, { color: palette.onStamp }]}>
          {ticket.ticketTypeName}
        </Text>
      </View>

      <View style={styles.stub}>
        <Svg style={styles.perforation} height={6} width="100%">
          <Line
            x1={8}
            y1={3}
            x2="100%"
            y2={3}
            stroke={palette.ground}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray="0.01 12"
          />
        </Svg>
        <View style={[styles.notch, styles.notchLeft, { backgroundColor: palette.ground }]} />
        <View style={[styles.notch, styles.notchRight, { backgroundColor: palette.ground }]} />
        <QrCode
          value={ticket.code}
          size={200}
          label={`QR code for your ${ticket.ticketTypeName} ticket to ${ticket.eventName}`}
        />
        <Text style={styles.admit}>Admit one</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ticket: { overflow: 'hidden', borderRadius: 16 },
  body: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 20 },
  when: { marginBottom: 10, fontSize: size.small },
  event: { fontFamily: fonts.display, fontSize: size.display, lineHeight: size.display * 1.02 },
  type: { marginTop: 18 },
  stub: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 22,
    paddingBottom: 18,
    backgroundColor: '#ffffff',
  },
  perforation: { position: 'absolute', top: 0, left: 0, right: 0 },
  notch: {
    position: 'absolute',
    top: -NOTCH,
    width: NOTCH * 2,
    height: NOTCH * 2,
    borderRadius: NOTCH,
  },
  notchLeft: { left: -NOTCH },
  notchRight: { right: -NOTCH },
  admit: { color: STUB_INK, fontFamily: fonts.display, fontSize: size.large, lineHeight: 22 },
});
