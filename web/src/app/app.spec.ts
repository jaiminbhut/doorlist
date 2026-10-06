import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Role } from './core/auth';
import { provideFakeAuth } from './testing/fake-auth';

describe('App', () => {
  const render = async (...roles: Role[]) => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideFakeAuth(...roles)],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  const links = (page: HTMLElement) =>
    [...page.querySelectorAll('nav a, .account a')].map((a) => a.textContent?.trim());

  it('renders the product name in the header', async () => {
    const page = await render();

    expect(page.querySelector('h1')?.textContent).toContain('Doorlist');
  });

  it('offers events, sign in and sign up to visitors', async () => {
    expect(links(await render())).toEqual(['Events', 'Sign in', 'Sign up']);
  });

  it('shows each role the pages for what it does', async () => {
    expect(links(await render('Attendee'))).toEqual(['Events', 'My tickets']);
    TestBed.resetTestingModule();
    const organizer = await render('Organizer');
    expect(links(organizer)).toEqual(['Events', 'Organize', 'Door']);
    TestBed.resetTestingModule();
    const doorStaff = await render('DoorStaff');
    expect(links(doorStaff)).toEqual(['Events', 'Door']);
    expect(organizer.querySelector('.account')?.textContent).toContain('Organizer');
    expect(doorStaff.querySelector('.account')?.textContent).toContain('Door staff');
  });
});
