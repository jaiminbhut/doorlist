import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth';

describe('AuthService', () => {
  const hourFromNow = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const setUp = () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    return { auth: TestBed.inject(AuthService), http: TestBed.inject(HttpTestingController) };
  };

  beforeEach(() => sessionStorage.clear());

  it('signs in, exposes the user and roles, and keeps the session for the tab', () => {
    const { auth, http } = setUp();
    let signedIn = '';

    auth.signIn('lead@example.com', 'secret').subscribe((user) => (signedIn = user.email));
    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ email: 'lead@example.com', password: 'secret' });
    request.flush({
      accessToken: 'abc',
      expiresAt: hourFromNow(),
      user: { email: 'lead@example.com', displayName: 'Lead', roles: ['Lead'] },
    });

    expect(signedIn).toBe('lead@example.com');
    expect(auth.token()).toBe('abc');
    expect(auth.canManageApps()).toBe(true);
    expect(auth.canWorkOnReleases()).toBe(true);
    expect(sessionStorage.getItem('doorlist.session')).toContain('abc');
  });

  it('gives a developer release work but not app management', () => {
    sessionStorage.setItem(
      'doorlist.session',
      JSON.stringify({
        accessToken: 't',
        expiresAt: hourFromNow(),
        user: { email: 'd', displayName: 'D', roles: ['Developer'] },
      }),
    );
    const { auth } = setUp();

    expect(auth.canWorkOnReleases()).toBe(true);
    expect(auth.canManageApps()).toBe(false);
  });

  it('ignores a stored session that has expired', () => {
    sessionStorage.setItem(
      'doorlist.session',
      JSON.stringify({
        accessToken: 'old',
        expiresAt: '2000-01-01T00:00:00Z',
        user: { email: 'x', displayName: 'X', roles: [] },
      }),
    );
    const { auth } = setUp();

    expect(auth.token()).toBeNull();
    expect(auth.user()).toBeNull();
  });

  it('signs up as an attendee and lands them on their tickets', () => {
    const { auth, http } = setUp();

    auth.signUp('asha@example.com', 'A-strong-pass-1', 'Asha').subscribe();
    const request = http.expectOne('/api/auth/register');
    expect(request.request.body).toEqual({
      email: 'asha@example.com',
      password: 'A-strong-pass-1',
      displayName: 'Asha',
    });
    request.flush({
      accessToken: 'new',
      expiresAt: hourFromNow(),
      user: { email: 'asha@example.com', displayName: 'Asha', roles: ['Attendee'] },
    });

    expect(auth.token()).toBe('new');
    expect(auth.isAttendee()).toBe(true);
    expect(auth.homePath()).toBe('/tickets');
  });

  it('sends organizers to their dashboard', () => {
    sessionStorage.setItem(
      'doorlist.session',
      JSON.stringify({
        accessToken: 't',
        expiresAt: hourFromNow(),
        user: { email: 'o', displayName: 'O', roles: ['Organizer'] },
      }),
    );
    const { auth } = setUp();

    expect(auth.canManageEvents()).toBe(true);
    expect(auth.homePath()).toBe('/organizer');
  });

  it('sends door staff to the door', () => {
    sessionStorage.setItem(
      'doorlist.session',
      JSON.stringify({
        accessToken: 't',
        expiresAt: hourFromNow(),
        user: { email: 'd', displayName: 'D', roles: ['DoorStaff'] },
      }),
    );
    const { auth } = setUp();

    expect(auth.canCheckIn()).toBe(true);
    expect(auth.canManageEvents()).toBe(false);
    expect(auth.homePath()).toBe('/door');
  });

  it('signs out and forgets the session', () => {
    sessionStorage.setItem(
      'doorlist.session',
      JSON.stringify({
        accessToken: 't',
        expiresAt: hourFromNow(),
        user: { email: 'v', displayName: 'V', roles: ['Viewer'] },
      }),
    );
    const { auth } = setUp();

    auth.signOut();

    expect(auth.token()).toBeNull();
    expect(sessionStorage.getItem('doorlist.session')).toBeNull();
  });
});
