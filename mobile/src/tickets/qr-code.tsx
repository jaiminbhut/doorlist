import QRCode from 'qrcode';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

const MARGIN = 1;

/**
 * A ticket code as a QR code, drawn with the same library and settings as the
 * web (error correction M, a one-module margin), so the two scan the same.
 * Always dark on white, whatever the theme: scanners need the contrast.
 */
export function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const { path, modules } = useMemo(() => qrPath(value), [value]);
  const extent = modules + MARGIN * 2;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Rect width={extent} height={extent} fill="#ffffff" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}

/** One SVG path for every dark module, drawn as horizontal runs to keep it short. */
export function qrPath(value: string): { path: string; modules: number } {
  const { size, data } = QRCode.create(value, { errorCorrectionLevel: 'M' }).modules;
  let path = '';
  for (let row = 0; row < size; row++) {
    let column = 0;
    while (column < size) {
      if (!data[row * size + column]) {
        column++;
        continue;
      }
      const start = column;
      while (column < size && data[row * size + column]) {
        column++;
      }
      path += `M${start + MARGIN} ${row + MARGIN}h${column - start}v1h-${column - start}z`;
    }
  }
  return { path, modules: size };
}
