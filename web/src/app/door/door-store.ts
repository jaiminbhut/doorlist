import { Injectable } from '@angular/core';

export interface QueuedScan {
  scanId: string;
  code: string;
  scannedAt: string;
}

export interface CachedSigningKey {
  keyId: string;
  publicKey: string;
}

/**
 * What a door device keeps between page loads (ADR 8): its id and door name,
 * the ticket key for checking codes offline, scans waiting to sync, and the
 * tickets it has let in. All in localStorage, so it survives a reload or a
 * dropped connection. If storage is unavailable, it lasts as long as the page.
 */
@Injectable({ providedIn: 'root' })
export class DoorStore {
  private readonly fallback = new Map<string, string>();

  deviceId(): string {
    let id = this.read('doorlist.door.deviceId');
    if (!id) {
      id = crypto.randomUUID();
      this.write('doorlist.door.deviceId', id);
    }
    return id;
  }

  doorName(): string {
    return this.read('doorlist.door.name') ?? '';
  }

  setDoorName(name: string): void {
    this.write('doorlist.door.name', name.trim());
  }

  signingKey(): CachedSigningKey | null {
    return this.readJson<CachedSigningKey>('doorlist.door.signingKey');
  }

  setSigningKey(key: CachedSigningKey): void {
    this.write('doorlist.door.signingKey', JSON.stringify(key));
  }

  queue(eventId: number): QueuedScan[] {
    return this.readJson<QueuedScan[]>(`doorlist.door.queue.${eventId}`) ?? [];
  }

  enqueue(eventId: number, scan: QueuedScan): void {
    this.write(`doorlist.door.queue.${eventId}`, JSON.stringify([...this.queue(eventId), scan]));
  }

  /** Drops scans the server has answered; anything sent since stays queued. */
  removeFromQueue(eventId: number, scanIds: string[]): void {
    const synced = new Set(scanIds);
    this.write(
      `doorlist.door.queue.${eventId}`,
      JSON.stringify(this.queue(eventId).filter((scan) => !synced.has(scan.scanId))),
    );
  }

  hasAdmitted(eventId: number, ticketId: string): boolean {
    return (this.readJson<string[]>(`doorlist.door.admitted.${eventId}`) ?? []).includes(ticketId);
  }

  markAdmitted(eventId: number, ticketId: string): void {
    const admitted = this.readJson<string[]>(`doorlist.door.admitted.${eventId}`) ?? [];
    if (!admitted.includes(ticketId)) {
      this.write(`doorlist.door.admitted.${eventId}`, JSON.stringify([...admitted, ticketId]));
    }
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return this.fallback.get(key) ?? null;
    }
  }

  private readJson<T>(key: string): T | null {
    const text = this.read(key);
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      this.fallback.set(key, value);
    }
  }
}
