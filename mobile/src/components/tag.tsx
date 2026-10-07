import type { ColorValue } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { size } from '@/theme';
import { Text } from './text';

/** A small outlined label in one colour, like the web's .tag ("Sold out"). */
export function Tag({ children, color }: { children: string; color: ColorValue }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text variant="bold" style={[styles.text, { color }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, borderWidth: 2, borderRadius: 6 },
  text: { fontSize: size.small, lineHeight: size.small * 1.5 },
});
