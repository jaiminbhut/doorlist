import { Routes } from '@angular/router';
import { AppsPage } from './apps/apps-page';

export const routes: Routes = [
  { path: '', component: AppsPage, title: 'Apps · Shiplog' },
  { path: '**', redirectTo: '' },
];
