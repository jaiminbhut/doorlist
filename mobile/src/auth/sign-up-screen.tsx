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
import { signUpErrors } from './auth-api';
import { BuildNote } from './build-note';
import { useSession } from './session-context';

/** Creates an attendee account, with the web's hints and the API's messages per field. */
export function SignUpScreen() {
  const palette = usePalette();
  const { signUp } = useSession();
  const emailInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const complete = displayName.trim() !== '' && email.trim() !== '' && password !== '';

  const submit = async () => {
    if (!complete || busy) {
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await signUp(displayName, email, password);
    } catch (failure) {
      setErrors(signUpErrors(failure));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Wordmark />
      <View style={styles.head}>
        <Text variant="display" accessibilityRole="header">
          Sign up
        </Text>
        <Text style={{ color: palette.inkSoft }}>
          Create an account for free tickets. Already have one?{' '}
          <Link href="/sign-in" style={[styles.link, { color: palette.stamp }]}>
            Sign in
          </Link>
          .
        </Text>
      </View>

      <View style={styles.form}>
        <Field
          testID="sign-up-name"
          label="Your name"
          hint="Door staff see it when they check your ticket."
          errors={errors.displayName}
          value={displayName}
          onChangeText={setDisplayName}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailInput.current?.focus()}
          submitBehavior="submit"
        />
        <Field
          ref={emailInput}
          testID="sign-up-email"
          label="Email"
          errors={errors.email}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordInput.current?.focus()}
          submitBehavior="submit"
        />
        <Field
          ref={passwordInput}
          testID="sign-up-password"
          label="Password"
          hint="At least 12 characters, with upper and lower case, a number and a symbol."
          errors={errors.password}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button
          testID="sign-up-submit"
          label="Sign up"
          busyLabel="Signing up…"
          busy={busy}
          disabled={!complete}
          onPress={submit}
        />
        {(errors[''] ?? []).map((message) => (
          <ErrorText key={message}>{message}</ErrorText>
        ))}
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
