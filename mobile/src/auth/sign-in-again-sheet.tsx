import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Button } from '@/components/button';
import { ErrorText } from '@/components/error-text';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { usePalette } from '@/theme';
import { signInMessage } from './auth-api';
import { useSession } from './session-context';

interface SignInAgainSheetProps {
  visible: boolean;
  /** What stays safe while signed out, e.g. "Your saved tickets stay on this phone." */
  reassurance: string;
  onClose(): void;
}

/**
 * Asks for the password again when the token has expired (ADR 9). Unlike
 * signing out, it keeps everything on the phone: cached tickets, a door's
 * queue. It's always the same account.
 */
export function SignInAgainSheet({ visible, reassurance, onClose }: SignInAgainSheetProps) {
  const palette = usePalette();
  const { session, signInAgain } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!password || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signInAgain(password);
      setBusy(false);
      close();
    } catch (failure) {
      setError(signInMessage(failure));
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={[styles.sheet, { backgroundColor: palette.ground }]}>
        <Screen>
          <View style={styles.head}>
            <Text variant="display" accessibilityRole="header">
              Sign in again
            </Text>
            <Text style={{ color: palette.inkSoft }}>Your session has expired. {reassurance}</Text>
          </View>
          <View style={styles.form}>
            <Text>
              Signed in as <Text variant="bold">{session?.user.email}</Text>
            </Text>
            <Field
              testID="sign-in-again-password"
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoFocus
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            <Button
              testID="sign-in-again-submit"
              label="Sign in"
              busyLabel="Signing in…"
              busy={busy}
              disabled={!password}
              onPress={submit}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button kind="secondary" label="Not now" onPress={close} />
          </View>
        </Screen>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingTop: 16 },
  head: { gap: 10 },
  form: { gap: 18 },
});
