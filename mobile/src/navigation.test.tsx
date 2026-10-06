import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import { fireEvent, screen } from 'expo-router/testing-library';
import { ApiError, request } from '@/api/client';
import { openApp, resetSecureStore, sessionFor } from '@/testing/app';

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  request: jest.fn(),
}));

const requestMock = jest.mocked(request);
beforeEach(() => {
  resetSecureStore();
  requestMock.mockReset();
  // Attendees' tickets load on their home screen.
  requestMock.mockImplementation(async (path) => (path === '/api/tickets/mine' ? [] : undefined));
});

describe('where the app opens (ADR 9)', () => {
  it('opens on sign-in when nobody is signed in', async () => {
    const app = await openApp(null);

    expect(await screen.findByRole('header', { name: 'Sign in' })).toBeOnTheScreen();
    expect(app.pathname()).toBe('/sign-in');
  });

  it("opens an attendee's tickets", async () => {
    const app = await openApp(sessionFor(['Attendee']));

    expect(await screen.findByRole('header', { name: 'My tickets' })).toBeOnTheScreen();
    expect(app.pathname()).toBe('/tickets');
  });

  it('opens the door for door staff', async () => {
    const app = await openApp(sessionFor(['DoorStaff']));

    expect(await screen.findByRole('header', { name: 'Door' })).toBeOnTheScreen();
    expect(app.pathname()).toBe('/door');
  });

  it('keeps an attendee out of the door', async () => {
    const app = await openApp(sessionFor(['Attendee']), '/door');

    expect(await screen.findByRole('header', { name: 'My tickets' })).toBeOnTheScreen();
    expect(app.pathname()).toBe('/tickets');
  });
});

describe('signing in', () => {
  it('stores the session and goes to the door', async () => {
    requestMock.mockResolvedValue(sessionFor(['DoorStaff']));
    await openApp(null);

    await fireEvent.changeText(await screen.findByLabelText('Email'), 'door@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'Doorlist-demo-2026');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('header', { name: 'Door' })).toBeOnTheScreen();
    expect(requestMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: { email: 'door@example.com', password: 'Doorlist-demo-2026' },
    });
    await expect(SecureStore.getItemAsync('doorlist.session')).resolves.toContain('"jwt"');
  });

  it('stays on sign-in and says why when the password is wrong', async () => {
    requestMock.mockRejectedValue(new ApiError(401, 'Email or password is incorrect.'));
    const app = await openApp(null);

    await fireEvent.changeText(await screen.findByLabelText('Email'), 'door@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email or password is incorrect.')).toBeOnTheScreen();
    expect(app.pathname()).toBe('/sign-in');
  });
});

describe('signing up', () => {
  it("shows the API's message under the field it is about", async () => {
    requestMock.mockRejectedValue(
      new ApiError(400, 'Validation failed', {
        password: ['Passwords must be at least 12 characters.'],
      }),
    );
    await openApp(null);
    await fireEvent.press(await screen.findByText('Sign up'));

    await fireEvent.changeText(await screen.findByLabelText('Your name'), 'Asha');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'asha@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'short');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign up' }));

    expect(await screen.findByText('Passwords must be at least 12 characters.')).toBeOnTheScreen();
    expect(requestMock).toHaveBeenCalledWith('/api/auth/register', {
      method: 'POST',
      body: { displayName: 'Asha', email: 'asha@example.com', password: 'short' },
    });
  });
});

describe('signing out', () => {
  it('asks first, then forgets the session and goes back to sign-in', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) =>
        buttons?.find((button) => button.style === 'destructive')?.onPress?.(),
      );
    const app = await openApp(sessionFor(['Attendee']));

    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));

    expect(alert).toHaveBeenCalledWith('Sign out?', expect.any(String), expect.any(Array));
    expect(await screen.findByRole('header', { name: 'Sign in' })).toBeOnTheScreen();
    expect(app.pathname()).toBe('/sign-in');
    await expect(SecureStore.getItemAsync('doorlist.session')).resolves.toBeNull();
    alert.mockRestore();
  });
});
