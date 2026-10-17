import { resolveRate } from './fx';
import { itemsTotal } from './split';
import type { Expense, Trip } from './types';

export type IssueCode =
  | 'no_amount'
  | 'no_payer'
  | 'payers_mismatch'
  | 'no_participants'
  | 'percent_not_100'
  | 'exact_mismatch'
  | 'shares_zero'
  | 'items_mismatch'
  | 'unassigned_items'
  | 'missing_rate';

export interface Issue {
  code: IssueCode;
  /** Difference in minor units, where relevant. */
  diff?: number;
  severity: 'error' | 'warn';
}

export function validateExpense(trip: Trip, e: Expense): Issue[] {
  const out: Issue[] = [];
  if (!e.amount) out.push({ code: 'no_amount', severity: 'error' });
  if (e.payers.length === 0) out.push({ code: 'no_payer', severity: 'error' });
  const paid = e.payers.reduce((a, p) => a + p.amount, 0);
  if (e.payers.length > 0 && paid !== e.amount) out.push({ code: 'payers_mismatch', diff: e.amount - paid, severity: 'error' });

  const entries = e.split.entries;
  if (e.split.mode === 'itemized') {
    const items = e.items ?? [];
    const assigned = items.filter((i) => i.split.entries.length > 0);
    if (assigned.length === 0 && entries.length === 0) out.push({ code: 'no_participants', severity: 'error' });
    if (assigned.length < items.length) out.push({ code: 'unassigned_items', severity: 'warn' });
    const x = e.extras;
    const expected = itemsTotal(items) + (x ? x.tax + x.service + x.tip - x.discount : 0);
    if (items.length > 0 && expected !== e.amount) out.push({ code: 'items_mismatch', diff: e.amount - expected, severity: 'warn' });
  } else {
    if (entries.length === 0) out.push({ code: 'no_participants', severity: 'error' });
    if (e.split.mode === 'percent') {
      const s = entries.reduce((a, x) => a + x.value, 0);
      if (Math.abs(s - 100) > 0.001) out.push({ code: 'percent_not_100', diff: 100 - s, severity: 'error' });
    }
    if (e.split.mode === 'exact') {
      const s = entries.reduce((a, x) => a + Math.round(x.value), 0);
      if (s !== e.amount) out.push({ code: 'exact_mismatch', diff: e.amount - s, severity: 'error' });
    }
    if (e.split.mode === 'shares' && entries.length > 0 && entries.every((x) => x.value <= 0))
      out.push({ code: 'shares_zero', severity: 'error' });
  }
  if (!resolveRate(trip, e.currency, e.date, e.fxRate).rate) out.push({ code: 'missing_rate', severity: 'warn' });
  return out;
}
