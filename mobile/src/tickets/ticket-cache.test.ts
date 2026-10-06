import { cacheTickets, cachedTickets, forgetTickets } from './ticket-cache';
import { ticket } from '@/testing/app';

beforeEach(() => forgetTickets());

describe('the ticket cache', () => {
  it("keeps the API's tickets, in the API's order", async () => {
    const later = ticket({ id: 'b', eventName: 'Later', startsAt: '2026-12-01T19:00:00+05:30' });
    const sooner = ticket({ id: 'a', eventName: 'Sooner', startsAt: '2026-11-01T19:00:00+00:00' });

    await cacheTickets('asha@example.com', [later, sooner], '2026-10-06T14:02:00Z');

    await expect(cachedTickets('asha@example.com')).resolves.toEqual({
      tickets: [later, sooner],
      fetchedAt: '2026-10-06T14:02:00Z',
    });
  });

  it('replaces what was there, so a ticket that went away goes away', async () => {
    await cacheTickets('asha@example.com', [ticket({ id: 'a' }), ticket({ id: 'b' })], 't1');
    await cacheTickets('asha@example.com', [ticket({ id: 'b' })], 't2');

    const cached = await cachedTickets('asha@example.com');
    expect(cached?.tickets.map((t) => t.id)).toEqual(['b']);
    expect(cached?.fetchedAt).toBe('t2');
  });

  it("never shows one person's tickets to another", async () => {
    await cacheTickets('asha@example.com', [ticket()], 't1');

    await expect(cachedTickets('ben@example.com')).resolves.toBeNull();
  });

  it('is empty after signing out', async () => {
    await cacheTickets('asha@example.com', [ticket()], 't1');
    await forgetTickets();

    await expect(cachedTickets('asha@example.com')).resolves.toBeNull();
  });
});
