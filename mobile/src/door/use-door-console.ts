import * as Network from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError, ApiUnreachableError } from '@/api/client';
import type { Session } from '@/auth/session';
import {
  MAX_SCANS_PER_BATCH,
  checkInSummary,
  fetchSigningKey,
  sendScans,
  type CheckInSummary,
  type Scan,
  type ScanResult,
} from './checkin-api';
import { deviceId, doorName, newScanId } from './door-device';
import {
  admitOffline,
  cacheSigningKey,
  cachedSigningKey,
  queuedCount,
  queuedScans,
  rememberAdmitted,
  removeFromQueue,
} from './door-store';
import { importSigningKey, verifyTicketCode, type SigningKey } from './ticket-code';
import type { Verdict } from './verdict';

/** While scans wait, the door tries to sync this often, as on the web. */
const SYNC_EVERY_MS = 20_000;
/** A batch of up to 200 scans gets longer than a single scan's 4 s. */
const SYNC_TIMEOUT_MS = 15_000;

export interface DoorConsole {
  verdict: Verdict | null;
  checking: boolean;
  summary: CheckInSummary | null;
  doorName: string;
  /** False until a ticket key is on the phone: then offline checks are impossible. */
  hasKey: boolean;
  /** Whether the last request reached the server. */
  offline: boolean;
  pending: number;
  syncing: boolean;
  /** The token expired with scans waiting: they sync after a fresh sign-in. */
  syncNeedsSignIn: boolean;
  /** Tickets this door let in offline that another door had let in first. */
  flagged: ScanResult[];
  check(code: string): Promise<void>;
  sync(): Promise<void>;
}

/**
 * Checks tickets at the door (ADR 8, ADR 9).
 *
 * Online, every scan goes to the server, and its answer is final. When the
 * server can't be reached in time, the phone decides alone: it checks the
 * code's signature with the cached public key, refuses tickets it has let in
 * itself, admits the rest, and queues those scans. The queue syncs when the
 * connection returns, when the app comes back to the front, every 20 seconds
 * while scans wait, and after a fresh sign-in. Any ticket another door
 * admitted first is flagged.
 */
export function useDoorConsole(eventId: number, session: Session): DoorConsole {
  const token = session.accessToken;
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [summary, setSummary] = useState<CheckInSummary | null>(null);
  const [label, setLabel] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncNeedsSignIn, setSyncNeedsSignIn] = useState(false);
  const [flagged, setFlagged] = useState<ScanResult[]>([]);

  // Listeners and timers read the latest values through refs.
  const tokenRef = useRef(token);
  const labelRef = useRef(label);
  const keyRef = useRef<SigningKey | null>(null);
  const busy = useRef(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    tokenRef.current = token;
    labelRef.current = label;
  }, [token, label]);

  const refreshSummary = useCallback(() => {
    checkInSummary(eventId, tokenRef.current).then(setSummary, () => undefined);
  }, [eventId]);

  const sync = useCallback(async () => {
    if (syncingRef.current) {
      return;
    }
    syncingRef.current = true;
    setSyncing(true);
    try {
      const device = { id: await deviceId(), label: labelRef.current };
      for (;;) {
        const batch = await queuedScans(eventId, MAX_SCANS_PER_BATCH);
        if (batch.length === 0) {
          break;
        }
        const results = await sendScans(eventId, tokenRef.current, device, batch, SYNC_TIMEOUT_MS);
        await removeFromQueue(results.map((result) => result.scanId));
        setFlagged((earlier) => [
          ...results.filter((result) => result.outcome === 'alreadyAdmitted'),
          ...earlier,
        ]);
        setOffline(false);
        setSyncNeedsSignIn(false);
      }
      refreshSummary();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSyncNeedsSignIn(true);
      } else if (error instanceof ApiUnreachableError) {
        setOffline(true);
      }
      // Anything else: the scans stay queued for the next try.
    } finally {
      setPending(await queuedCount(eventId).catch(() => 0));
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [eventId, refreshSummary]);

  // The door's name, its queue, and the ticket key: the cached copy at once,
  // then a fresh one from the API, kept for next time.
  useEffect(() => {
    let current = true;
    const adoptKey = (publicKey: string) => {
      try {
        keyRef.current = importSigningKey(publicKey);
        if (current) {
          setHasKey(true);
        }
      } catch {
        // Not a usable key: keep whatever was there.
      }
    };
    doorName().then(
      (name) => current && setLabel(name),
      () => undefined,
    );
    cachedSigningKey().then(
      (cached) => cached && adoptKey(cached.publicKey),
      () => undefined,
    );
    fetchSigningKey().then(
      (fresh) => {
        adoptKey(fresh.publicKey);
        void cacheSigningKey(fresh).catch(() => undefined);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, []);

  // Each time the event or the token changes (a fresh sign-in): the summary,
  // and any scans left from before.
  useEffect(() => {
    refreshSummary();
    queuedCount(eventId).then(
      (count) => {
        setPending(count);
        if (count > 0) {
          void sync();
        }
      },
      () => undefined,
    );
  }, [eventId, token, refreshSummary, sync]);

  // Sync when the connection returns, when the app is back in front, and every
  // 20 seconds while scans wait.
  useEffect(() => {
    const network = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void sync();
      }
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void sync();
      }
    });
    const timer = setInterval(() => {
      queuedCount(eventId).then(
        (count) => count > 0 && void sync(),
        () => undefined,
      );
    }, SYNC_EVERY_MS);
    return () => {
      network.remove();
      app.remove();
      clearInterval(timer);
    };
  }, [eventId, sync]);

  const decideOffline = useCallback(
    async (scan: Scan): Promise<Verdict> => {
      const key = keyRef.current;
      if (!key) {
        return {
          kind: 'error',
          message:
            "Offline, and this phone hasn't loaded the ticket key yet. Connect once, then it works offline.",
        };
      }
      const ticket = verifyTicketCode(scan.code, key);
      if (!ticket) {
        return { kind: 'offline', outcome: 'invalid' };
      }
      if (ticket.eventId !== eventId) {
        return { kind: 'offline', outcome: 'wrongEvent' };
      }
      const outcome = await admitOffline(eventId, ticket.ticketId, scan);
      setPending(await queuedCount(eventId));
      return { kind: 'offline', outcome };
    },
    [eventId],
  );

  const check = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || busy.current) {
        return;
      }
      busy.current = true;
      setChecking(true);
      // Its scan id stays with it: if the server did record it before the
      // deadline, syncing it again changes nothing (ADR 9).
      const scan: Scan = { scanId: newScanId(), code, scannedAt: new Date().toISOString() };

      try {
        const device = { id: await deviceId(), label: labelRef.current };
        const [result] = await sendScans(eventId, tokenRef.current, device, [scan]);
        if (
          result.ticketId &&
          (result.outcome === 'admitted' || result.outcome === 'alreadyAdmitted')
        ) {
          await rememberAdmitted(eventId, result.ticketId).catch(() => undefined);
        }
        setVerdict({ kind: 'server', result });
        setOffline(false);
        refreshSummary();
        // The connection is back: send anything still waiting.
        if ((await queuedCount(eventId)) > 0) {
          void sync();
        }
      } catch (error) {
        if (error instanceof ApiUnreachableError) {
          setOffline(true);
          setVerdict(await decideOffline(scan));
        } else {
          setVerdict(errorVerdict(error));
        }
      } finally {
        busy.current = false;
        setChecking(false);
      }
    },
    [eventId, refreshSummary, sync, decideOffline],
  );

  return {
    verdict,
    checking,
    summary,
    doorName: label,
    hasKey,
    offline,
    pending,
    syncing,
    syncNeedsSignIn,
    flagged,
    check,
    sync,
  };
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
  return { kind: 'error', message: 'The server refused this scan. Try again.' };
}
