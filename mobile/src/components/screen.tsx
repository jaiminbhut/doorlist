import type { PropsWithChildren, ReactElement, Ref } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type RefreshControlProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenProps {
  /** Pull to refresh. */
  refreshControl?: ReactElement<RefreshControlProps>;
  /** The scroll view, for a screen that scrolls something into view. */
  ref?: Ref<ScrollView>;
}

/** A scrolling page on the lavender ground that keeps its fields above the keyboard. */
export function Screen({ children, refreshControl, ref }: PropsWithChildren<ScreenProps>) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={ref}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, gap: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
});
