import type { Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { fonts, radius, size, usePalette } from '@/theme';
import { ErrorText } from './error-text';
import { Text } from './text';

interface FieldProps extends TextInputProps {
  ref?: Ref<TextInput>;
  label: string;
  hint?: string;
  errors?: string[];
}

/** A labelled text input, with a hint and the API's messages for it. */
export function Field({ ref, label, hint, errors = [], style, ...input }: FieldProps) {
  const palette = usePalette();
  const invalid = errors.length > 0;

  return (
    <View style={styles.field}>
      <Text variant="bold">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={palette.inkSoft}
        style={[
          styles.input,
          {
            backgroundColor: palette.paper,
            borderColor: invalid ? palette.danger : palette.line,
            color: palette.ink,
          },
          style,
        ]}
        {...input}
      />
      {hint ? <Text style={[styles.hint, { color: palette.inkSoft }]}>{hint}</Text> : null}
      {errors.map((message) => (
        <ErrorText key={message}>{message}</ErrorText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderRadius: radius.control,
    fontFamily: fonts.text,
    fontSize: size.body,
  },
  hint: { fontSize: size.small, lineHeight: size.small * 1.45 },
});
