import { allocate } from './money';
import type { Expense, ID, Item, SplitEntry } from './types';

export type Shares = Map<ID, number>;

function add(map: Shares, id: ID, v: number) {
  if (v === 0 && map.has(id)) return;
  map.set(id, (map.get(id) ?? 0) + v);
}

function allocateEntries(total: number, entries: SplitEntry[], weight: (e: SplitEntry) => number): Shares {
  const parts = allocate(
    total,
    entries.map((e) => weight(e)),
  );
  const out: Shares = new Map();
  entries.forEach((e, i) => add(out, e.memberId, parts[i]));
  return out;
}

export function itemShares(item: Item): Shares {
  const entries = item.split.entries;
  if (entries.length === 0) return new Map();
  return allocateEntries(item.amount, entries, (e) => (item.split.mode === 'shares' ? e.value : 1));
}

export function itemsTotal(items: Item[] | undefined): number {
  return (items ?? []).reduce((a, it) => a + it.amount, 0);
}

/**
 * Who consumes how much of an expense, in minor units of the expense currency,
 * before card fees. Values always sum exactly to expense.amount (when anyone is assigned).
 */
export function computeShares(exp: Expense): Shares {
  const { split, amount } = exp;
  const entries = split.entries;
  switch (split.mode) {
    case 'equal':
      return allocateEntries(amount, entries, () => 1);
    case 'shares':
    case 'percent':
      return allocateEntries(amount, entries, (e) => e.value);
    case 'exact': {
      const out: Shares = new Map();
      entries.forEach((e) => add(out, e.memberId, Math.round(e.value)));
      const diff = amount - entries.reduce((a, e) => a + Math.round(e.value), 0);
      if (diff !== 0 && entries.length > 0) {
        // Keep the books balanced: spread any mismatch proportionally (validator warns the user).
        const fix = allocateEntries(diff, entries, (e) => Math.max(1, Math.abs(e.value)));
        fix.forEach((v, id) => add(out, id, v));
      }
      return out;
    }
    case 'adjust': {
      const adjSum = entries.reduce((a, e) => a + Math.round(e.value), 0);
      const base = allocateEntries(amount - adjSum, entries, () => 1);
      entries.forEach((e) => add(base, e.memberId, Math.round(e.value)));
      return base;
    }
    case 'itemized':
      return itemizedShares(exp);
  }
}

function itemizedShares(exp: Expense): Shares {
  const items = exp.items ?? [];
  const out: Shares = new Map();
  let assigned = 0;
  for (const it of items) {
    if (it.split.entries.length === 0) continue;
    itemShares(it).forEach((v, id) => add(out, id, v));
    assigned += it.amount;
  }
  // Remainder = tax + service + tip − discount + unassigned items + any rounding on the bill.
  const remainder = exp.amount - assigned;
  if (remainder !== 0) {
    let ids = [...out.keys()];
    if (ids.length === 0) ids = exp.split.entries.map((e) => e.memberId);
    if (ids.length === 0) return out;
    const proportional = (exp.extras?.mode ?? 'proportional') === 'proportional' && assigned !== 0;
    const parts = allocate(
      remainder,
      ids.map((id) => (proportional ? Math.abs(out.get(id) ?? 0) : 1)),
    );
    ids.forEach((id, i) => add(out, id, parts[i]));
  }
  return out;
}

/** Total including card fee, in minor units of expense currency. */
export function totalWithFee(exp: Expense): number {
  if (!exp.feePct) return exp.amount;
  return Math.round(exp.amount * (1 + exp.feePct / 100));
}

/** Scale a share map to a new total, keeping exact sums. */
export function rescale(shares: Shares, newTotal: number): Shares {
  const ids = [...shares.keys()];
  const parts = allocate(
    newTotal,
    ids.map((id) => Math.abs(shares.get(id) ?? 0)),
  );
  const out: Shares = new Map();
  ids.forEach((id, i) => out.set(id, parts[i]));
  return out;
}

export function payerShares(exp: Expense): Shares {
  const out: Shares = new Map();
  exp.payers.forEach((p) => add(out, p.memberId, p.amount));
  return out;
}

export function sumShares(s: Shares): number {
  let t = 0;
  s.forEach((v) => (t += v));
  return t;
}
