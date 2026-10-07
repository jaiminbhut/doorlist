import * as SecureStore from 'expo-secure-store';
import { renderRouter } from 'expo-router/testing-library';
import type { Session } from '@/auth/session';
import type { Ticket } from '@/tickets/tickets-api';

export function sessionFor(
  roles: Session['user']['roles'],
  email = 'someone@example.com',
): Session {
  return {
    accessToken: 'jwt',
    expiresAt: '2099-01-01T00:00:00Z',
    user: { email, displayName: 'Someone', roles },
  };
}

export function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: '0199a1b2-0000-7000-8000-000000000001',
    eventId: 12,
    eventName: 'Friday Night Jazz',
    venue: 'The Blue Room',
    startsAt: '2026-10-09T20:00:00+00:00',
    ticketTypeName: 'General admission',
    issuedAt: '2026-10-06T10:00:00+00:00',
    code: 'DL1.AZmhsgAAcACAAAAAAAAAAQAAAAw.c2lnbmF0dXJl',
    ...overrides,
  };
}

// The first test in a file that opens the app transforms every route module as
// it renders them. With a cold transform cache, as on CI, that takes 3.7 s on a
// laptop and more than Jest's default 5 s on a CI runner. Every file that
// opens the app imports this one, so they all get the longer limit.
jest.setTimeout(20_000);

/**
 * Renders the real routes in src/app, signed in as `stored` if given.
 * renderRouter returns the render promise with the router's helpers attached.
 */
export async function openApp(stored: Session | null, initialUrl = '/') {
  if (stored) {
    await SecureStore.setItemAsync('doorlist.session', JSON.stringify(stored));
  }
  const app = renderRouter('./src/app', { initialUrl });
  await app;
  // Not `return app`: an async function would unwrap the promise and drop the helpers.
  return { pathname: () => app.getPathname() };
}

/** Empties the Keychain mock between tests. */
export function resetSecureStore(): void {
  (SecureStore as typeof SecureStore & { __reset(): void }).__reset();
}
