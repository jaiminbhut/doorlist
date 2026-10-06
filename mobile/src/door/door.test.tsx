import * as Haptics from 'expo-haptics';
import { act, fireEvent, screen } from 'expo-router/testing-library';
import { ApiError, ApiUnreachableError, request, type RequestOptions } from '@/api/client';
import { database } from '@/storage/database';
import { openApp, resetSecureStore, sessionFor } from '@/testing/app';
import type { ScanResult } from './checkin-api';

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  request: jest.fn(),
}));

const requestMock = jest.mocked(request);
const doorStaff = sessionFor(['DoorStaff'], 'door@example.com');

const jazz = {
  id: 12,
  name: 'Friday Night Jazz',
  venue: 'The Blue Room',
  description: null,
  startsAt: '2026-10-09T20:00:00+00:00',
  endsAt: '2026-10-09T23:00:00+00:00',
};

const admitted: ScanResult = {
  scanId: 'filled in per scan',
  outcome: 'admitted',
  ticketId: 't1',
  holderName: 'Asha Rao',
  ticketTypeName: 'General admission',
  admittedAt: '2026-10-09T20:15:00Z',
  admittedAtDoor: 'North door',
};

/** The API, for these tests: events, a summary, and whatever answer a scan should get. */
function api(answer: (scanId: string) => Promise<ScanResult>) {
  requestMock.mockImplementation(async (path: string, options?: RequestOptions) => {
    if (path === '/api/events') {
      return [jazz];
    }
    if (path === '/api/events/12/checkins/summary') {
      return { issued: 10, admitted: 2, duplicates: 1, invalid: 0, wrongEvent: 0 };
    }
    if (path === '/api/events/12/checkins') {
      const { scans } = options?.body as { scans: { scanId: string }[] };
      return { results: [await answer(scans[0].scanId)] };
    }
    throw new Error(`Unexpected request: ${path}`);
  });
}

async function openConsole() {
  await openApp(doorStaff);
  await fireEvent.changeText(await screen.findByLabelText('This door'), 'North door');
  await fireEvent.press(screen.getByRole('button', { name: /Friday Night Jazz/ }));
  await screen.findByRole('header', { name: 'Friday Night Jazz' });
}

async function typeCode(code: string) {
  await fireEvent.changeText(screen.getByLabelText('Ticket code'), code);
  await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
}

beforeEach(async () => {
  resetSecureStore();
  requestMock.mockReset();
  await (await database()).runAsync("DELETE FROM settings WHERE key LIKE 'door.%'");
});

describe('the door', () => {
  it('lists the events to pick from, and remembers the door name', async () => {
    api(async () => admitted);

    await openConsole();

    expect(screen.getByText('North door')).toBeOnTheScreen();
    expect(screen.getByText('Ready for the first ticket.')).toBeOnTheScreen();
    expect(await screen.findByText('of 10 admitted', { exact: false })).toBeOnTheScreen();
  });

  it("admits on the server's word, with the holder's name", async () => {
    api(async (scanId) => ({ ...admitted, scanId }));
    await openConsole();

    await typeCode('  DL1.code.signature\n');

    expect(await screen.findByText('Admit')).toBeOnTheScreen();
    expect(screen.getByText('Asha Rao, General admission')).toBeOnTheScreen();
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith('success');
    const [, options] = requestMock.mock.calls.find(([path]) => path.endsWith('/checkins'))!;
    expect(options?.body).toEqual({
      deviceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      deviceLabel: 'North door',
      scans: [
        {
          scanId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          code: 'DL1.code.signature',
          scannedAt: expect.any(String),
        },
      ],
    });
    expect(options?.timeoutMs).toBe(4_000);
  });

  it('refuses a ticket used at another door, and says where and when', async () => {
    api(async (scanId) => ({ ...admitted, scanId, outcome: 'alreadyAdmitted' }));
    await openConsole();

    await typeCode('DL1.code.signature');

    expect(await screen.findByText("Don't admit")).toBeOnTheScreen();
    expect(
      screen.getByText('Already used: Asha Rao was admitted at North door, 20:15.'),
    ).toBeOnTheScreen();
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith('error');
  });

  it('asks for a fresh sign-in when the token has expired', async () => {
    api(async () => {
      throw new ApiError(401, null);
    });
    await openConsole();

    await typeCode('DL1.code.signature');

    expect(await screen.findByText("Can't check")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeOnTheScreen();
  });

  it("can't decide offline before the ticket key has ever loaded", async () => {
    api(async () => {
      throw new ApiUnreachableError();
    });
    await openConsole();

    await typeCode('DL1.code.signature');

    expect(await screen.findByText(/hasn't loaded the ticket key yet/)).toBeOnTheScreen();
    expect(screen.getByText("No ticket key yet: can't check tickets offline")).toBeOnTheScreen();
  });

  it('checks a code from the camera once, however many frames show it (ADR 9)', async () => {
    api(async (scanId) => ({ ...admitted, scanId }));
    await openConsole();
    const camera = screen.getByTestId('camera');

    for (let frame = 0; frame < 10; frame++) {
      await act(async () => camera.props.onBarcodeScanned({ data: 'DL1.code.signature' }));
    }

    expect(await screen.findByText('Admit')).toBeOnTheScreen();
    expect(requestMock.mock.calls.filter(([path]) => path.endsWith('/checkins'))).toHaveLength(1);
  });
});
