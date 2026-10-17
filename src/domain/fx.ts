import { currencyDigits as digitsOf } from './money';
import type { Trip } from './types';

export type RateSource = 'same' | 'expense' | 'override' | 'exchange' | 'auto' | 'auto-near' | 'missing';

export interface ResolvedRate {
  /** Base-currency major units per 1 major unit of the currency. */
  rate?: number;
  source: RateSource;
}

export const rateKey = (date: string, currency: string) => `${date}|${currency.toUpperCase()}`;

/** Weighted rate from real exchanges between base and `currency` (both directions). */
export function exchangeRate(trip: Trip, currency: string): number | undefined {
  const base = trip.baseCurrency;
  let baseSum = 0;
  let curSum = 0;
  for (const x of trip.exchanges) {
    if (x.fromCurrency === base && x.toCurrency === currency) {
      baseSum += x.fromAmount / 10 ** digitsOf(base);
      curSum += x.toAmount / 10 ** digitsOf(currency);
    } else if (x.fromCurrency === currency && x.toCurrency === base) {
      baseSum += x.toAmount / 10 ** digitsOf(base);
      curSum += x.fromAmount / 10 ** digitsOf(currency);
    }
  }
  return curSum > 0 ? baseSum / curSum : undefined;
}


function nearestAuto(trip: Trip, currency: string, date: string): number | undefined {
  const suffix = `|${currency.toUpperCase()}`;
  const target = Date.parse(date);
  let best: number | undefined;
  let bestDiff = Infinity;
  for (const [k, v] of Object.entries(trip.autoRates)) {
    if (!k.endsWith(suffix)) continue;
    const diff = Math.abs(Date.parse(k.slice(0, 10)) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = v;
    }
  }
  return best;
}

/**
 * Priority: explicit (per expense/transfer) → trip manual override → real exchange records
 * → fetched rate for that date → nearest fetched rate.
 */
export function resolveRate(trip: Trip, currency: string, date: string, explicit?: number): ResolvedRate {
  if (currency === trip.baseCurrency) return { rate: 1, source: 'same' };
  if (explicit && explicit > 0) return { rate: explicit, source: 'expense' };
  const ov = trip.fxOverrides[currency];
  if (ov && ov > 0) return { rate: ov, source: 'override' };
  const ex = exchangeRate(trip, currency);
  if (ex) return { rate: ex, source: 'exchange' };
  const auto = trip.autoRates[rateKey(date, currency)];
  if (auto) return { rate: auto, source: 'auto' };
  const near = nearestAuto(trip, currency, date);
  if (near) return { rate: near, source: 'auto-near' };
  return { source: 'missing' };
}
