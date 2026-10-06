import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './colors';

export { dark, light, type Palette } from './colors';
export { fonts, radius, size } from './type';

/** The palette for the system's light or dark setting. */
export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
