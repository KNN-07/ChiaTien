import { useEffect, useState } from 'react';
import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { normalizeTrip } from '../domain/merge';
import type { ID, Trip } from '../domain/types';

export interface ReceiptImage {
  id: ID;
  tripId: ID;
  blob: Blob;
  createdAt: number;
}

class ChiaTienDB extends Dexie {
  trips!: Table<Trip, string>;
  images!: Table<ReceiptImage, string>;
  constructor() {
    super('chiatien');
    this.version(1).stores({ trips: 'id, updatedAt', images: 'id, tripId' });
  }
}

export const db = new ChiaTienDB();

export function useTrips(): Trip[] | undefined {
  return useLiveQuery(() => db.trips.orderBy('updatedAt').reverse().toArray(), []);
}

/** undefined while loading, null if not found. */
export function useTrip(id: ID | undefined): Trip | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.trips.get(id)) ?? null) : null), [id]);
}

export async function saveTrip(trip: Trip) {
  await db.trips.put(normalizeTrip(trip));
}

/** Apply a mutation to a fresh copy of the trip and persist it. */
export async function updateTrip(id: ID, mutate: (t: Trip) => void) {
  await db.transaction('rw', db.trips, async () => {
    const t = await db.trips.get(id);
    if (!t) return;
    const draft = structuredClone(t);
    mutate(draft);
    draft.updatedAt = Date.now();
    await db.trips.put(draft);
  });
}

export async function deleteTrip(id: ID) {
  await db.transaction('rw', db.trips, db.images, async () => {
    await db.trips.delete(id);
    await db.images.where('tripId').equals(id).delete();
  });
}

type Entity = { id: ID; updatedAt: number };

export function upsert<T extends Entity>(list: T[], item: T) {
  const stamped = { ...item, updatedAt: Date.now() };
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = stamped;
  else list.push(stamped);
}

export function removeFrom<T extends Entity>(trip: Trip, list: T[], id: ID) {
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list.splice(i, 1);
  trip.tombstones[id] = Date.now();
}

export async function putImage(tripId: ID, id: ID, blob: Blob) {
  await db.images.put({ id, tripId, blob, createdAt: Date.now() });
}

export function useImageUrl(id: ID | undefined): string | undefined {
  const img = useLiveQuery(async () => (id ? db.images.get(id) : undefined), [id]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!img) return setUrl(undefined);
    const u = URL.createObjectURL(img.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [img]);
  return url;
}
