import type { PropsWithChildren } from 'react';
import { usePalette } from '@/theme';
import { Text } from './text';

/** An error, announced by screen readers when it appears. */
export function ErrorText({ children }: PropsWithChildren) {
  const palette = usePalette();
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ color: palette.danger }}
    >
      {children}
    </Text>
  );
}
