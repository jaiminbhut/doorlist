import QRCode from 'qrcode';
import { qrPath } from './qr-code';

// A real code's shape: about 120 characters (ADR 7).
const code =
  'DL1.AZmhsgAAcACAAAAAAAAAAQAAAAw.' +
  'MEUCIQDx3k2qkS9u0uLr0n5sVJm2v2l3T0f0d8mYQkq8Yc0zPwIgV8m1rT3t9z0b1u2v3w4x5y6z7A8B9C0D1E2F3G4H5I';

/** The dark cells a path draws, as "column,row", read back from its runs. */
function cells(path: string): Set<string> {
  const drawn = new Set<string>();
  for (const [, x, y, width] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let column = 0; column < Number(width); column++) {
      drawn.add(`${Number(x) + column},${y}`);
    }
  }
  return drawn;
}

describe('qrPath', () => {
  it('draws exactly the dark modules, inside a one-module margin', () => {
    const { size, data } = QRCode.create(code, { errorCorrectionLevel: 'M' }).modules;
    const expected = new Set<string>();
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        if (data[row * size + column]) {
          expected.add(`${column + 1},${row + 1}`);
        }
      }
    }

    const { path, modules } = qrPath(code);

    expect(modules).toBe(size);
    expect(cells(path)).toEqual(expected);
  });

  it('is the same size of code as the web draws (error correction M, margin 1)', async () => {
    const webSvg = await QRCode.toString(code, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
    });
    const extent = qrPath(code).modules + 2;

    expect(webSvg).toContain(`viewBox="0 0 ${extent} ${extent}"`);
  });
});
