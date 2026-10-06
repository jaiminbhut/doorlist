import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { QueuedScan } from './door-store';

export type CheckInOutcome = 'admitted' | 'alreadyAdmitted' | 'wrongEvent' | 'invalid';

export interface ScanResult {
  scanId: string;
  outcome: CheckInOutcome;
  ticketId: string | null;
  holderName: string | null;
  ticketTypeName: string | null;
  /** For admitted and alreadyAdmitted: the ticket's first admission. */
  admittedAt: string | null;
  admittedAtDoor: string | null;
}

export interface CheckInSummary {
  issued: number;
  admitted: number;
  duplicates: number;
  invalid: number;
  wrongEvent: number;
}

export interface SigningKey {
  algorithm: string;
  keyId: string;
  publicKey: string;
}

/** The most scans the API takes in one batch. */
export const MAX_SCANS_PER_BATCH = 200;

@Injectable({ providedIn: 'root' })
export class CheckInApi {
  private readonly http = inject(HttpClient);

  send(
    eventId: number,
    deviceId: string,
    deviceLabel: string,
    scans: QueuedScan[],
  ): Observable<ScanResult[]> {
    return this.http
      .post<{ results: ScanResult[] }>(`/api/events/${eventId}/checkins`, {
        deviceId,
        deviceLabel: deviceLabel || null,
        scans,
      })
      .pipe(map((response) => response.results));
  }

  summary(eventId: number): Observable<CheckInSummary> {
    return this.http.get<CheckInSummary>(`/api/events/${eventId}/checkins/summary`);
  }

  signingKey(): Observable<SigningKey> {
    return this.http.get<SigningKey>('/api/tickets/signing-key');
  }
}
