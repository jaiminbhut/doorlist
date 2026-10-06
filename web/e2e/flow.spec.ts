import { expect, test } from '@playwright/test';
import {
  DEMO_PASSWORD,
  localDateTime,
  rendered,
  signIn,
  ticketCodes,
  unique,
  watchForProblems,
} from './support';

/**
 * The whole product in a real browser, with the real CSP: an organizer
 * publishes an event, a new attendee signs up and claims tickets whose QR
 * codes must actually render, and the door admits, refuses, and keeps
 * working offline. Unit tests run in jsdom and Node; this catches what only
 * a browser and the production build show (like the QR bug fixed in #10).
 */
test.describe.serial('Doorlist, end to end', () => {
  const eventName = unique('E2E Night');
  const attendeeEmail = `${unique('e2e').replace(' ', '-')}@example.com`;

  test('an organizer creates and publishes an event', async ({ page }) => {
    const problems = watchForProblems(page);
    await signIn(page, 'organizer@example.com');
    await expect(page).toHaveURL(/\/organizer$/);

    await page.getByLabel('Name').fill(eventName);
    await page.getByLabel('Venue').fill('Main Hall');
    await page.getByLabel('Starts').fill(localDateTime(14, 18));
    await page.getByLabel('Ends').fill(localDateTime(14, 21));
    await page.getByRole('button', { name: 'Create draft' }).click();

    await expect(page.getByRole('heading', { name: eventName })).toBeVisible();
    await rendered(page);
    await page.getByLabel('Ticket type', { exact: true }).fill('General admission');
    await page.getByLabel('Capacity').fill('20');
    await page.getByRole('button', { name: 'Add ticket type' }).click();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published.')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('a new attendee signs up, claims two tickets, and sees them as QR codes', async ({
    page,
  }) => {
    const problems = watchForProblems(page);
    await page.goto('/signup');
    await rendered(page);
    await page.getByLabel('Your name').fill('E2E Attendee');
    await page.getByLabel('Email').fill(attendeeEmail);
    await page.getByLabel('Password').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/events$/);

    await page.getByRole('link', { name: eventName }).click();
    await expect(page.getByRole('button', { name: 'Get tickets' })).toBeVisible();
    await rendered(page);
    await page.getByLabel('How many').selectOption('2');
    await page.getByRole('button', { name: 'Get tickets' }).click();
    await expect(page).toHaveURL(/\/tickets$/);

    const qrCodes = page.locator('img.qr');
    await expect(qrCodes).toHaveCount(2);
    for (const qr of await qrCodes.all()) {
      await expect(qr).toBeVisible();
      expect(
        await qr.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      ).toBe(true);
    }
    expect(problems).toEqual([]);
  });

  test('the door admits a ticket once, then refuses it', async ({ page, request }) => {
    const problems = watchForProblems(page);
    const [code] = await ticketCodes(request, attendeeEmail);
    await signIn(page, 'door@example.com');
    await expect(page).toHaveURL(/\/door$/);
    await page.getByLabel('This door').fill('North door');
    await page.getByRole('link', { name: eventName }).click();

    const field = page.getByLabel('Scan or paste a ticket code');
    await expect(field).toBeFocused();
    await field.fill(code);
    await field.press('Enter');
    const verdict = page.getByRole('status');
    await expect(verdict.locator('.decision')).toHaveText('Admit');
    await expect(verdict).toContainText('E2E Attendee');

    await expect(field).toBeFocused();
    await field.fill(code);
    await field.press('Enter');
    await expect(verdict.locator('.decision')).toHaveText("Don't admit");
    await expect(verdict).toContainText('Already used');
    await expect(verdict).toContainText('North door');
    expect(problems).toEqual([]);
  });

  test('offline, the door checks the signature itself, queues the scan, and syncs when back', async ({
    page,
    request,
    context,
  }) => {
    const problems = watchForProblems(page);
    const [, secondCode] = await ticketCodes(request, attendeeEmail);
    await signIn(page, 'door@example.com');
    await page.getByLabel('This door').fill('South door');
    await page.getByRole('link', { name: eventName }).click();
    await expect(page.getByLabel('Scan or paste a ticket code')).toBeFocused();

    await context.setOffline(true);
    const field = page.getByLabel('Scan or paste a ticket code');
    await field.fill(secondCode);
    await field.press('Enter');
    const verdict = page.getByRole('status');
    await expect(verdict.locator('.decision')).toHaveText('Admit');
    await expect(verdict).toContainText('Offline: a genuine ticket');
    await expect(page.getByText('1 waiting to sync')).toBeVisible();

    await field.fill(secondCode.replace(/\.(.)/, '.Z'));
    await field.press('Enter');
    await expect(verdict.locator('.decision')).toHaveText("Don't admit");
    await expect(verdict).toContainText('Not a valid ticket');

    // Back online: the page syncs the queue by itself (the browser's
    // "online" event), so there's nothing left for Sync now to do.
    await context.setOffline(false);
    await expect(page.getByText('0 waiting to sync')).toBeVisible();
    await expect(page.getByText('2 of 2 admitted')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sync now' })).toBeDisabled();
    expect(
      problems.filter((problem) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(problem)),
    ).toEqual([]);
  });
});
