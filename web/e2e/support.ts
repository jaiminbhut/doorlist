import { APIRequestContext, Page, expect } from '@playwright/test';

export const DEMO_PASSWORD = process.env['DEMO_PASSWORD'] ?? 'Doorlist-demo-2026';

export const unique = (prefix: string) =>
  `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Fails the test if the page breaks the Content-Security-Policy or throws. */
export function watchForProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy|Refused to/i.test(message.text())) {
      problems.push(message.text());
    }
  });
  page.on('pageerror', (error) => problems.push(`Uncaught: ${error.message}`));
  return problems;
}

/**
 * Waits for Angular's first render of the page just navigated to. This app is
 * zoneless, and its first change detection runs a moment after the page's
 * elements are on screen; a form control set up then writes its initial value
 * into the input, wiping anything typed in between. People can't type that
 * fast; tests can.
 */
export async function rendered(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await rendered(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await rendered(page);
}

/** A signed code for one of the attendee's tickets, read through the API like a door scanner would see it. */
export async function ticketCodes(request: APIRequestContext, email: string): Promise<string[]> {
  const login = await request.post('/api/auth/login', { data: { email, password: DEMO_PASSWORD } });
  const { accessToken } = await login.json();
  const mine = await request.get('/api/tickets/mine', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (await mine.json()).map((ticket: { code: string }) => ticket.code);
}

/** "2026-11-20T18:00" for a datetime-local input, days from now. */
export function localDateTime(daysFromNow: number, hour: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:00`;
}
