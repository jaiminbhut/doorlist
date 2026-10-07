import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { displayType, usePalette } from '@/theme';
import { Text } from './text';

/** The door mark and name, as in the web's header. */
export function Wordmark() {
  const palette = usePalette();
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Doorlist">
      <Svg width={18} height={24} viewBox="0 0 18 24">
        <Path d="M2 24V3a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v21z" fill={palette.stamp} />
        <Circle cx={12.5} cy={13} r={1.5} fill={palette.ground} />
      </Svg>
      <Text style={styles.name}>Doorlist</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: displayType(32, 34),
});
