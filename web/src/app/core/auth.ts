import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

export type Role = 'Lead' | 'Developer' | 'Viewer';

export interface SignedInUser {
  email: string;
  displayName: string;
  roles: Role[];
}

interface Session {
  accessToken: string;
  expiresAt: string;
  user: SignedInUser;
}

const STORAGE_KEY = 'doorlist.session';

/**
 * Holds the signed-in user and their short-lived access token (ADR 4). The
 * session lives in sessionStorage: one tab, gone when the tab closes.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = signal<Session | null>(readStoredSession());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly canManageApps = computed(() => this.hasRole('Lead'));
  readonly canWorkOnReleases = computed(() => this.hasRole('Lead') || this.hasRole('Developer'));

  hasRole(role: Role): boolean {
    return this.session()?.user.roles.includes(role) ?? false;
  }

  /** The bearer token, or null when signed out or expired. */
  token(): string | null {
    const session = this.session();
    if (!session) {
      return null;
    }
    if (isExpired(session)) {
      this.signOut();
      return null;
    }
    return session.accessToken;
  }

  signIn(email: string, password: string): Observable<SignedInUser> {
    return this.http.post<Session>('/api/auth/login', { email, password }).pipe(
      tap((session) => {
        this.session.set(session);
        writeStoredSession(session);
      }),
      map((session) => session.user),
    );
  }

  signOut(): void {
    this.session.set(null);
    writeStoredSession(null);
  }
}

function isExpired(session: Session): boolean {
  return Date.parse(session.expiresAt) <= Date.now();
}

function readStoredSession(): Session | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    const session = stored ? (JSON.parse(stored) as Session) : null;
    return session && !isExpired(session) ? session : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: Session | null): void {
  try {
    if (session) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the
    // session then lasts only as long as the page.
  }
}
