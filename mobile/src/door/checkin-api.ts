import { request } from '@/api/client';

/** The API's verdict on a scan (ADR 8). */
export type CheckInOutcome = 'admitted' | 'alreadyAdmitted' | 'wrongEvent' | 'invalid';

/** A scan as the device records it. The scan id makes sending it twice harmless. */
export interface Scan {
  scanId: string;
  code: string;
  scannedAt: string;
}

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

export interface SigningKeyResponse {
  algorithm: string;
  keyId: string;
  publicKey: string;
}

/** The most scans the API takes in one batch. */
export const MAX_SCANS_PER_BATCH = 200;

/**
 * How long a scan waits for the server before the door decides by itself.
 * Venue networks hang more often than they fail (ADR 9).
 */
export const ONLINE_SCAN_TIMEOUT_MS = 4_000;

export async function sendScans(
  eventId: number,
  token: string,
  device: { id: string; label: string },
  scans: Scan[],
  timeoutMs = ONLINE_SCAN_TIMEOUT_MS,
): Promise<ScanResult[]> {
  const response = await request<{ results: ScanResult[] }>(`/api/events/${eventId}/checkins`, {
    method: 'POST',
    token,
    body: { deviceId: device.id, deviceLabel: device.label || null, scans },
    timeoutMs,
  });
  return response.results;
}

export function checkInSummary(eventId: number, token: string): Promise<CheckInSummary> {
  return request<CheckInSummary>(`/api/events/${eventId}/checkins/summary`, { token });
}

export function fetchSigningKey(): Promise<SigningKeyResponse> {
  return request<SigningKeyResponse>('/api/tickets/signing-key');
}
