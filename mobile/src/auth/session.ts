import * as SecureStore from 'expo-secure-store';

export type Role = 'Organizer' | 'DoorStaff' | 'Attendee';

export interface User {
  email: string;
  displayName: string;
  roles: Role[];
}

/** What /api/auth/login and /api/auth/register return, kept as it came. */
export interface Session {
  accessToken: string;
  expiresAt: string;
  user: User;
}

const KEY = 'doorlist.session';

/**
 * The session lives in the Keychain or Keystore (ADR 9). It stays until the
 * person signs out, even after its token expires: an attendee's cached
 * tickets and a door's queued scans must outlive an hour-long token. The
 * screens that call the API ask to sign in again when the token is refused.
 */
export async function loadSession(): Promise<Session | null> {
  const text = await SecureStore.getItemAsync(KEY);
  if (!text) {
    return null;
  }
  try {
    const session = JSON.parse(text) as Session;
    if (typeof session.accessToken === 'string' && Array.isArray(session.user?.roles)) {
      return session;
    }
  } catch {
    // Unreadable: treat it as signed out.
  }
  await SecureStore.deleteItemAsync(KEY);
  return null;
}

export async function saveSession(session: Session | null): Promise<void> {
  if (session) {
    await SecureStore.setItemAsync(KEY, JSON.stringify(session));
  } else {
    await SecureStore.deleteItemAsync(KEY);
  }
}

export function hasExpired(session: Session, now = Date.now()): boolean {
  return Date.parse(session.expiresAt) <= now;
}

/** Attendees hold tickets. */
export function isAttendee(user: User): boolean {
  return user.roles.includes('Attendee');
}

/** Door staff and organizers check tickets at the door (ADR 8). */
export function canCheckIn(user: User): boolean {
  return user.roles.includes('DoorStaff') || user.roles.includes('Organizer');
}

const roleNames: Record<Role, string> = {
  Organizer: 'Organizer',
  DoorStaff: 'Door staff',
  Attendee: 'Attendee',
};

export function describeRoles(user: User): string {
  return user.roles.map((role) => roleNames[role] ?? role).join(', ');
}
