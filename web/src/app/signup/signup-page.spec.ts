import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SignupPage } from './signup-page';

describe('SignupPage', () => {
  let fixture: ComponentFixture<SignupPage>;
  let http: HttpTestingController;
  const page = () => fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const fillIn = async (name: string, email: string, password: string) => {
    for (const [selector, value] of [
      ['#signup-name', name],
      ['#signup-email', email],
      ['#signup-password', password],
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
      imports: [SignupPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(SignupPage);
    http = TestBed.inject(HttpTestingController);
    await settle();
  });

  afterEach(() => http.verify());

  it('signs up as an attendee and goes to the events', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fillIn(' Asha ', 'asha@example.com', 'A-strong-pass-1');
    page().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

    const request = http.expectOne('/api/auth/register');
    expect(request.request.body).toEqual({
      email: 'asha@example.com',
      password: 'A-strong-pass-1',
      displayName: 'Asha',
    });
    request.flush({
      accessToken: 't',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      user: { email: 'asha@example.com', displayName: 'Asha', roles: ['Attendee'] },
    });
    await settle();

    expect(navigate).toHaveBeenCalledWith('/events');
  });

  it("shows the API's message next to the field it's about", async () => {
    await fillIn('Asha', 'taken@example.com', 'A-strong-pass-1');
    page().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

    http
      .expectOne('/api/auth/register')
      .flush(
        { errors: { email: ["Email 'taken@example.com' is already taken."] } },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();

    const emailField = page().querySelector('#signup-email')!.closest('.field')!;
    expect(emailField.querySelector('[role="alert"]')?.textContent).toContain('already taken');
  });

  it('keeps the button disabled until the password is long enough', async () => {
    await fillIn('Asha', 'asha@example.com', 'short');

    expect(page().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  });
});
