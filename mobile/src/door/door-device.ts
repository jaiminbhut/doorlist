import { randomUUID } from 'expo-crypto';
import { database, setting, setSetting } from '@/storage/database';

/**
 * Who this door device is (ADR 8): an id chosen once and kept, and the name
 * door staff give it, which other doors see when a ticket was used here.
 * Both belong to the phone, not to whoever is signed in.
 */
export async function deviceId(): Promise<string> {
  const db = await database();
  let id = await setting(db, 'door.deviceId');
  if (!id) {
    id = randomUUID();
    await setSetting(db, 'door.deviceId', id);
  }
  return id;
}

export async function doorName(): Promise<string> {
  return (await setting(await database(), 'door.name')) ?? '';
}

export async function setDoorName(name: string): Promise<void> {
  await setSetting(await database(), 'door.name', name.trim());
}

export function newScanId(): string {
  return randomUUID();
}
