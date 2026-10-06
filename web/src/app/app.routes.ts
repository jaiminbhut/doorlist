import { Routes } from '@angular/router';
import { AppDetailPage } from './apps/app-detail-page';
import { AppsPage } from './apps/apps-page';
import { signedInGuard } from './core/signed-in.guard';
import { LoginPage } from './login/login-page';
import { ReleaseBoardPage } from './releases/release-board-page';
import { ReleaseDetailPage } from './releases/release-detail-page';

export const routes: Routes = [
  { path: 'login', component: LoginPage, title: 'Sign in · Doorlist' },
  {
    path: '',
    canActivate: [signedInGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'releases' },
      { path: 'releases', component: ReleaseBoardPage, title: 'Releases · Doorlist' },
      { path: 'releases/:id', component: ReleaseDetailPage, title: 'Release · Doorlist' },
      { path: 'apps', component: AppsPage, title: 'Apps · Doorlist' },
      { path: 'apps/:id', component: AppDetailPage, title: 'App · Doorlist' },
    ],
  },
  { path: '**', redirectTo: '' },
];
