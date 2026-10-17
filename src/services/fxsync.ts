import { rateKey } from '../domain/fx';
import { today } from '../domain/trip';
import type { Trip } from '../domain/types';
import { updateTrip } from './db';
import { fetchRate } from './rates';

/** Fetch & store automatic rates for every (date, currency) the trip uses. Returns count fetched. */
export async function refreshRates(trip: Trip, opts: { force?: boolean } = {}): Promise<number> {
  const base = trip.baseCurrency;
  const wanted = new Set<string>();
  const add = (date: string, cur: string) => cur !== base && wanted.add(rateKey(date, cur));
  trip.currencies.forEach((c) => add(today(), c));
  add(today(), trip.settings.settleCurrency);
  trip.expenses.forEach((e) => add(e.date, e.currency));
  trip.transfers.forEach((x) => add(x.date, x.currency));
  const todo = [...wanted].filter((k) => opts.force || !trip.autoRates[k]);
  const results: Record<string, number> = {};
  let lastErr: unknown;
  await Promise.all(
    todo.map(async (k) => {
      const [date, cur] = k.split('|');
      try {
        results[k] = await fetchRate(cur, base, date);
      } catch (e) {
        lastErr = e;
      }
    }),
  );
  const n = Object.keys(results).length;
  if (n) await updateTrip(trip.id, (d) => Object.assign(d.autoRates, results));
  if (todo.length && !n && lastErr) throw lastErr;
  return n;
}

/** Best-effort fetch for a single date/currency (used when saving an expense). */
export async function ensureRate(trip: Trip, date: string, cur: string) {
  if (cur === trip.baseCurrency || trip.autoRates[rateKey(date, cur)]) return;
  try {
    const rate = await fetchRate(cur, trip.baseCurrency, date);
    await updateTrip(trip.id, (d) => (d.autoRates[rateKey(date, cur)] = rate));
  } catch {
    /* offline: nearest stored rate or manual override will be used */
  }
}
