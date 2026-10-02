import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Role } from '../core/auth';
import { provideFakeAuth } from '../testing/fake-auth';
import { ReleaseDetail } from './releases-api';
import { ReleaseDetailPage } from './release-detail-page';

describe('ReleaseDetailPage', () => {
  let fixture: ComponentFixture<ReleaseDetailPage>;
  let http: HttpTestingController;

  const page = () => fixture.nativeElement as HTMLElement;
  const shipButton = () => page().querySelector<HTMLButtonElement>('.ship-row button');
  const checkboxes = () => [
    ...page().querySelectorAll<HTMLInputElement>('.checklist input[type="checkbox"]'),
  ];

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const release = (overrides: Partial<ReleaseDetail> = {}): ReleaseDetail => ({
    id: 7,
    appId: 1,
    appName: 'Field App',
    environmentId: 2,
    environmentName: 'staging',
    isProduction: false,
    environmentApiUrl: 'https://staging-api.example.com/',
    version: '2.4.0',
    platform: 'android',
    notes: null,
    status: 'inProgress',
    createdAt: '2026-10-02T09:00:00Z',
    createdBy: 'developer@example.com',
    shippedAt: null,
    shippedBy: null,
    checklist: [
      {
        id: 1,
        position: 1,
        title: 'Build is configured for the staging environment',
        isDone: true,
        doneBy: 'd',
        doneAt: null,
      },
      {
        id: 2,
        position: 2,
        title: 'Build points at https://staging-api.example.com/',
        isDone: false,
        doneBy: null,
        doneAt: null,
      },
    ],
    ...overrides,
  });

  const render = async (detail: ReleaseDetail, ...roles: Role[]) => {
    TestBed.configureTestingModule({
      imports: [ReleaseDetailPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideFakeAuth(...roles),
      ],
    });
    fixture = TestBed.createComponent(ReleaseDetailPage);
    fixture.componentRef.setInput('id', String(detail.id));
    http = TestBed.inject(HttpTestingController);
    await settle();
    http.expectOne(`/api/releases/${detail.id}`).flush(detail);
    await settle();
  };

  afterEach(() => http.verify());

  it('keeps Ship disabled and says why while items are open', async () => {
    await render(release(), 'Developer');

    expect(shipButton()?.disabled).toBe(true);
    expect(page().querySelector('.notice')?.textContent).toContain(
      '1 checklist item is still open',
    );
  });

  it('ticks an item through the API and then allows shipping', async () => {
    await render(release(), 'Developer');

    checkboxes()[1].click();
    const request = http.expectOne({ method: 'PUT', url: '/api/releases/7/checklist/2' });
    expect(request.request.body).toEqual({ isDone: true });
    request.flush({ ...release().checklist[1], isDone: true, doneBy: 'developer@example.com' });
    await settle();

    expect(shipButton()?.disabled).toBe(false);
    shipButton()!.click();
    http.expectOne({ method: 'POST', url: '/api/releases/7/ship' }).flush(
      release({
        status: 'shipped',
        shippedBy: 'developer@example.com',
        shippedAt: '2026-10-02T10:00:00Z',
      }),
    );
    await settle();

    expect(page().querySelector('.shipped-by')?.textContent).toContain('developer@example.com');
    expect(checkboxes().every((box) => box.disabled)).toBe(true);
  });

  it('tells a developer that production is for leads', async () => {
    const done = release().checklist.map((item) => ({ ...item, isDone: true }));
    await render(
      release({ isProduction: true, environmentName: 'production', checklist: done }),
      'Developer',
    );

    expect(shipButton()?.disabled).toBe(true);
    expect(page().querySelector('.notice')?.textContent).toContain(
      'Only a lead can ship to production.',
    );
  });

  it('lets a lead ship to production once everything is done', async () => {
    const done = release().checklist.map((item) => ({ ...item, isDone: true }));
    await render(
      release({ isProduction: true, environmentName: 'production', checklist: done }),
      'Lead',
    );

    expect(shipButton()?.disabled).toBe(false);
  });

  it('is read-only for a viewer', async () => {
    await render(release(), 'Viewer');

    expect(shipButton()).toBeNull();
    expect(checkboxes().every((box) => box.disabled)).toBe(true);
  });
});
