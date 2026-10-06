import { p256 } from '@noble/curves/nist.js';
import vectors from '../../../test-vectors/ticket-codes.json';
import { importSigningKey, verifyTicketCode } from './ticket-code';

/**
 * The same file the API's tests check with its own TicketSigner and the web's
 * tests check with WebCrypto (ADR 9). It includes a signature with a high s.
 */
describe('verifyTicketCode, on the shared test vectors', () => {
  const key = importSigningKey(vectors.publicKey);

  it.each(vectors.valid)('accepts $name', ({ code, ticketId, eventId }) => {
    expect(verifyTicketCode(code, key)).toEqual({ ticketId, eventId });
  });

  it.each(vectors.invalid)('rejects $name', ({ code }) => {
    expect(verifyTicketCode(code, key)).toBeNull();
  });

  it('ignores spaces and a newline around the code, as a scanner may add them', () => {
    expect(verifyTicketCode(`  ${vectors.valid[0].code}\n`, key)).not.toBeNull();
  });
});

describe('why lowS: false matters', () => {
  it("would refuse the high-s code with noble's default", () => {
    const highS = vectors.valid.find((vector) => vector.name.includes('high s'));
    const [, payload, signature] = highS!.code.split('.');
    const bytes = (text: string) =>
      Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));

    const withDefaults = p256.verify(
      bytes(signature.padEnd(88, '=')),
      new TextEncoder().encode(`DL1.${payload}`),
      importSigningKey(vectors.publicKey),
    );

    expect(withDefaults).toBe(false);
    expect(verifyTicketCode(highS!.code, importSigningKey(vectors.publicKey))).not.toBeNull();
  });
});

describe('importSigningKey', () => {
  it("refuses a key that isn't P-256", () => {
    // A P-384 SubjectPublicKeyInfo header, with a point of the right length for P-384.
    const p384 = btoa(
      String.fromCharCode(
        ...[0x30, 0x76, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01],
        ...[0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, 0x03, 0x62, 0x00, 0x04],
        ...new Array<number>(96).fill(1),
      ),
    );

    expect(() => importSigningKey(p384)).toThrow('not a P-256 public key');
  });

  it('refuses a P-256 header followed by a point that is not on the curve', () => {
    const real = atob(vectors.publicKey);
    const offCurve = btoa(
      real.slice(0, -1) + String.fromCharCode(real.charCodeAt(real.length - 1) ^ 1),
    );

    expect(() => importSigningKey(offCurve)).toThrow();
  });

  it('refuses text that is not base64', () => {
    expect(() => importSigningKey('not a key!')).toThrow('not a P-256 public key');
  });
});
