import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, Role } from './auth';

/** Lets through users with any of the roles; others go to sign in, or to their own home page. */
export const roleGuard =
  (...roles: Role[]): CanActivateFn =>
  (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (auth.token() === null) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }
    return roles.some((role) => auth.hasRole(role)) ? true : router.parseUrl(auth.homePath());
  };
