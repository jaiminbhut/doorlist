import { p256 } from '@noble/curves/nist.js';

/**
 * Checks a ticket code on the phone, with no connection (ADR 7, ADR 9). A code
 * is "DL1.<payload>.<signature>": the payload is the ticket id (16 bytes) and
 * the event id (4 bytes), big-endian; the signature is ECDSA P-256 with
 * SHA-256 over the ASCII of "DL1." plus the payload, as raw r||s. All parts
 * are base64url. The web checks the same bytes with WebCrypto; Hermes has no
 * WebCrypto, so here it's @noble/curves.
 */

export interface VerifiedTicket {
  ticketId: string;
  eventId: number;
}

const VERSION = 'DL1';

/**
 * The DER header of a SubjectPublicKeyInfo for an EC key on P-256 with an
 * uncompressed point: SEQUENCE { SEQUENCE { id-ecPublicKey, prime256v1 },
 * BIT STRING }. The 65-byte point follows it.
 */
const P256_SPKI_HEADER = Uint8Array.from([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
  0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);
const POINT_LENGTH = 65;

/** A public key ready for verifyTicketCode: the raw uncompressed point. */
export type SigningKey = Uint8Array;

/**
 * Reads the public key served at /api/tickets/signing-key (base64
 * SubjectPublicKeyInfo). Anything but a P-256 key in exactly that form is
 * refused, rather than guessed at.
 */
export function importSigningKey(publicKey: string): SigningKey {
  const der = base64ToBytes(publicKey);
  const header = der?.subarray(0, P256_SPKI_HEADER.length);
  const point = der?.subarray(P256_SPKI_HEADER.length);
  if (
    !header ||
    !point ||
    !sameBytes(header, P256_SPKI_HEADER) ||
    point.length !== POINT_LENGTH ||
    point[0] !== 0x04
  ) {
    throw new Error('The ticket key is not a P-256 public key.');
  }
  // Also checks the point is on the curve.
  p256.Point.fromBytes(point);
  return point;
}

/** The ticket and event a code was issued for, or null if it isn't a genuine, unchanged code. */
export function verifyTicketCode(code: string, key: SigningKey): VerifiedTicket | null {
  const parts = code.trim().split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) {
    return null;
  }

  const payload = base64UrlToBytes(parts[1]);
  const signature = base64UrlToBytes(parts[2]);
  if (payload?.length !== 20 || signature?.length !== 64) {
    return null;
  }

  const signed = new TextEncoder().encode(`${VERSION}.${parts[1]}`);
  let genuine: boolean;
  try {
    genuine = p256.verify(signature, signed, key, {
      // The API signs with .NET, which doesn't normalise s: about half of all
      // genuine codes have a high s. noble refuses those unless told not to.
      lowS: false,
      prehash: true,
      format: 'compact',
    });
  } catch {
    genuine = false;
  }
  if (!genuine) {
    return null;
  }

  return {
    ticketId: formatUuid(payload.subarray(0, 16)),
    eventId: new DataView(payload.buffer, payload.byteOffset + 16, 4).getInt32(0),
  };
}

function base64ToBytes(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function base64UrlToBytes(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) {
    return null;
  }
  const base64 = text
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  return base64ToBytes(base64);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

function formatUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
