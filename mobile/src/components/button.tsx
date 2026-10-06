import { Pressable, StyleSheet } from 'react-native';
import { radius, usePalette } from '@/theme';
import { Text } from './text';

interface ButtonProps {
  label: string;
  onPress(): void;
  kind?: 'primary' | 'secondary';
  disabled?: boolean;
  /** Shown instead of the label while the action runs. */
  busyLabel?: string;
  busy?: boolean;
  testID?: string;
}

/** A stamp-violet button, as on the web: filled for the main action, outlined for the rest. */
export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled = false,
  busy = false,
  busyLabel,
  testID,
}: ButtonProps) {
  const palette = usePalette();
  const primary = kind === 'primary';
  const inactive = disabled || busy;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: palette.stamp, borderColor: palette.stamp }
          : { borderColor: palette.stamp },
        { opacity: inactive ? 0.55 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text variant="bold" style={{ color: primary ? palette.onStamp : palette.stamp }}>
        {busy && busyLabel ? busyLabel : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderRadius: radius.control,
  },
});
