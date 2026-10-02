import { Routes } from '@angular/router';
import { AppDetailPage } from './apps/app-detail-page';
import { AppsPage } from './apps/apps-page';
import { signedInGuard } from './core/signed-in.guard';
import { LoginPage } from './login/login-page';
import { ReleaseBoardPage } from './releases/release-board-page';
import { ReleaseDetailPage } from './releases/release-detail-page';

export const routes: Routes = [
  { path: 'login', component: LoginPage, title: 'Sign in · Shiplog' },
  {
    path: '',
    canActivate: [signedInGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'releases' },
      { path: 'releases', component: ReleaseBoardPage, title: 'Releases · Shiplog' },
      { path: 'releases/:id', component: ReleaseDetailPage, title: 'Release · Shiplog' },
      { path: 'apps', component: AppsPage, title: 'Apps · Shiplog' },
      { path: 'apps/:id', component: AppDetailPage, title: 'App · Shiplog' },
    ],
  },
  { path: '**', redirectTo: '' },
];
