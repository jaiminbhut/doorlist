import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LoginPage, safeReturnUrl } from './login-page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let http: HttpTestingController;
  let navigated: string | undefined;

  const page = () => fixture.nativeElement as HTMLElement;

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const fillIn = async (email: string, password: string) => {
    for (const [selector, value] of [
      ['#email', email],
      ['#password', password],
    ]) {
      const input = page().querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    await settle();
  };

  beforeEach(async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(LoginPage);
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(async (url) => {
      navigated = String(url);
      return true;
    });
    navigated = undefined;
    await settle();
  });

  it('shows one clear message for bad credentials', async () => {
    await fillIn('lead@example.com', 'wrong');
    page().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

    http
      .expectOne('/api/auth/login')
      .flush(
        { title: 'Email or password is incorrect.' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle();

    expect(page().querySelector('[role="alert"]')?.textContent).toContain(
      'Email or password is incorrect.',
    );
    expect(navigated).toBeUndefined();
  });

  it('goes back to where the user was headed after signing in', async () => {
    fixture.componentRef.setInput('returnUrl', '/releases/7');
    await fillIn('lead@example.com', 'right');
    page().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

    http.expectOne('/api/auth/login').flush({
      accessToken: 't',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      user: { email: 'lead@example.com', displayName: 'Lead', roles: ['Lead'] },
    });
    await settle();

    expect(navigated).toBe('/releases/7');
  });

  it('goes to the page for what the user does when there is nowhere to return to', async () => {
    await fillIn('organizer@example.com', 'right');
    page().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

    http.expectOne('/api/auth/login').flush({
      accessToken: 't',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      user: { email: 'organizer@example.com', displayName: 'Organizer', roles: ['Organizer'] },
    });
    await settle();

    expect(navigated).toBe('/organizer');
  });

  it('never redirects off the site after signing in', () => {
    expect(safeReturnUrl('https://evil.example.com')).toBeNull();
    expect(safeReturnUrl('//evil.example.com')).toBeNull();
    expect(safeReturnUrl(undefined)).toBeNull();
    expect(safeReturnUrl('/events/3')).toBe('/events/3');
  });
});
