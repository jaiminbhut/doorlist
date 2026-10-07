import * as Haptics from 'expo-haptics';
import * as Network from 'expo-network';
import { act, fireEvent, screen } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import vectors from '../../../test-vectors/ticket-codes.json';
import { ApiError, ApiUnreachableError, request, type RequestOptions } from '@/api/client';
import { database } from '@/storage/database';
import { openApp, resetSecureStore, sessionFor } from '@/testing/app';
import type { Scan, ScanResult } from './checkin-api';
import { queuedCount } from './door-store';

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  request: jest.fn(),
}));

const requestMock = jest.mocked(request);
const network = Network as typeof Network & { __connect(): void };
const doorStaff = sessionFor(['DoorStaff'], 'door@example.com');

// The shared vectors (ADR 9) are for event 12, like this test's event.
const [lowS, highS, otherEvent] = vectors.valid;
const forgery = vectors.invalid[0];

const jazz = {
  id: 12,
  name: 'Friday Night Jazz',
  venue: 'The Blue Room',
  description: null,
  startsAt: '2026-10-09T20:00:00+00:00',
  endsAt: '2026-10-09T23:00:00+00:00',
};

/** What the API does with check-ins right now: answer them, or not. */
let checkIns: (scans: Scan[], token: string | null | undefined) => Promise<ScanResult[]>;

const unreachable = async (): Promise<ScanResult[]> => {
  throw new ApiUnreachableError();
};

function answer(scan: Scan, overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    scanId: scan.scanId,
    outcome: 'admitted',
    ticketId: lowS.ticketId,
    holderName: 'Asha Rao',
    ticketTypeName: 'General admission',
    admittedAt: '2026-10-09T20:05:00Z',
    admittedAtDoor: 'North door',
    ...overrides,
  };
}

beforeEach(async () => {
  resetSecureStore();
  requestMock.mockReset();
  const db = await database();
  await db.execAsync(
    "DELETE FROM door_queue; DELETE FROM door_admitted; DELETE FROM settings WHERE key LIKE 'door.%';",
  );
  checkIns = unreachable;
  requestMock.mockImplementation(async (path: string, options?: RequestOptions) => {
    if (path === '/api/events') {
      return [jazz];
    }
    if (path === '/api/tickets/signing-key') {
      return { algorithm: 'ES256', keyId: vectors.keyId, publicKey: vectors.publicKey };
    }
    if (path === '/api/events/12/checkins/summary') {
      return { issued: 10, admitted: 2, duplicates: 0, invalid: 0, wrongEvent: 0 };
    }
    if (path === '/api/events/12/checkins') {
      const { scans } = options?.body as { scans: Scan[] };
      return { results: await checkIns(scans, options?.token) };
    }
    if (path === '/api/auth/login') {
      return { ...doorStaff, accessToken: 'fresh' };
    }
    throw new Error(`Unexpected request: ${path}`);
  });
});

async function openConsole() {
  await openApp(doorStaff);
  await fireEvent.changeText(await screen.findByLabelText('This door'), 'South door');
  await fireEvent.press(screen.getByRole('button', { name: /Friday Night Jazz/ }));
  await screen.findByRole('header', { name: 'Friday Night Jazz' });
  // The ticket key has loaded once the console stops saying it hasn't.
  await act(async () => undefined);
  expect(screen.queryByText(/No ticket key yet/)).toBeNull();
}

async function scan(code: string) {
  await fireEvent.changeText(screen.getByLabelText('Ticket code'), code);
  await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
}

describe('the door, offline (ADR 8, ADR 9)', () => {
  it('admits a genuine ticket on its own, queues the scan, and says it is offline', async () => {
    await openConsole();

    await scan(lowS.code);

    expect(
      await screen.findByText(/^Offline: a genuine ticket for this event\./),
    ).toBeOnTheScreen();
    expect(screen.getByText('Admit')).toBeOnTheScreen();
    expect(screen.getByText('Offline: checking on this phone')).toBeOnTheScreen();
    expect(screen.getByText('1 waiting to sync')).toBeOnTheScreen();
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith('warning');
  });

  it('accepts a signature with a high s, as the API makes half the time', async () => {
    await openConsole();

    await scan(highS.code);

    expect(await screen.findByText(/^Offline: a genuine ticket/)).toBeOnTheScreen();
  });

  it('refuses a ticket it has let in itself, whichever of its signatures is shown', async () => {
    await openConsole();
    await scan(lowS.code);
    await screen.findByText('1 waiting to sync');

    await scan(highS.code);

    expect(await screen.findByText('Already used at this door.')).toBeOnTheScreen();
    expect(screen.getByText('1 waiting to sync')).toBeOnTheScreen();
  });

  it('refuses a ticket for another event, and a forged one, without queueing them', async () => {
    await openConsole();

    await scan(otherEvent.code);
    expect(
      await screen.findByText('Wrong event: a real ticket, for a different event.'),
    ).toBeOnTheScreen();

    await scan(forgery.code);
    expect(await screen.findByText('Not a valid ticket.')).toBeOnTheScreen();
    expect(screen.getByText('0 waiting to sync')).toBeOnTheScreen();
  });

  it('refuses offline a ticket the server already said was used', async () => {
    checkIns = async (scans) => [answer(scans[0], { outcome: 'alreadyAdmitted' })];
    await openConsole();
    await scan(lowS.code);
    await screen.findByText(/Already used: Asha Rao/);

    checkIns = unreachable;
    await scan(lowS.code);

    expect(await screen.findByText('Already used at this door.')).toBeOnTheScreen();
  });

  it('syncs the queued scan with its own scan id, and flags a ticket another door let in first', async () => {
    await openConsole();
    await scan(lowS.code);
    await screen.findByText('1 waiting to sync');
    const [queued] = await (
      await database()
    ).getAllAsync<{ scan_id: string }>('SELECT scan_id FROM door_queue');

    const sent: Scan[] = [];
    checkIns = async (scans) => {
      sent.push(...scans);
      return scans.map((s) => answer(s, { outcome: 'alreadyAdmitted' }));
    };
    await fireEvent.press(screen.getByRole('button', { name: 'Sync now' }));

    expect(await screen.findByText('Let in twice: flagged after syncing')).toBeOnTheScreen();
    expect(screen.getByText('first admitted at North door, 20:05')).toBeOnTheScreen();
    expect(screen.getByText('0 waiting to sync')).toBeOnTheScreen();
    expect(sent.map((s) => s.scanId)).toEqual([queued.scan_id]);
  });

  it('syncs by itself when the connection comes back', async () => {
    await openConsole();
    await scan(lowS.code);
    await screen.findByText('1 waiting to sync');

    checkIns = async (scans) => scans.map((s) => answer(s));
    await act(async () => network.__connect());

    expect(await screen.findByText('0 waiting to sync')).toBeOnTheScreen();
    expect(screen.queryByText('Offline: checking on this phone')).toBeNull();
  });

  it('keeps the queue when the token expires, and syncs after signing in again', async () => {
    await openConsole();
    await scan(lowS.code);
    await screen.findByText('1 waiting to sync');

    checkIns = async (scans, token) => {
      if (token !== 'fresh') {
        throw new ApiError(401, null);
      }
      return scans.map((s) => answer(s));
    };
    await fireEvent.press(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByText(/Sign in again to sync 1 scan\./)).toBeOnTheScreen();
    expect(await queuedCount(12)).toBe(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Sign in again' }));
    await fireEvent.changeText(await screen.findByLabelText('Password'), 'Doorlist-demo-2026');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('0 waiting to sync')).toBeOnTheScreen();
    expect(await queuedCount(12)).toBe(0);
  });

  it('keeps queued scans through signing out, and says so first', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) =>
        buttons?.find((button) => button.style === 'destructive')?.onPress?.(),
      );
    await openConsole();
    await scan(lowS.code);
    await screen.findByText('1 waiting to sync');

    await fireEvent.press(screen.getByRole('link', { name: '← Change event' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));

    expect(alert).toHaveBeenCalledWith(
      'Sign out?',
      '1 door scan hasn’t synced yet. They stay on this phone and sync after door staff sign in again.',
      expect.any(Array),
    );
    expect(await screen.findByRole('header', { name: 'Sign in' })).toBeOnTheScreen();
    expect(await queuedCount(12)).toBe(1);
    alert.mockRestore();
  });
});
