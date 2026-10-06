import { Routes } from '@angular/router';
import { AppDetailPage } from './apps/app-detail-page';
import { AppsPage } from './apps/apps-page';
import { roleGuard } from './core/role.guard';
import { EventDetailPage } from './events/event-detail-page';
import { EventsPage } from './events/events-page';
import { LoginPage } from './login/login-page';
import { OrganizerEventPage } from './organizer/organizer-event-page';
import { OrganizerEventsPage } from './organizer/organizer-events-page';
import { ReleaseBoardPage } from './releases/release-board-page';
import { ReleaseDetailPage } from './releases/release-detail-page';
import { SignupPage } from './signup/signup-page';
import { MyTicketsPage } from './tickets/my-tickets-page';

/** The retired release tracker's roles (ADR 6); its pages go with it. */
const releaseTracker = roleGuard('Lead', 'Developer', 'Viewer');

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'events' },

  // Open to everyone.
  { path: 'events', component: EventsPage, title: 'Events · Doorlist' },
  { path: 'events/:id', component: EventDetailPage, title: 'Event · Doorlist' },
  { path: 'login', component: LoginPage, title: 'Sign in · Doorlist' },
  { path: 'signup', component: SignupPage, title: 'Sign up · Doorlist' },

  {
    path: 'tickets',
    component: MyTicketsPage,
    canActivate: [roleGuard('Attendee')],
    title: 'My tickets · Doorlist',
  },
  {
    path: 'organizer',
    component: OrganizerEventsPage,
    canActivate: [roleGuard('Organizer')],
    title: 'Organize · Doorlist',
  },
  {
    path: 'organizer/events/:id',
    component: OrganizerEventPage,
    canActivate: [roleGuard('Organizer')],
    title: 'Organize event · Doorlist',
  },

  {
    path: 'releases',
    component: ReleaseBoardPage,
    canActivate: [releaseTracker],
    title: 'Releases · Doorlist',
  },
  {
    path: 'releases/:id',
    component: ReleaseDetailPage,
    canActivate: [releaseTracker],
    title: 'Release · Doorlist',
  },
  { path: 'apps', component: AppsPage, canActivate: [releaseTracker], title: 'Apps · Doorlist' },
  {
    path: 'apps/:id',
    component: AppDetailPage,
    canActivate: [releaseTracker],
    title: 'App · Doorlist',
  },

  { path: '**', redirectTo: 'events' },
];
