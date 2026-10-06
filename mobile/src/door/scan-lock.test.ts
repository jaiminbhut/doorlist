import { ScanLock } from './scan-lock';

describe('ScanLock: one read per code (ADR 9)', () => {
  it('takes a code the first time', () => {
    expect(new ScanLock().accept('A', 0)).toBe(true);
  });

  it('ignores the same code while it stays in view', () => {
    const lock = new ScanLock(3_000);
    lock.accept('A', 0);

    // The camera reports it ten times a second for five seconds.
    const repeats = Array.from({ length: 50 }, (_, i) => lock.accept('A', (i + 1) * 100));

    expect(repeats.every((taken) => !taken)).toBe(true);
  });

  it('takes the same code again after it has been out of view for the cooldown', () => {
    const lock = new ScanLock(3_000);
    lock.accept('A', 0);

    expect(lock.accept('A', 2_999)).toBe(false);
    expect(lock.accept('A', 6_000)).toBe(true);
  });

  it('takes a different code at once, and then the first one again', () => {
    const lock = new ScanLock(3_000);
    lock.accept('A', 0);

    expect(lock.accept('B', 100)).toBe(true);
    expect(lock.accept('A', 200)).toBe(true);
  });
});
