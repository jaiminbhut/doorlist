import { fireEvent, screen } from 'expo-router/testing-library';
import { ApiError, ApiUnreachableError, request, type RequestOptions } from '@/api/client';
import { openApp, resetSecureStore, sessionFor, ticket } from '@/testing/app';
import { cachedTickets, forgetTickets } from '@/tickets/ticket-cache';
import type { Ticket } from '@/tickets/tickets-api';

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  request: jest.fn(),
}));

const requestMock = jest.mocked(request);
const attendee = sessionFor(['Attendee'], 'asha@example.com');

const jazz = {
  id: 12,
  name: 'Friday Night Jazz',
  venue: 'The Blue Room',
  description: 'Doors open 30 minutes before the start.',
  startsAt: '2026-10-09T20:00:00+00:00',
  endsAt: '2026-10-09T23:00:00+00:00',
  ticketTypes: [
    { id: 1, name: 'General admission', capacity: 120, remaining: 118 },
    { id: 2, name: 'Front row', capacity: 12, remaining: 0 },
  ],
};
const run = {
  ...jazz,
  id: 13,
  name: 'Community Run 5K',
  venue: 'Riverside Park',
  description: null,
  startsAt: '2026-10-18T07:00:00+00:00',
  endsAt: '2026-10-18T10:00:00+00:00',
  ticketTypes: [{ id: 3, name: 'Runner', capacity: 300, remaining: 0 }],
};
const claimed = [
  ticket({ id: 'new-1', issuedAt: '2026-10-07T12:00:00+00:00' }),
  ticket({ id: 'new-2', issuedAt: '2026-10-07T12:00:00+00:00' }),
];

interface Api {
  event?: typeof jazz;
  /** What claiming does, given the request body and token. */
  claim?(body: unknown, token: string | null | undefined): Promise<Ticket[]>;
  mine?(): Promise<Ticket[]>;
}

/** The API, as far as these screens use it. */
function api({ event = jazz, claim = async () => claimed, mine = async () => claimed }: Api = {}) {
  requestMock.mockImplementation(async (path: string, options?: RequestOptions) => {
    if (path === '/api/events') {
      return [event, run];
    }
    if (path === '/api/events/12') {
      return event;
    }
    if (path === '/api/events/12/tickets') {
      return claim(options?.body, options?.token);
    }
    if (path === '/api/tickets/mine') {
      return mine();
    }
    if (path === '/api/auth/login') {
      return { ...attendee, accessToken: 'fresh' };
    }
    throw new ApiError(404, null);
  });
}

beforeEach(async () => {
  resetSecureStore();
  await forgetTickets();
  requestMock.mockReset();
});

describe('Events', () => {
  it("lists upcoming events like the web's lineup, with what's left", async () => {
    api();

    await openApp(attendee, '/events');

    expect(await screen.findByRole('header', { name: 'Upcoming events' })).toBeOnTheScreen();
    expect(
      screen.getByRole('button', {
        name: 'Friday Night Jazz, The Blue Room, Friday 20:00, 118 left',
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', {
        name: 'Community Run 5K, Riverside Park, Sunday 07:00, sold out',
      }),
    ).toBeOnTheScreen();
  });

  it('opens an event from the list', async () => {
    api();
    const app = await openApp(attendee, '/events');

    await fireEvent.press(await screen.findByRole('button', { name: /^Friday Night Jazz/ }));

    expect(await screen.findByText('Friday 9 October 2026, 20:00 to 23:00')).toBeOnTheScreen();
    expect(app.pathname()).toBe('/events/12');
  });

  it("says so when Doorlist can't be reached", async () => {
    requestMock.mockRejectedValue(new ApiUnreachableError());

    await openApp(attendee, '/events');

    expect(await screen.findByText(/Can't reach Doorlist/)).toBeOnTheScreen();
  });
});

describe('an event', () => {
  it('shows its ticket types, with a sold-out one that cannot be chosen', async () => {
    api();

    await openApp(attendee, '/events/12');

    expect(await screen.findByRole('header', { name: 'Friday Night Jazz' })).toBeOnTheScreen();
    expect(screen.getByText('Doors open 30 minutes before the start.')).toBeOnTheScreen();
    expect(
      screen.getByRole('radio', { name: 'General admission, 118 of 120 left', checked: true }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('radio', { name: 'Front row, sold out', disabled: true }),
    ).toBeOnTheScreen();
  });

  it('claims tickets, saves them on the phone, and shows them arriving in My tickets', async () => {
    const claim = jest.fn(async () => claimed);
    api({ claim });
    const app = await openApp(attendee, '/events/12');

    await fireEvent.press(await screen.findByRole('radio', { name: '2 tickets' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Get tickets' }));

    expect(await screen.findByText('2 tickets added for Friday Night Jazz.')).toBeOnTheScreen();
    expect(app.pathname()).toBe('/tickets');
    expect(claim).toHaveBeenCalledWith({ ticketTypeId: 1, quantity: 2 }, 'jwt');
    expect(requestMock).toHaveBeenCalledWith('/api/events/12/tickets', {
      method: 'POST',
      token: 'jwt',
      body: { ticketTypeId: 1, quantity: 2 },
    });
    expect((await cachedTickets('asha@example.com'))?.tickets.map((t) => t.id)).toEqual([
      'new-1',
      'new-2',
    ]);
  });

  it('adds them to an open My tickets, even when it then cannot update', async () => {
    let online = true;
    api({
      // Like a venue's network, it takes a while to fail: the phone's saved
      // tickets answer first.
      mine: () =>
        online
          ? Promise.resolve([])
          : new Promise((_, reject) => setTimeout(() => reject(new ApiUnreachableError()), 100)),
    });
    await openApp(attendee);
    await screen.findByText(/No tickets yet/);

    await fireEvent.press(screen.getByRole('button', { name: 'See upcoming events' }));
    await fireEvent.press(await screen.findByRole('button', { name: /^Friday Night Jazz/ }));
    online = false;
    await fireEvent.press(await screen.findByRole('button', { name: 'Get tickets' }));

    expect(await screen.findByText('2 tickets added for Friday Night Jazz.')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /General admission ticket/ })).toHaveLength(2);
  });

  it("shows the API's reason when it refuses a claim", async () => {
    api({
      claim: async () => {
        throw new ApiError(
          409,
          'You can hold at most 4 tickets for an event, and you already have 3.',
        );
      },
    });
    const app = await openApp(attendee, '/events/12');

    await fireEvent.press(await screen.findByRole('button', { name: 'Get tickets' }));

    expect(
      await screen.findByText(
        'You can hold at most 4 tickets for an event, and you already have 3.',
      ),
    ).toBeOnTheScreen();
    expect(app.pathname()).toBe('/events/12');
  });

  it('offers no more tickets than are left', async () => {
    api({
      event: {
        ...jazz,
        ticketTypes: [{ id: 1, name: 'General admission', capacity: 120, remaining: 2 }],
      },
    });

    await openApp(attendee, '/events/12');

    expect(await screen.findByRole('radio', { name: '2 tickets' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: '3 tickets', disabled: true })).toBeOnTheScreen();
  });

  it('asks to sign in again when the session has expired, then claims with the new one', async () => {
    api({
      claim: async (_body, token) => {
        if (token !== 'fresh') {
          throw new ApiError(401, null);
        }
        return claimed;
      },
    });
    await openApp(attendee, '/events/12');

    await fireEvent.press(await screen.findByRole('button', { name: 'Get tickets' }));
    expect(
      await screen.findByText(/Your session has expired, so nothing was claimed/),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Sign in again' }));
    await fireEvent.changeText(await screen.findByLabelText('Password'), 'Doorlist-demo-2026');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.queryByText(/Your session has expired, so nothing was claimed/)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Get tickets' }));
    expect(await screen.findByText('2 tickets added for Friday Night Jazz.')).toBeOnTheScreen();
  });

  it("says when an event doesn't exist", async () => {
    api();

    await openApp(attendee, '/events/99');

    expect(await screen.findByText('This event does not exist.')).toBeOnTheScreen();
  });
});

describe('who gets Events', () => {
  it('keeps door staff out of Events', async () => {
    api();
    const app = await openApp(sessionFor(['DoorStaff']), '/events');

    await screen.findByRole('header', { name: 'Door' });
    expect(app.pathname()).toBe('/door');
  });
});
