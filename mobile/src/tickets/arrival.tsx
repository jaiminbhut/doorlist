import { useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Animated, Easing, type ViewProps } from 'react-native';

/**
 * A ticket just claimed comes out like a ticket from a dispenser, as on the
 * web: a short drop into place, after `delay` so a few arrive one by one.
 * It asks about reduced motion itself, so nothing shows and then jumps while
 * the answer is still coming; with less motion asked for, it simply appears.
 */
export function Arrival({
  delay,
  onLayout,
  children,
}: PropsWithChildren<{ delay: number; onLayout?: ViewProps['onLayout'] }>) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let current = true;
    const appear = () => current && progress.setValue(1);
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!current) {
        return;
      }
      if (reduced) {
        appear();
      } else {
        Animated.timing(progress, {
          toValue: 1,
          duration: 460,
          delay,
          easing: Easing.bezier(0.2, 0.8, 0.2, 1),
          useNativeDriver: true,
        }).start();
      }
    }, appear);
    return () => {
      current = false;
    };
  }, [delay, progress]);

  return (
    <Animated.View
      onLayout={onLayout}
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
