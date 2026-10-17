import { z } from 'zod';
import { computeBalances, entityName } from '../domain/balances';
import { resolveRate } from '../domain/fx';
import { allocate, formatMoney, toMajor, toMinor } from '../domain/money';
import { normalizeCurrency } from '../domain/normalize';
import { planSettlement } from '../domain/settle';
import { computeShares } from '../domain/split';
import { CATEGORIES, defaultParticipants, memberName, newMember, today, uid } from '../domain/trip';
import type { Expense, ID, Item, Member, SplitMode, Trip } from '../domain/types';
import { validateExpense } from '../domain/validate';

/** Thrown for problems the model should fix (unknown name, bad amount…). */
export class ActionError extends Error {}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const ALL_WORDS = ['all', 'everyone', 'everybody', 'tat ca', 'moi nguoi', 'ca nhom', 'ca doan'];

export function findMember(trip: Trip, name: string): Member {
  const n = norm(name);
  const exact = trip.members.filter((m) => norm(m.name) === n);
  if (exact.length === 1) return exact[0];
  const partial = trip.members.filter((m) => norm(m.name).split(' ').includes(n) || norm(m.name).startsWith(n));
  if (partial.length === 1) return partial[0];
  const known = trip.members.map((m) => m.name).join(', ') || '(none)';
  if (partial.length > 1) throw new ActionError(`"${name}" is ambiguous: ${partial.map((m) => m.name).join(', ')}. Ask the user which one.`);
  throw new ActionError(`No member named "${name}". Known members: ${known}. Ask the user, or call add_members first.`);
}

/** Names → member ids. Accepts group names and "all"/"mọi người". */
export function resolveNames(trip: Trip, names: string[], date?: string): ID[] {
  const out: ID[] = [];
  for (const raw of names) {
    const n = norm(raw);
    if (ALL_WORDS.includes(n)) {
      out.push(...defaultParticipants(trip, date ?? today()));
      continue;
    }
    const g = trip.groups.find((x) => norm(x.name) === n) ?? trip.households.find((x) => norm(x.name) === n);
    if (g && !trip.members.some((m) => norm(m.name) === n)) {
      out.push(...g.memberIds);
      continue;
    }
    out.push(findMember(trip, raw).id);
  }
  return [...new Set(out)];
}

/* ---------- arg schemas (lenient: models send strings for numbers sometimes) ---------- */

const money = z.coerce.number().refine(Number.isFinite, 'must be a number');
const optMoney = money.optional().nullable();
const str = z.string().trim();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
  .optional()
  .nullable();
const currency = z
  .string()
  .trim()
  .transform((s) => normalizeCurrency(s, ''))
  .refine((s) => /^[A-Z]{3}$/.test(s), 'currency must be an ISO 4217 code')
  .optional()
  .nullable();

export const ExpenseArgs = z.object({
  title: str.optional(),
  amount: optMoney,
  currency,
  date,
  category: z.string().optional().nullable(),
  kind: z.enum(['expense', 'income']).optional().nullable(),
  paid_by: z.array(z.object({ name: str, amount: optMoney })).optional().nullable(),
  split_mode: z.enum(['equal', 'exact', 'percent', 'shares', 'adjust', 'itemized']).optional().nullable(),
  participants: z.array(z.object({ name: str, value: optMoney })).optional().nullable(),
  items: z
    .array(z.object({ name: str, amount: money, for: z.array(str).optional().nullable() }))
    .optional()
    .nullable(),
  tax: optMoney,
  service: optMoney,
  tip: optMoney,
  discount: optMoney,
  fee_pct: optMoney,
  fx_rate: optMoney,
  note: z.string().optional().nullable(),
});
export type ExpenseArgsT = z.infer<typeof ExpenseArgs>;

export function parseArgs<T extends z.ZodTypeAny>(schema: T, args: unknown): z.infer<T> {
  const r = schema.safeParse(args ?? {});
  if (!r.success) throw new ActionError(`Invalid arguments: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return r.data;
}

/**
 * Build (or update) an expense from friendly, name-based arguments in major units.
 * Missing fields keep the values of `base` when updating.
 */
export function buildExpense(trip: Trip, a: ExpenseArgsT, base?: Expense): Expense {
  const now = Date.now();
  const cur = a.currency ?? base?.currency ?? trip.currencies[trip.currencies.length - 1] ?? trip.baseCurrency;
  const d = a.date ?? base?.date ?? today();
  const m = (v: number) => toMinor(v, cur);
  const curChanged = !!base && cur !== base.currency;
  const fromBase = (v: number) => (curChanged ? m(toMajor(v, base!.currency)) : v);

  // Items & extras
  let items: Item[] | undefined = base?.items?.map((it) => ({ ...it, amount: fromBase(it.amount) }));
  if (a.items) {
    items = a.items.map((it) => ({
      id: uid(),
      name: it.name,
      amount: m(it.amount),
      split: { mode: 'equal', entries: (it.for?.length ? resolveNames(trip, it.for, d) : []).map((id) => ({ memberId: id, value: 1 })) },
    }));
  }
  const bx = base?.extras;
  const extras = {
    tax: a.tax != null ? m(a.tax) : bx ? fromBase(bx.tax) : 0,
    service: a.service != null ? m(a.service) : bx ? fromBase(bx.service) : 0,
    tip: a.tip != null ? m(a.tip) : bx ? fromBase(bx.tip) : 0,
    discount: a.discount != null ? Math.abs(m(a.discount)) : bx ? fromBase(bx.discount) : 0,
    mode: bx?.mode ?? ('proportional' as const),
  };
  const mode: SplitMode = a.split_mode ?? (a.items ? 'itemized' : (base?.split.mode ?? 'equal'));
  const itemsTotal = (items ?? []).reduce((s, it) => s + it.amount, 0);

  let amount: number;
  if (a.amount != null) amount = m(Math.abs(a.amount));
  else if (mode === 'itemized' && items?.length) amount = itemsTotal + extras.tax + extras.service + extras.tip - extras.discount;
  else if (base) amount = fromBase(base.amount);
  else throw new ActionError('amount is required');
  if (amount <= 0) throw new ActionError('amount must be greater than 0');

  // Payers
  let payers = base?.payers.map((p) => ({ ...p, amount: fromBase(p.amount) })) ?? [];
  if (a.paid_by?.length) {
    const ids = a.paid_by.map((p) => findMember(trip, p.name).id);
    const known = a.paid_by.reduce((s, p) => s + (p.amount != null ? m(p.amount) : 0), 0);
    // Payers without an explicit amount split whatever is left equally.
    const auto = [...a.paid_by.keys()].filter((i) => a.paid_by![i].amount == null);
    const parts = allocate(amount - known, auto.map(() => 1));
    payers = a.paid_by.map((p, i) => ({ memberId: ids[i], amount: p.amount != null ? m(p.amount) : parts[auto.indexOf(i)] }));
  } else if (!base) {
    throw new ActionError('paid_by is required: who paid? Ask the user if unclear.');
  } else if (payers.length === 1) {
    payers[0].amount = amount;
  }

  // Participants / split entries
  let entries = base?.split.entries.map((e) => ({ ...e })) ?? [];
  if (a.participants?.length) {
    entries = [];
    for (const p of a.participants) {
      for (const id of resolveNames(trip, [p.name], d)) {
        const v = p.value ?? null;
        const value = mode === 'exact' || mode === 'adjust' ? m(v ?? 0) : v ?? (mode === 'percent' ? NaN : 1);
        entries.push({ memberId: id, value });
      }
    }
    if (mode === 'percent' && entries.some((e) => Number.isNaN(e.value))) {
      const given = entries.filter((e) => !Number.isNaN(e.value)).reduce((s, e) => s + e.value, 0);
      const nan = entries.filter((e) => Number.isNaN(e.value));
      nan.forEach((e) => (e.value = (100 - given) / nan.length));
    }
  } else if (!base || a.split_mode) {
    const ids = entries.length ? entries.map((e) => e.memberId) : defaultParticipants(trip, d);
    entries = ids.map((id) => ({ memberId: id, value: mode === 'percent' ? 100 / ids.length : mode === 'exact' ? 0 : mode === 'adjust' ? 0 : 1 }));
    if (mode === 'exact') throw new ActionError('split_mode "exact" needs participants with value = amount owed.');
  } else if (curChanged && (mode === 'exact' || mode === 'adjust')) {
    entries = entries.map((e) => ({ ...e, value: fromBase(e.value) }));
  }

  const category = a.category && CATEGORIES.some((c) => c.id === a.category) ? a.category : (base?.category ?? 'other');
  const exp: Expense = {
    id: base?.id ?? uid(),
    kind: a.kind ?? base?.kind ?? 'expense',
    title: a.title ?? base?.title ?? '',
    category,
    date: d,
    currency: cur,
    amount,
    payers,
    split: { mode, entries },
    items: mode === 'itemized' ? (items?.length ? items : []) : undefined,
    extras: mode === 'itemized' ? extras : undefined,
    feePct: a.fee_pct != null ? a.fee_pct || undefined : base?.feePct,
    fxRate: a.fx_rate != null ? a.fx_rate || undefined : curChanged ? undefined : base?.fxRate,
    receiptImageId: base?.receiptImageId,
    note: a.note ?? base?.note,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  };
  const errors = validateExpense(trip, exp).filter((i) => i.severity === 'error');
  if (errors.length)
    throw new ActionError(
      `Expense not saved: ${errors.map((e) => e.code + (e.diff !== undefined ? ` (off by ${e.code === 'percent_not_100' ? e.diff : toMajor(e.diff, cur)})` : '')).join(', ')}`,
    );
  return exp;
}

/* ---------- read models handed back to the LLM ---------- */

const fmt = (minor: number, cur: string) => formatMoney(minor, cur, 'en-US');

export function describeExpense(trip: Trip, e: Expense) {
  const shares = computeShares(e);
  return {
    id: e.id,
    date: e.date,
    title: e.title,
    kind: e.kind,
    category: e.category,
    amount: toMajor(e.amount, e.currency),
    currency: e.currency,
    paid_by: e.payers.map((p) => ({ name: memberName(trip, p.memberId), amount: toMajor(p.amount, e.currency) })),
    split_mode: e.split.mode,
    shares: [...shares].map(([id, v]) => ({ name: memberName(trip, id), amount: toMajor(v, e.currency) })),
    ...(e.items?.length ? { items: e.items.map((it) => ({ name: it.name, amount: toMajor(it.amount, e.currency), for: it.split.entries.map((x) => memberName(trip, x.memberId)) })) } : {}),
    ...(e.note ? { note: e.note } : {}),
  };
}

export function describeTrip(trip: Trip, maxExpenses = 60) {
  const r = computeBalances(trip);
  return {
    trip_id: trip.id,
    name: trip.name,
    locked: trip.locked,
    base_currency: trip.baseCurrency,
    currencies: trip.currencies,
    dates: [trip.startDate, trip.endDate].filter(Boolean),
    members: trip.members.map((m) => ({
      name: m.name,
      kind: m.kind,
      ...(m.hostId ? { host: memberName(trip, m.hostId) } : {}),
      ...(m.joinDate ? { join_date: m.joinDate } : {}),
      ...(m.leaveDate ? { leave_date: m.leaveDate } : {}),
    })),
    groups: trip.groups.map((g) => ({ name: g.name, members: g.memberIds.map((id) => memberName(trip, id)) })),
    households: trip.households.map((g) => ({ name: g.name, members: g.memberIds.map((id) => memberName(trip, id)) })),
    total_spent: fmt(r.totalSpent, trip.baseCurrency),
    expense_count: trip.expenses.length,
    expenses: [...trip.expenses]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
      .slice(0, maxExpenses)
      .map((e) => describeExpense(trip, e)),
    transfers: trip.transfers.map((t) => ({ id: t.id, date: t.date, from: memberName(trip, t.from), to: memberName(trip, t.to), amount: toMajor(t.amount, t.currency), currency: t.currency })),
  };
}

export function describeBalances(trip: Trip) {
  const r = computeBalances(trip);
  const plan = planSettlement(trip, r);
  return {
    currency: trip.baseCurrency,
    total_spent: fmt(r.totalSpent, trip.baseCurrency),
    members: trip.members.map((m) => {
      const b = r.members.get(m.id)!;
      return { name: m.name, paid: fmt(b.paid, trip.baseCurrency), used: fmt(b.consumed, trip.baseCurrency), net: fmt(b.net, trip.baseCurrency) };
    }),
    settle_up: plan.transfers.map((t) => ({ from: entityName(trip, t.from), to: entityName(trip, t.to), amount: fmt(t.amount, t.currency) })),
    expenses_missing_rate: r.missing.map((e) => e.title || e.id),
    note: 'net > 0 means others owe this person',
  };
}

/* ---------- other mutations ---------- */

export function addMembers(trip: Trip, names: string[], kind: Member['kind'] = 'person', host?: string, joinDate?: string, leaveDate?: string) {
  const hostId = host ? findMember(trip, host).id : undefined;
  const added: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    if (trip.members.some((m) => norm(m.name) === norm(name))) continue;
    const m = newMember(name, kind);
    if (kind === 'guest' && hostId) m.hostId = hostId;
    if (joinDate) m.joinDate = joinDate;
    if (leaveDate) m.leaveDate = leaveDate;
    trip.members.push(m);
    added.push(name);
  }
  return added;
}

export function rateInfo(trip: Trip, cur: string, d: string) {
  const r = resolveRate(trip, cur, d);
  return r.rate ? `1 ${cur} = ${+r.rate.toPrecision(6)} ${trip.baseCurrency} (${r.source})` : `no rate for ${cur} yet`;
}
