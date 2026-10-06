import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, ApiUnreachableError } from '@/api/client';
import type { Session } from '@/auth/session';
import { checkInSummary, sendScans, type CheckInSummary, type Scan } from './checkin-api';
import { deviceId, doorName, newScanId } from './door-device';
import type { Verdict } from './verdict';

export interface DoorConsole {
  verdict: Verdict | null;
  checking: boolean;
  summary: CheckInSummary | null;
  doorName: string;
  check(code: string): Promise<void>;
}

/**
 * Checks tickets at the door (ADR 8): every scan goes to the server, and the
 * server's answer is final. One scan at a time; a scan that arrives while
 * another is being checked is ignored, as the camera keeps reading.
 */
export function useDoorConsole(eventId: number, session: Session): DoorConsole {
  const token = session.accessToken;
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [summary, setSummary] = useState<CheckInSummary | null>(null);
  const [label, setLabel] = useState('');
  const busy = useRef(false);

  useEffect(() => {
    let current = true;
    doorName().then(
      (name) => current && setLabel(name),
      () => undefined,
    );
    checkInSummary(eventId, token).then(
      (latest) => current && setSummary(latest),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [eventId, token]);

  const check = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || busy.current) {
        return;
      }
      busy.current = true;
      setChecking(true);
      const scan: Scan = { scanId: newScanId(), code, scannedAt: new Date().toISOString() };

      try {
        const [result] = await sendScans(eventId, token, { id: await deviceId(), label }, [scan]);
        setVerdict({ kind: 'server', result });
        checkInSummary(eventId, token).then(setSummary, () => undefined);
      } catch (error) {
        setVerdict(errorVerdict(error));
      } finally {
        busy.current = false;
        setChecking(false);
      }
    },
    [eventId, token, label],
  );

  return { verdict, checking, summary, doorName: label, check };
}

function errorVerdict(error: unknown): Verdict {
  if (error instanceof ApiError && error.status === 401) {
    return {
      kind: 'error',
      message: 'Your session has expired. Sign in again to keep checking tickets.',
      signInAgain: true,
    };
  }
  if (error instanceof ApiError && error.status === 403) {
    return { kind: 'error', message: 'This account can no longer check tickets.' };
  }
  if (error instanceof ApiUnreachableError) {
    return {
      kind: 'error',
      message: "Can't reach Doorlist, so this ticket wasn't checked. Try again.",
    };
  }
  return { kind: 'error', message: 'The server refused this scan. Try again.' };
}
