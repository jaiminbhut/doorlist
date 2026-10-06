import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { provideFakeAuth } from './testing/fake-auth';

describe('App', () => {
  const render = async (...roles: Parameters<typeof provideFakeAuth>) => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideFakeAuth(...roles)],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('renders the product name in the header', async () => {
    const page = await render();

    expect(page.querySelector('h1')?.textContent).toContain('Doorlist');
  });

  it('shows navigation and the role only when signed in', async () => {
    const signedOut = await render();
    expect(signedOut.querySelector('nav')).toBeNull();

    TestBed.resetTestingModule();
    const signedIn = await render('Developer');
    expect(signedIn.querySelector('nav')?.textContent).toContain('Developer');
  });
});
