import { computed, signal } from '@angular/core';
import { AuthService, Role, SignedInUser } from '../core/auth';

/** Stands in for AuthService in component tests: signed in with the given roles, or signed out. */
export function fakeAuth(...roles: Role[]) {
  const user: SignedInUser | null = roles.length
    ? { email: 'someone@example.com', displayName: 'Someone', roles }
    : null;

  const fake = {
    signedOut: false,
    user: signal(user).asReadonly(),
    canManageApps: computed(() => roles.includes('Lead')),
    canWorkOnReleases: computed(() => roles.includes('Lead') || roles.includes('Developer')),
    hasRole: (role: Role) => roles.includes(role),
    token: () => (user ? 'test-token' : null),
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
