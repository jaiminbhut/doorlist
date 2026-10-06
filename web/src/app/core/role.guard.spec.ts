import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { provideFakeAuth } from '../testing/fake-auth';
import { Role } from './auth';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  const run = (guardRoles: Role[], userRoles: Role[]) => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideFakeAuth(...userRoles)],
    });
    const result = TestBed.runInInjectionContext(() =>
      roleGuard(...guardRoles)(
        {} as ActivatedRouteSnapshot,
        { url: '/organizer' } as RouterStateSnapshot,
      ),
    );
    return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
  };

  it('lets in a user with the role', () => {
    expect(run(['Organizer'], ['Organizer'])).toBe(true);
  });

  it('sends a signed-out visitor to sign in, and back afterwards', () => {
    expect(run(['Organizer'], [])).toBe('/login?returnUrl=%2Forganizer');
  });

  it('sends a signed-in user without the role to their own home page', () => {
    expect(run(['Organizer'], ['Attendee'])).toBe('/tickets');
  });
});
