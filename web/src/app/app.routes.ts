import { Routes } from '@angular/router';
import { roleGuard } from './core/role.guard';
import { DoorPage } from './door/door-page';
import { DoorSelectPage } from './door/door-select-page';
import { EventDetailPage } from './events/event-detail-page';
import { EventsPage } from './events/events-page';
import { LoginPage } from './login/login-page';
import { OrganizerEventPage } from './organizer/organizer-event-page';
import { OrganizerEventsPage } from './organizer/organizer-events-page';
import { SignupPage } from './signup/signup-page';
import { MyTicketsPage } from './tickets/my-tickets-page';

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
    path: 'door',
    component: DoorSelectPage,
    canActivate: [roleGuard('DoorStaff', 'Organizer')],
    title: 'Door · Doorlist',
  },
  {
    path: 'door/:id',
    component: DoorPage,
    canActivate: [roleGuard('DoorStaff', 'Organizer')],
    title: 'Check-in · Doorlist',
  },

  { path: '**', redirectTo: 'events' },
];
