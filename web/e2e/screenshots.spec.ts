import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { DEMO_PASSWORD, rendered, signIn } from './support';

/**
 * Captures every main page at desktop and phone widths, into
 * docs/screenshots. Skipped unless SCREENSHOTS=1:
 *
 *   SCREENSHOTS=1 scripts/e2e.sh screenshots
 */
test.skip(!process.env['SCREENSHOTS'], 'Set SCREENSHOTS=1 to capture screenshots');

const phone = { width: 390, height: 844 };
const variants = {
  desktop: { viewport: { width: 1280, height: 860 }, colorScheme: 'light' },
  phone: { viewport: phone, colorScheme: 'light' },
  'phone-dark': { viewport: phone, colorScheme: 'dark' },
} as const;
type Variant = keyof typeof variants;

async function api(
  request: APIRequestContext,
  token: string,
  method: 'GET' | 'POST',
  path: string,
  data?: unknown,
) {
  const response = await request.fetch(`/api${path}`, {
    method,
    data,
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), `${method} ${path}: ${response.status()}`).toBe(true);
  return response.json();
}

async function token(request: APIRequestContext, email: string): Promise<string> {
  return (
    await (
      await request.post('/api/auth/login', { data: { email, password: DEMO_PASSWORD } })
    ).json()
  ).accessToken;
}

/** Realistic data: a few published events, and an attendee holding tickets. */
async function seed(request: APIRequestContext) {
  const organizer = await token(request, 'organizer@example.com');
  const days = (n: number, hour: number) => {
    const date = new Date();
    date.setDate(date.getDate() + n);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };

  const events = [
    {
      name: 'Friday Night Jazz',
      venue: 'The Blue Room',
      days: 3,
      hour: 20,
      types: [
        ['General admission', 120],
        ['Front row', 12],
      ],
    },
    {
      name: 'Frontend Meetup: Signals in Practice',
      venue: 'Hall B, Innovation Hub',
      days: 9,
      hour: 18,
      types: [['Attendee', 80]],
    },
    {
      name: 'Community Run 5K',
      venue: 'Riverside Park',
      days: 16,
      hour: 7,
      types: [
        ['Runner', 300],
        ['Volunteer', 25],
      ],
    },
  ];
  const ids: number[] = [];
  for (const e of events) {
    const created = await api(request, organizer, 'POST', '/events', {
      name: e.name,
      venue: e.venue,
      description: 'Doors open 30 minutes before the start. Bring your QR ticket on your phone.',
      startsAt: days(e.days, e.hour),
      endsAt: days(e.days, e.hour + 3),
    });
    for (const [name, capacity] of e.types) {
      await api(request, organizer, 'POST', `/events/${created.id}/ticket-types`, {
        name,
        capacity,
      });
    }
    await api(request, organizer, 'POST', `/events/${created.id}/publish`);
    ids.push(created.id);
  }

  const email = `asha.${Date.now()}@example.com`;
  const attendee = (
    await (
      await request.post('/api/auth/register', {
        data: { email, password: DEMO_PASSWORD, displayName: 'Asha Rao' },
      })
    ).json()
  ).accessToken;
  const jazz = await api(request, attendee, 'GET', `/events/${ids[0]}`);
  await api(request, attendee, 'POST', `/events/${ids[0]}/tickets`, {
    ticketTypeId: jazz.ticketTypes[0].id,
    quantity: 2,
  });
  const meetup = await api(request, attendee, 'GET', `/events/${ids[1]}`);
  const claimed = await api(request, attendee, 'POST', `/events/${ids[1]}/tickets`, {
    ticketTypeId: meetup.ticketTypes[0].id,
    quantity: 2,
  });

  const codes = (claimed as { code: string }[]).map((ticket) => ticket.code);
  return { ids, attendeeEmail: email, codes };
}

async function shoot(page: Page, name: string, size: Variant) {
  await rendered(page);
  await page.screenshot({
    path: `../docs/screenshots/${name}-${size}.png`,
    // Phones show what's on screen, the way someone holding one sees it.
    fullPage: size === 'desktop',
    animations: 'disabled',
  });
}

test('capture the main pages', async ({ browser, request }) => {
  test.setTimeout(180_000);
  const { ids, attendeeEmail, codes } = await seed(request);

  for (const size of Object.keys(variants) as Variant[]) {
    const context = await browser.newContext(variants[size]);
    const page = await context.newPage();

    await page.goto('/events');
    await expect(page.getByText('Friday Night Jazz').first()).toBeVisible();
    await shoot(page, 'events', size);

    await page.goto('/signup');
    await shoot(page, 'signup', size);

    await signIn(page, attendeeEmail);
    await page.goto(`/events/${ids[0]}`);
    await expect(page.getByRole('button', { name: 'Get tickets' })).toBeVisible();
    await shoot(page, 'event', size);
    await page.goto('/tickets');
    await expect(page.locator('img.qr').first()).toBeVisible();
    await shoot(page, 'tickets', size);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await signIn(page, 'organizer@example.com');
    await expect(page.getByText('Friday Night Jazz').first()).toBeVisible();
    await shoot(page, 'organizer', size);
    await page.goto(`/organizer/events/${ids[0]}`);
    await expect(page.getByText('Ticket types')).toBeVisible();
    await shoot(page, 'organizer-event', size);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await signIn(page, 'door@example.com');
    await page.getByLabel('This door').fill('North door');
    await page.goto(`/door/${ids[1]}`);
    const field = page.getByLabel('Scan or paste a ticket code');
    await expect(field).toBeFocused();
    // Desktop and phone each admit a ticket; dark mode shows the first one refused.
    const scan = { desktop: codes[0], phone: codes[1], 'phone-dark': codes[0] }[size];
    await field.fill(scan);
    await field.press('Enter');
    await expect(page.locator('.decision')).toHaveText(
      size === 'phone-dark' ? "Don't admit" : 'Admit',
    );
    await shoot(page, 'door', size);
    await context.close();
  }
});
