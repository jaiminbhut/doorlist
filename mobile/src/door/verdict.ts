import { formatTime } from '@/format';
import type { CheckInOutcome, ScanResult } from './checkin-api';

/**
 * What the door shows for the last scan, as on the web. "offline" verdicts
 * are this device's own decision, waiting to sync (ADR 8).
 */
export type Verdict =
  | { kind: 'server'; result: ScanResult }
  | { kind: 'offline'; outcome: 'admitted' | 'alreadyAdmittedHere' | 'wrongEvent' | 'invalid' }
  | { kind: 'error'; message: string; signInAgain?: boolean };

export type Tone = 'good' | 'bad' | 'warn';

/** Green to let in, red to refuse, amber for an offline admission or a problem. */
export function toneOf(verdict: Verdict): Tone {
  if (verdict.kind === 'error') {
    return 'warn';
  }
  const outcome: CheckInOutcome | 'alreadyAdmittedHere' =
    verdict.kind === 'server' ? verdict.result.outcome : verdict.outcome;
  if (outcome === 'admitted') {
    return verdict.kind === 'offline' ? 'warn' : 'good';
  }
  return 'bad';
}

/** The decision in a word or two, and why: the same words as the web's door. */
export function wordsFor(verdict: Verdict): { decision: string; reason: string } {
  switch (verdict.kind) {
    case 'error':
      return { decision: "Can't check", reason: verdict.message };
    case 'offline':
      switch (verdict.outcome) {
        case 'admitted':
          return {
            decision: 'Admit',
            reason:
              'Offline: a genuine ticket for this event. It will be recorded when the connection is back.',
          };
        case 'alreadyAdmittedHere':
          return { decision: "Don't admit", reason: 'Already used at this door.' };
        case 'wrongEvent':
          return { decision: "Don't admit", reason: wrongEvent };
        case 'invalid':
          return { decision: "Don't admit", reason: 'Not a valid ticket.' };
      }
      break;
    case 'server': {
      const { result } = verdict;
      switch (result.outcome) {
        case 'admitted':
          return { decision: 'Admit', reason: `${result.holderName}, ${result.ticketTypeName}` };
        case 'alreadyAdmitted':
          return {
            decision: "Don't admit",
            reason: `Already used: ${result.holderName} was admitted at ${result.admittedAtDoor ?? 'another door'}, ${result.admittedAt ? formatTime(result.admittedAt) : 'earlier'}.`,
          };
        case 'wrongEvent':
          return { decision: "Don't admit", reason: wrongEvent };
        case 'invalid':
          return { decision: "Don't admit", reason: 'Not a valid ticket.' };
      }
    }
  }
}

const wrongEvent = 'Wrong event: a real ticket, for a different event.';
