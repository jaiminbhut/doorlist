import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService, Role } from './core/auth';

const roleNames: Record<Role, string> = {
  Organizer: 'Organizer',
  DoorStaff: 'Door staff',
  Attendee: 'Attendee',
};

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected roleNames(roles: readonly Role[]): string {
    return roles.map((role) => roleNames[role]).join(', ');
  }

  protected signOut(): void {
    this.auth.signOut();
    void this.router.navigate(['/events']);
  }
}
