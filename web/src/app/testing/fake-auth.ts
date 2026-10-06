import { computed, signal } from '@angular/core';
import { AuthService, Role, SignedInUser } from '../core/auth';

/** Stands in for AuthService in component tests: signed in with the given roles, or signed out. */
export function fakeAuth(...roles: Role[]) {
  const user: SignedInUser | null = roles.length
    ? { email: 'someone@example.com', displayName: 'Someone', roles }
    : null;
  const has = (role: Role) => roles.includes(role);

  const fake = {
    signedOut: false,
    user: signal(user).asReadonly(),
    canManageEvents: computed(() => has('Organizer')),
    isAttendee: computed(() => has('Attendee')),
    canCheckIn: computed(() => has('DoorStaff') || has('Organizer')),
    usesReleaseTracker: computed(() => has('Lead') || has('Developer') || has('Viewer')),
    canManageApps: computed(() => has('Lead')),
    canWorkOnReleases: computed(() => has('Lead') || has('Developer')),
    hasRole: has,
    token: () => (user ? 'test-token' : null),
    homePath: () =>
      has('Organizer')
        ? '/organizer'
        : has('DoorStaff')
          ? '/door'
          : has('Attendee')
            ? '/tickets'
            : '/events',
    signOut: () => {
      fake.signedOut = true;
    },
  };

  return fake;
}

export const provideFakeAuth = (...roles: Role[]) => ({
  provide: AuthService,
  useValue: fakeAuth(...roles),
});
