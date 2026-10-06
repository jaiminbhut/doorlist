/**
 * Checks a ticket code in the browser, with no connection (ADR 7). A code is
 * "DL1.<payload>.<signature>": the payload is the ticket id (16 bytes) and the
 * event id (4 bytes), big-endian; the signature is ECDSA P-256 with SHA-256
 * over the ASCII of "DL1." plus the payload, as raw r||s, which is the format
 * WebCrypto uses. All parts are base64url.
 */

export interface VerifiedTicket {
  ticketId: string;
  eventId: number;
}

const VERSION = 'DL1';

/** Imports the public key served at /api/tickets/signing-key (base64 SubjectPublicKeyInfo). */
export function importSigningKey(publicKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    base64ToBytes(publicKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
}

/** The ticket and event a code was issued for, or null if it isn't a genuine, unchanged code. */
export async function verifyTicketCode(
  code: string,
  key: CryptoKey,
): Promise<VerifiedTicket | null> {
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
  const genuine = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signature,
    signed,
  );
  if (!genuine) {
    return null;
  }

  return {
    ticketId: formatUuid(payload.subarray(0, 16)),
    eventId: new DataView(payload.buffer, payload.byteOffset + 16, 4).getInt32(0),
  };
}

function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) {
    return null;
  }
  const base64 = text
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  try {
    return base64ToBytes(base64);
  } catch {
    return null;
  }
}

function formatUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
