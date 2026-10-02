import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppSummary } from './apps-api';
import { AppsPage } from './apps-page';

describe('AppsPage', () => {
  let fixture: ComponentFixture<AppsPage>;
  let http: HttpTestingController;

  const page = () => fixture.nativeElement as HTMLElement;
  const input = () => page().querySelector<HTMLInputElement>('#app-name')!;
  const button = () => page().querySelector<HTMLButtonElement>('button[type="submit"]')!;

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const typeName = async (value: string) => {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    await settle();
  };

  const app = (id: number, name: string): AppSummary => ({
    id,
    name,
    createdAt: '2026-10-02T09:00:00Z',
  });

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [AppsPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(AppsPage);
    http = TestBed.inject(HttpTestingController);
    await settle();
  });

  afterEach(() => http.verify());

  it('lists the apps from the API', async () => {
    http.expectOne('/api/apps').flush([app(1, 'Field App')]);
    await settle();

    expect(page().querySelector('.app-name')?.textContent).toContain('Field App');
  });

  it('shows the empty state when there are no apps', async () => {
    http.expectOne('/api/apps').flush([]);
    await settle();

    expect(page().querySelector('.empty')?.textContent).toContain('No apps yet');
  });

  it('says so when the API cannot be reached', async () => {
    http.expectOne('/api/apps').flush(null, { status: 502, statusText: 'Bad Gateway' });
    await settle();

    expect(page().querySelector('[role="alert"]')?.textContent).toContain('Could not load apps');
  });

  it('keeps the add button disabled for a blank name', async () => {
    http.expectOne('/api/apps').flush([]);
    await typeName('   ');

    expect(button().disabled).toBe(true);
  });

  it('adds a created app to the list in name order and clears the input', async () => {
    http.expectOne('/api/apps').flush([app(1, 'Zeta')]);
    await typeName('  Alpha  ');
    button().click();

    const request = http.expectOne({ method: 'POST', url: '/api/apps' });
    expect(request.request.body).toEqual({ name: 'Alpha' });
    request.flush(app(2, 'Alpha'));
    await settle();

    const names = [...page().querySelectorAll('.app-name')].map((el) => el.textContent?.trim());
    expect(names).toEqual(['Alpha', 'Zeta']);
    expect(input().value).toBe('');
  });

  it('explains a duplicate name instead of failing silently', async () => {
    http.expectOne('/api/apps').flush([app(1, 'Field App')]);
    await typeName('Field App');
    button().click();

    http
      .expectOne({ method: 'POST', url: '/api/apps' })
      .flush(
        { title: 'An app with that name already exists.' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();

    expect(page().querySelector('[role="alert"]')?.textContent).toContain('already exists');
    expect(input().value).toBe('Field App');
  });
});
