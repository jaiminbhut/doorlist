import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import { Button } from '@/components/button';
import { ErrorText } from '@/components/error-text';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { size, usePalette } from '@/theme';
import { signInMessage } from './auth-api';
import { BuildNote } from './build-note';
import { useSession } from './session-context';

export function SignInScreen() {
  const palette = usePalette();
  const { signIn } = useSession();
  const passwordInput = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // On success the session changes, and the router leaves this screen.
      await signIn(email, password);
    } catch (failure) {
      setError(signInMessage(failure));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Wordmark />
      <View style={styles.head}>
        <Text variant="display" accessibilityRole="header">
          Sign in
        </Text>
        <Text style={{ color: palette.inkSoft }}>
          New here?{' '}
          <Link href="/sign-up" style={[styles.link, { color: palette.stamp }]}>
            Sign up
          </Link>{' '}
          to get tickets.
        </Text>
      </View>

      <View style={styles.form}>
        <Field
          testID="sign-in-email"
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordInput.current?.focus()}
          submitBehavior="submit"
        />
        <Field
          ref={passwordInput}
          testID="sign-in-password"
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button
          testID="sign-in-submit"
          label="Sign in"
          busyLabel="Signing in…"
          busy={busy}
          disabled={!email.trim() || !password}
          onPress={submit}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
      </View>

      <BuildNote />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 10 },
  form: { gap: 18 },
  link: { textDecorationLine: 'underline', fontSize: size.body },
});
