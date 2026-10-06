import { Text as NativeText, StyleSheet, type TextProps } from 'react-native';
import { fonts, size, usePalette } from '@/theme';

type Variant = 'body' | 'bold' | 'display';

/** Text in Doorlist's faces and ink. React Native doesn't inherit fonts, so every text uses this. */
export function Text({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  const palette = usePalette();
  return <NativeText {...props} style={[styles[variant], { color: palette.ink }, style]} />;
}

const styles = StyleSheet.create({
  body: { fontFamily: fonts.text, fontSize: size.body, lineHeight: size.body * 1.55 },
  bold: { fontFamily: fonts.textBold, fontSize: size.body, lineHeight: size.body * 1.55 },
  display: { fontFamily: fonts.display, fontSize: size.display, lineHeight: size.display * 0.95 },
});
