import { computeBalances } from '../domain/balances';
import { toMajor } from '../domain/money';
import { memberName } from '../domain/trip';
import type { Trip } from '../domain/types';

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function tripToCsv(trip: Trip): string {
  const r = computeBalances(trip);
  const base = trip.baseCurrency;
  const people = trip.members;
  const header = ['date', 'title', 'category', 'kind', 'amount', 'currency', 'fee_pct', 'rate', `total_${base}`, 'paid_by', ...people.map((m) => `share_${m.name}`)];
  const rows = r.expenses.map((eb) => {
    const e = eb.expense;
    return [
      e.date,
      e.title,
      e.category,
      e.kind,
      toMajor(e.amount, e.currency),
      e.currency,
      e.feePct ?? '',
      eb.rate ?? '',
      toMajor(eb.total, base),
      e.payers.map((p) => `${memberName(trip, p.memberId)}:${toMajor(p.amount, e.currency)}`).join(' | '),
      ...people.map((m) => (eb.shares.has(m.id) ? toMajor(eb.shares.get(m.id)!, base) : '')),
    ];
  });
  const summary = people.map((m) => {
    const b = r.members.get(m.id)!;
    return ['', `${m.name} — paid/used/net`, '', '', toMajor(b.paid, base), base, '', '', toMajor(b.consumed, base), toMajor(b.net, base)];
  });
  // BOM so Excel opens UTF-8 (Vietnamese) correctly.
  return '﻿' + [header, ...rows, [], ...summary].map((row) => row.map(esc).join(',')).join('\n');
}
