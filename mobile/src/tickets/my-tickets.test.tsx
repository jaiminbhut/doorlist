import * as Brightness from 'expo-brightness';
import { fireEvent, screen } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import { ApiError, ApiUnreachableError, request } from '@/api/client';
import { openApp, resetSecureStore, sessionFor, ticket } from '@/testing/app';
import { cacheTickets, cachedTickets, forgetTickets } from './ticket-cache';

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  request: jest.fn(),
}));

const requestMock = jest.mocked(request);
const attendee = sessionFor(['Attendee'], 'asha@example.com');
const jazz = ticket();

beforeEach(async () => {
  resetSecureStore();
  await forgetTickets();
  requestMock.mockReset();
});

describe('My tickets', () => {
  it('shows each ticket as a stub with its QR code, and saves them for offline', async () => {
    requestMock.mockResolvedValue([jazz]);

    await openApp(attendee);

    expect(await screen.findByText('Friday Night Jazz')).toBeOnTheScreen();
    expect(screen.getByText('Friday 9 October 2026, 20:00')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('QR code for your General admission ticket to Friday Night Jazz'),
    ).toBeOnTheScreen();
    expect(requestMock).toHaveBeenCalledWith('/api/tickets/mine', { token: 'jwt' });
    expect((await cachedTickets('asha@example.com'))?.tickets).toEqual([jazz]);
  });

  it('shows the saved tickets when the API cannot be reached', async () => {
    await cacheTickets('asha@example.com', [jazz], '2026-10-06T14:02:00Z');
    requestMock.mockRejectedValue(new ApiUnreachableError());

    await openApp(attendee);

    expect(
      await screen.findByText(
        'Offline. These are your tickets as saved on Tue 6 Oct, 14:02, and their QR codes still work.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Friday Night Jazz')).toBeOnTheScreen();
  });

  it('says so when offline with nothing saved yet', async () => {
    requestMock.mockRejectedValue(new ApiUnreachableError());

    await openApp(attendee);

    expect(await screen.findByText(/this phone has no saved tickets yet/)).toBeOnTheScreen();
  });

  it('keeps the tickets when the token has expired, and refreshes after signing in again', async () => {
    await cacheTickets('asha@example.com', [jazz], '2026-10-06T14:02:00Z');
    const encore = ticket({ id: 'encore', eventName: 'Saturday Encore' });
    requestMock.mockImplementation(async (path, options) => {
      if (path === '/api/auth/login') {
        return { ...attendee, accessToken: 'fresh' };
      }
      if (options?.token === 'fresh') {
        return [jazz, encore];
      }
      throw new ApiError(401, null);
    });

    await openApp(attendee);
    expect(await screen.findByText(/Your session has expired/)).toBeOnTheScreen();
    expect(screen.getByText('Friday Night Jazz')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Sign in again' }));
    await fireEvent.changeText(await screen.findByLabelText('Password'), 'Doorlist-demo-2026');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Saturday Encore')).toBeOnTheScreen();
    expect(requestMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: { email: 'asha@example.com', password: 'Doorlist-demo-2026' },
    });
  });

  it('points to the website when there are no tickets yet', async () => {
    requestMock.mockResolvedValue([]);

    await openApp(attendee);

    expect(await screen.findByText(/No tickets yet. Claim tickets/)).toBeOnTheScreen();
  });

  it('opens a ticket full screen, brighter, and offline too', async () => {
    requestMock.mockResolvedValue([jazz]);
    const app = await openApp(attendee);

    await fireEvent.press(await screen.findByRole('button', { name: /General admission ticket/ }));

    expect(await screen.findByRole('button', { name: 'Done' })).toBeOnTheScreen();
    expect(app.pathname()).toBe(`/tickets/${jazz.id}`);
    expect(Brightness.setBrightnessAsync).toHaveBeenCalledWith(1);
  });

  it('leaves no tickets on the phone after signing out (ADR 9)', async () => {
    requestMock.mockResolvedValue([jazz]);
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) =>
        buttons?.find((button) => button.style === 'destructive')?.onPress?.(),
      );
    await openApp(attendee);
    await screen.findByText('Friday Night Jazz');

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('header', { name: 'Sign in' })).toBeOnTheScreen();
    await expect(cachedTickets('asha@example.com')).resolves.toBeNull();
    alert.mockRestore();
  });
});
