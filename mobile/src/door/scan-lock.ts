/**
 * One read per code (ADR 9). A camera reports the same QR code many times a
 * second for as long as it's in view. Each extra report would be another
 * scan, and online the summary would count every one as a duplicate.
 *
 * So a code is taken again only once something else has been read, or once
 * it has been out of view for the cooldown. Holding the same ticket in front
 * of the camera keeps it locked.
 */
export class ScanLock {
  private last: { code: string; seenAt: number } | null = null;

  constructor(private readonly cooldownMs = 3_000) {}

  accept(code: string, now = Date.now()): boolean {
    const repeat = this.last?.code === code && now - this.last.seenAt < this.cooldownMs;
    this.last = { code, seenAt: now };
    return !repeat;
  }
}
