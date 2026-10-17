import { computeBalances, entityNets, pairwiseDebts, type BalanceResult } from './balances';
import { resolveRate } from './fx';
import { convertMinor } from './money';
import type { ID, Trip } from './types';

export interface Settlement {
  from: ID;
  to: ID;
  /** Minor units of `currency`. */
  amount: number;
  /** Same amount in base minor units (unrounded). */
  baseAmount: number;
  currency: string;
}

export interface SettlementPlan {
  currency: string;
  rate?: number;
  transfers: Settlement[];
}

/** Greedy: repeatedly match the largest debtor with the largest creditor (≤ n−1 transfers). */
export function minimizeTransfers(nets: Map<ID, number>, tolerance = 0): { from: ID; to: ID; amount: number }[] {
  const debtors = [...nets].filter(([, v]) => v < -tolerance).map(([id, v]) => ({ id, v: -v }));
  const creditors = [...nets].filter(([, v]) => v > tolerance).map(([id, v]) => ({ id, v }));
  const out: { from: ID; to: ID; amount: number }[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.v - a.v);
    creditors.sort((a, b) => b.v - a.v);
    const d = debtors[0];
    const c = creditors[0];
    const amt = Math.min(d.v, c.v);
    if (amt > 0) out.push({ from: d.id, to: c.id, amount: amt });
    d.v -= amt;
    c.v -= amt;
    if (d.v <= tolerance) debtors.shift();
    if (c.v <= tolerance) creditors.shift();
  }
  return out;
}

function netPairs(debts: Map<ID, Map<ID, number>>): { from: ID; to: ID; amount: number }[] {
  const out: { from: ID; to: ID; amount: number }[] = [];
  const seen = new Set<string>();
  debts.forEach((row, a) =>
    row.forEach((_, b) => {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) return;
      seen.add(key);
      const ab = debts.get(a)?.get(b) ?? 0;
      const ba = debts.get(b)?.get(a) ?? 0;
      if (ab > ba) out.push({ from: a, to: b, amount: ab - ba });
      else if (ba > ab) out.push({ from: b, to: a, amount: ba - ab });
    }),
  );
  return out.sort((x, y) => y.amount - x.amount);
}

export function roundTo(minor: number, unit: number): number {
  if (!unit || unit <= 1) return minor;
  return Math.round(minor / unit) * unit;
}

export function planSettlement(trip: Trip, result: BalanceResult = computeBalances(trip)): SettlementPlan {
  const currency = trip.settings.settleCurrency || trip.baseCurrency;
  const today = new Date().toISOString().slice(0, 10);
  const { rate } = resolveRate(trip, currency, today);
  const raw = trip.settings.simplify ? minimizeTransfers(entityNets(trip, result)) : netPairs(pairwiseDebts(trip, result));
  if (!rate) return { currency, transfers: [] };
  const transfers = raw
    .map((t) => ({
      from: t.from,
      to: t.to,
      baseAmount: t.amount,
      currency,
      amount: roundTo(convertMinor(t.amount, trip.baseCurrency, currency, 1 / rate), trip.settings.roundTo),
    }))
    .filter((t) => t.amount > 0);
  return { currency, rate, transfers };
}
