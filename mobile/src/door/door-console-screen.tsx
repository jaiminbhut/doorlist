import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@/auth/session';
import { SignInAgainSheet } from '@/auth/sign-in-again-sheet';
import { Text } from '@/components/text';
import { fonts, radius, size, usePalette } from '@/theme';
import { CameraScanner } from './camera-scanner';
import { ScanLock } from './scan-lock';
import { useDoorConsole } from './use-door-console';
import { VerdictBlock } from './verdict-block';

/**
 * The door console: dark in both themes, like the venues it works in. The
 * camera reads codes; the field takes typed or pasted codes and Bluetooth
 * scanners, which type like a keyboard. The screen stays awake while it's open.
 */
export function DoorConsoleScreen({
  session,
  eventId,
  eventName,
}: {
  session: Session;
  eventId: number;
  eventName: string | undefined;
}) {
  useKeepAwake();
  const palette = usePalette();
  const door = useDoorConsole(eventId, session);
  const [lock] = useState(() => new ScanLock());
  const [code, setCode] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const submit = () => {
    const typed = code;
    setCode('');
    void door.check(typed);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.console }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="link" onPress={() => router.back()} hitSlop={10}>
          <Text variant="bold" style={[styles.back, { color: palette.consoleStamp }]}>
            ← Change event
          </Text>
        </Pressable>

        <View>
          <Text style={[styles.event, { color: palette.consoleInk }]} accessibilityRole="header">
            {eventName ?? 'Check-in'}
          </Text>
          <Text variant="bold" style={{ color: palette.consoleSoft }}>
            {door.doorName || 'Unnamed door'}
          </Text>
        </View>

        {/*
          The field, then the verdict, then the camera: with the keyboard up, the
          field and the verdict both stay in view; scanning with the camera, the
          verdict sits right above it.
        */}
        <View style={styles.manual}>
          <Text variant="bold" style={[styles.label, { color: palette.consoleSoft }]}>
            Scan or paste a ticket code
          </Text>
          <View style={styles.row}>
            <TextInput
              testID="door-code"
              accessibilityLabel="Ticket code"
              value={code}
              onChangeText={setCode}
              onSubmitEditing={submit}
              submitBehavior="submit"
              returnKeyType="go"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              style={[
                styles.input,
                {
                  backgroundColor: palette.consoleRaised,
                  borderColor: palette.consoleLine,
                  color: palette.consoleInk,
                },
              ]}
            />
            <Pressable
              testID="door-check"
              accessibilityRole="button"
              accessibilityState={{ disabled: door.checking }}
              disabled={door.checking}
              onPress={submit}
              style={({ pressed }) => [
                styles.check,
                {
                  backgroundColor: palette.consoleStamp,
                  opacity: pressed || door.checking ? 0.7 : 1,
                },
              ]}
            >
              <Text variant="bold" style={{ color: palette.onConsoleStamp }}>
                Check
              </Text>
            </Pressable>
          </View>
        </View>

        <VerdictBlock verdict={door.verdict} onSignInAgain={() => setSigningIn(true)} />

        <CameraScanner onCode={(scanned) => lock.accept(scanned) && void door.check(scanned)} />

        {door.summary ? (
          <View style={styles.tally}>
            <Text style={{ color: palette.consoleSoft }}>
              <Text style={[styles.count, { color: palette.consoleInk }]}>
                {door.summary.admitted}
              </Text>{' '}
              of {door.summary.issued} admitted
            </Text>
            <Text style={{ color: palette.consoleSoft }}>
              {door.summary.duplicates} already used
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <SignInAgainSheet
        visible={signingIn}
        reassurance="This door's event and its scans stay on this phone."
        onClose={() => setSigningIn(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 20, padding: 20, paddingBottom: 40 },
  back: { fontSize: size.small },
  event: { fontFamily: fonts.display, fontSize: size.display, lineHeight: size.display },
  manual: { gap: 8 },
  label: { fontSize: size.small },
  row: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderRadius: radius.control,
    fontFamily: fonts.text,
    fontSize: size.large,
  },
  check: {
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 20,
    borderRadius: radius.control,
  },
  tally: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 24 },
  count: { fontFamily: fonts.display, fontSize: size.title },
});
