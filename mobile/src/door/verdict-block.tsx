import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { useReducedMotion } from '@/components/use-reduced-motion';
import { displayType, radius, size, usePalette } from '@/theme';
import { toneOf, wordsFor, type Tone, type Verdict } from './verdict';

const feel: Record<Tone, Haptics.NotificationFeedbackType> = {
  good: Haptics.NotificationFeedbackType.Success,
  bad: Haptics.NotificationFeedbackType.Error,
  warn: Haptics.NotificationFeedbackType.Warning,
};

/**
 * The verdict as a big block of colour that reads from arm's length, as on
 * the web. The word says the decision too, so colour is never the only
 * signal, and each verdict is felt (haptics) and announced to screen readers.
 * It lands like a stamp, quickly, unless the system asks for less motion.
 */
export function VerdictBlock({
  verdict,
  onSignInAgain,
}: {
  verdict: Verdict | null;
  onSignInAgain(): void;
}) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const [landing] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!verdict) {
      return;
    }
    const { decision, reason } = wordsFor(verdict);
    AccessibilityInfo.announceForAccessibility(`${decision}. ${reason}`);
    void Haptics.notificationAsync(feel[toneOf(verdict)]).catch(() => undefined);
    if (!reducedMotion) {
      landing.setValue(0);
      Animated.timing(landing, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [verdict, reducedMotion, landing]);

  if (!verdict) {
    return (
      <View style={[styles.block, styles.ready, { borderColor: palette.consoleLine }]}>
        <Text style={[styles.reason, { color: palette.consoleSoft }]}>
          Ready for the first ticket.
        </Text>
      </View>
    );
  }

  const tone = toneOf(verdict);
  const { decision, reason } = wordsFor(verdict);
  const background = { good: palette.admit, bad: palette.refuse, warn: palette.hold }[tone];
  const ink = tone === 'warn' ? palette.onHold : '#ffffff';

  return (
    <Animated.View
      testID="verdict"
      style={[
        styles.block,
        { backgroundColor: background },
        {
          opacity: landing.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
          transform: [
            { scale: landing.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) },
          ],
        },
      ]}
    >
      <Text style={[styles.decision, { color: ink }]}>{decision}</Text>
      <Text variant="bold" style={[styles.reason, { color: ink }]}>
        {reason}
      </Text>
      {verdict.kind === 'error' && verdict.signInAgain ? (
        <View style={styles.action}>
          <Button kind="secondary" label="Sign in again" onPress={onSignInAgain} />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  block: {
    justifyContent: 'center',
    gap: 6,
    minHeight: 160,
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: radius.surface,
  },
  ready: { borderWidth: 2, borderStyle: 'dashed' },
  decision: displayType(64, 68),
  reason: { fontSize: size.large, lineHeight: size.large * 1.35 },
  action: { marginTop: 10, alignSelf: 'flex-start' },
});
