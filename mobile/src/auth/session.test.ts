import * as SecureStore from 'expo-secure-store';
import {
  canCheckIn,
  describeRoles,
  hasExpired,
  isAttendee,
  loadSession,
  saveSession,
  type Session,
} from './session';

const store = SecureStore as typeof SecureStore & { __reset(): void };

const session: Session = {
  accessToken: 'jwt',
  expiresAt: '2026-10-06T12:00:00Z',
  user: { email: 'door@example.com', displayName: 'Door', roles: ['DoorStaff'] },
};

beforeEach(() => store.__reset());

describe('the stored session', () => {
  it('survives a restart', async () => {
    await saveSession(session);

    await expect(loadSession()).resolves.toEqual(session);
  });

  it('is gone after signing out', async () => {
    await saveSession(session);
    await saveSession(null);

    await expect(loadSession()).resolves.toBeNull();
  });

  it('is dropped if it cannot be read', async () => {
    await SecureStore.setItemAsync('doorlist.session', '{not json');

    await expect(loadSession()).resolves.toBeNull();
    await expect(SecureStore.getItemAsync('doorlist.session')).resolves.toBeNull();
  });

  it('knows when its token has expired', () => {
    expect(hasExpired(session, Date.parse('2026-10-06T11:59:59Z'))).toBe(false);
    expect(hasExpired(session, Date.parse('2026-10-06T12:00:00Z'))).toBe(true);
  });
});

describe('roles', () => {
  const user = (roles: Session['user']['roles']) => ({ ...session.user, roles });

  it('lets door staff and organizers check in, as the API does', () => {
    expect(canCheckIn(user(['DoorStaff']))).toBe(true);
    expect(canCheckIn(user(['Organizer']))).toBe(true);
    expect(canCheckIn(user(['Attendee']))).toBe(false);
  });

  it('gives tickets to attendees', () => {
    expect(isAttendee(user(['Attendee']))).toBe(true);
    expect(isAttendee(user(['DoorStaff']))).toBe(false);
  });

  it('names roles as the web does', () => {
    expect(describeRoles(user(['Organizer', 'DoorStaff']))).toBe('Organizer, Door staff');
  });
});
