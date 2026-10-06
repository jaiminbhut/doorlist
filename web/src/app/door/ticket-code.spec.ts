import vectors from '../../../../test-vectors/ticket-codes.json';
import { importSigningKey, verifyTicketCode } from './ticket-code';

// Made by the API's C# TicketSigner, so these tests check that the browser
// and the server agree on the format, not just that the browser agrees with itself.
const fromServer = {
  publicKey:
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEfsOv8+iHENG+a1Nu/U9/CtnPJ6BGkgpUz8TEqyLzk67X4X2w/zIp+Pe2MywzXl01Os5NnPVcqWWxYEBAZZC++A==',
  ticketId: '0192c3d4-5e6f-7a8b-9cde-f0123456789a',
  eventId: 42,
  code: 'DL1.AZLD1F5veouc3vASNFZ4mgAAACo.-lBYqKfc_FbqldlkYr04CoMNewSFcky0UFoOnQRn58gOBKIzJPNkcRlcUirkqT9XwcNbhGBDLIzOZyHYkx35Lw',
};

describe('verifyTicketCode', () => {
  it('accepts a code signed by the server and reads the ticket and event from it', async () => {
    const key = await importSigningKey(fromServer.publicKey);

    expect(await verifyTicketCode(fromServer.code, key)).toEqual({
      ticketId: fromServer.ticketId,
      eventId: fromServer.eventId,
    });
    expect(await verifyTicketCode(`  ${fromServer.code}\n`, key)).not.toBeNull();
  });

  it('rejects a code whose ticket was swapped under the same signature', async () => {
    const key = await importSigningKey(fromServer.publicKey);
    const [version, , signature] = fromServer.code.split('.');
    const otherTicket = 'AZLD1F5veouc3vASNFZ4mwAAACo';

    expect(await verifyTicketCode(`${version}.${otherTicket}.${signature}`, key)).toBeNull();
  });

  it("rejects a code signed with someone else's key", async () => {
    const theirs = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);

    expect(await verifyTicketCode(fromServer.code, theirs.publicKey)).toBeNull();
  });

  it.each([
    '',
    'not a ticket',
    'DL1.abc',
    'DL2.AZLD1F5veouc3vASNFZ4mgAAACo.xyz',
    'DL1.!!!.###',
    'DL1.AZLD1F5veouc3vASNFZ4mgAAACo.c2hvcnQ',
  ])('rejects %j', async (code) => {
    const key = await importSigningKey(fromServer.publicKey);

    expect(await verifyTicketCode(code, key)).toBeNull();
  });
});

/**
 * The same file the API's tests check with its own TicketSigner and the mobile
 * app's tests check with noble (ADR 9). It includes a signature with a high s.
 */
describe('verifyTicketCode, on the shared test vectors', () => {
  it.each(vectors.valid)('accepts $name', async ({ code, ticketId, eventId }) => {
    const key = await importSigningKey(vectors.publicKey);

    expect(await verifyTicketCode(code, key)).toEqual({ ticketId, eventId });
  });

  it.each(vectors.invalid)('rejects $name', async ({ code }) => {
    const key = await importSigningKey(vectors.publicKey);

    expect(await verifyTicketCode(code, key)).toBeNull();
  });
});
