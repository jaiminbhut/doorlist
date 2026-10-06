import type { ScanResult } from './checkin-api';
import { toneOf, wordsFor, type Verdict } from './verdict';

const result = (overrides: Partial<ScanResult>): ScanResult => ({
  scanId: 's1',
  outcome: 'admitted',
  ticketId: 't1',
  holderName: 'Asha Rao',
  ticketTypeName: 'General admission',
  admittedAt: '2026-10-09T20:15:00Z',
  admittedAtDoor: 'North door',
  ...overrides,
});

describe('toneOf, as on the web', () => {
  it.each<[Verdict, string]>([
    [{ kind: 'server', result: result({ outcome: 'admitted' }) }, 'good'],
    [{ kind: 'server', result: result({ outcome: 'alreadyAdmitted' }) }, 'bad'],
    [{ kind: 'server', result: result({ outcome: 'wrongEvent' }) }, 'bad'],
    [{ kind: 'server', result: result({ outcome: 'invalid' }) }, 'bad'],
    [{ kind: 'offline', outcome: 'admitted' }, 'warn'],
    [{ kind: 'offline', outcome: 'alreadyAdmittedHere' }, 'bad'],
    [{ kind: 'error', message: 'x' }, 'warn'],
  ])('%j is %s', (verdict, tone) => {
    expect(toneOf(verdict)).toBe(tone);
  });
});

describe('wordsFor, the web door’s words', () => {
  it('admits with the holder and ticket type', () => {
    expect(wordsFor({ kind: 'server', result: result({}) })).toEqual({
      decision: 'Admit',
      reason: 'Asha Rao, General admission',
    });
  });

  it('says where and when an already-used ticket got in', () => {
    expect(wordsFor({ kind: 'server', result: result({ outcome: 'alreadyAdmitted' }) })).toEqual({
      decision: "Don't admit",
      reason: 'Already used: Asha Rao was admitted at North door, 20:15.',
    });
  });

  it('says "another door" when the first door had no name', () => {
    const verdict: Verdict = {
      kind: 'server',
      result: result({ outcome: 'alreadyAdmitted', admittedAtDoor: null }),
    };
    expect(wordsFor(verdict).reason).toBe(
      'Already used: Asha Rao was admitted at another door, 20:15.',
    );
  });

  it('says an offline admission will be recorded later', () => {
    expect(wordsFor({ kind: 'offline', outcome: 'admitted' }).reason).toMatch(
      /^Offline: a genuine ticket for this event\./,
    );
  });

  it('shows a problem as "Can\'t check"', () => {
    expect(wordsFor({ kind: 'error', message: 'No connection.' })).toEqual({
      decision: "Can't check",
      reason: 'No connection.',
    });
  });
});
