import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Role } from '../core/auth';
import { provideFakeAuth } from '../testing/fake-auth';
import { ReleaseSummary } from './releases-api';
import { ReleaseBoardPage } from './release-board-page';

describe('ReleaseBoardPage', () => {
  let fixture: ComponentFixture<ReleaseBoardPage>;
  let http: HttpTestingController;

  const page = () => fixture.nativeElement as HTMLElement;

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const summary = (
    id: number,
    status: ReleaseSummary['status'],
    isProduction = false,
  ): ReleaseSummary => ({
    id,
    appId: 1,
    appName: 'Field App',
    environmentId: 2,
    environmentName: isProduction ? 'production' : 'staging',
    isProduction,
    version: `1.${id}.0`,
    platform: 'ios',
    status,
    checklistDone: 2,
    checklistTotal: 4,
    createdAt: '2026-10-02T09:00:00Z',
    shippedAt: status === 'shipped' ? '2026-10-02T10:00:00Z' : null,
  });

  const render = async (...roles: Role[]) => {
    TestBed.configureTestingModule({
      imports: [ReleaseBoardPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideFakeAuth(...roles),
      ],
    });
    fixture = TestBed.createComponent(ReleaseBoardPage);
    http = TestBed.inject(HttpTestingController);
    await settle();
  };

  afterEach(() => http.verify());

  it('splits releases into in progress and shipped, with checklist progress', async () => {
    await render('Viewer');
    http.expectOne('/api/releases').flush([summary(1, 'inProgress', true), summary(2, 'shipped')]);
    await settle();

    const inProgress = page().querySelector('.in-progress')!;
    expect(inProgress.textContent).toContain('Field App 1.1.0');
    expect(inProgress.textContent).toContain('2/4 checks');
    expect(inProgress.querySelector('.badge.production')).not.toBeNull();
    expect(page().querySelector('.shipped')?.textContent).toContain('Field App 1.2.0');
  });

  it('offers the new-release form to developers but not viewers', async () => {
    await render('Viewer');
    http.expectOne('/api/releases').flush([]);
    await settle();
    expect(page().querySelector('#release-app')).toBeNull();

    TestBed.resetTestingModule();
    await render('Developer');
    http.expectOne('/api/releases').flush([]);
    http.expectOne('/api/apps').flush([]);
    await settle();
    expect(page().querySelector('#release-app')).not.toBeNull();
  });
});
