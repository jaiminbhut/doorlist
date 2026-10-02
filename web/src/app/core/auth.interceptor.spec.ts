import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { fakeAuth } from '../testing/fake-auth';
import { AuthService } from './auth';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  const setUp = (auth: ReturnType<typeof fakeAuth>) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    return {
      client: TestBed.inject(HttpClient),
      http: TestBed.inject(HttpTestingController),
      router: TestBed.inject(Router),
    };
  };

  it('sends the bearer token to the API', () => {
    const { client, http } = setUp(fakeAuth('Viewer'));

    client.get('/api/apps').subscribe();

    expect(http.expectOne('/api/apps').request.headers.get('Authorization')).toBe(
      'Bearer test-token',
    );
  });

  it('does not send the token anywhere else', () => {
    const { client, http } = setUp(fakeAuth('Viewer'));

    client.get('https://elsewhere.example.com/data').subscribe();

    expect(
      http.expectOne('https://elsewhere.example.com/data').request.headers.has('Authorization'),
    ).toBe(false);
  });

  it('signs out and goes to the login page when the API answers 401', () => {
    const auth = fakeAuth('Viewer');
    const { client, http, router } = setUp(auth);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    client.get('/api/apps').subscribe({ error: () => undefined });
    http.expectOne('/api/apps').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.signedOut).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/login'], expect.anything());
  });
});
