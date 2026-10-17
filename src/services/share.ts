import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { z } from 'zod';
import { normalizeTrip } from '../domain/merge';
import type { Trip } from '../domain/types';

/** Loose structural check: enough to reject garbage, tolerant of older/newer fields. */
const TripShape = z
  .object({
    id: z.string(),
    name: z.string(),
    baseCurrency: z.string().length(3),
    members: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()),
    expenses: z.array(z.object({ id: z.string(), amount: z.number(), currency: z.string() }).passthrough()),
    updatedAt: z.number(),
  })
  .passthrough();

export function parseTrip(data: unknown): Trip {
  const t = TripShape.parse(data) as unknown as Trip;
  // Receipt images are stored locally only.
  return normalizeTrip({ ...t, expenses: t.expenses.map((e) => ({ ...e, receiptImageId: undefined })) });
}

export function encodeTrip(trip: Trip): string {
  const slim = { ...trip, expenses: trip.expenses.map(({ receiptImageId: _r, ...e }) => e) };
  return compressToEncodedURIComponent(JSON.stringify(slim));
}

export function decodeTrip(payload: string): Trip {
  const json = decompressFromEncodedURIComponent(payload);
  if (!json) throw new Error('Invalid link');
  return parseTrip(JSON.parse(json));
}

export function shareUrl(trip: Trip): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/import?d=${encodeTrip(trip)}`;
}

export function downloadFile(name: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^\w-]+/g, '_').slice(0, 40) || 'trip';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
