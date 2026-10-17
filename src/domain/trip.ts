import type { Expense, ID, Member, Trip } from './types';

export function uid(): ID {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '').slice(0, 16);
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function today(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function newTrip(name: string, baseCurrency = 'VND'): Trip {
  const now = Date.now();
  return {
    id: uid(),
    name,
    emoji: '🏝️',
    baseCurrency,
    currencies: [baseCurrency],
    members: [],
    groups: [],
    households: [],
    expenses: [],
    transfers: [],
    exchanges: [],
    fxOverrides: {},
    autoRates: {},
    settings: {
      settleCurrency: baseCurrency,
      roundTo: baseCurrency === 'VND' ? 1000 : 0,
      simplify: true,
      useHouseholds: false,
      guestToHost: true,
    },
    locked: false,
    tombstones: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function newMember(name: string, kind: Member['kind'] = 'person'): Member {
  return { id: uid(), name, kind, updatedAt: Date.now() };
}

export function presentOn(m: Member, date: string): boolean {
  if (m.kind === 'pot') return false;
  if (m.joinDate && date < m.joinDate) return false;
  if (m.leaveDate && date > m.leaveDate) return false;
  return true;
}

/** Default people to split with: everyone (non-pot) present on that date. */
export function defaultParticipants(trip: Trip, date: string): ID[] {
  return trip.members.filter((m) => presentOn(m, date)).map((m) => m.id);
}

export function memberName(trip: Trip, id: ID): string {
  return trip.members.find((m) => m.id === id)?.name ?? '?';
}

export function emptyExpense(trip: Trip, payerId?: ID): Expense {
  const now = Date.now();
  const date = today();
  const people = defaultParticipants(trip, date);
  const payer = payerId ?? people[0] ?? trip.members[0]?.id;
  return {
    id: uid(),
    kind: 'expense',
    title: '',
    category: 'food',
    date,
    currency: trip.currencies[trip.currencies.length - 1] ?? trip.baseCurrency,
    amount: 0,
    payers: payer ? [{ memberId: payer, amount: 0 }] : [],
    split: { mode: 'equal', entries: people.map((id) => ({ memberId: id, value: 1 })) },
    createdAt: now,
    updatedAt: now,
  };
}

/** Remove a member everywhere it is referenced. Returns false if the member has money attached. */
export function memberInUse(trip: Trip, id: ID): boolean {
  return (
    trip.expenses.some(
      (e) =>
        e.payers.some((p) => p.memberId === id) ||
        e.split.entries.some((s) => s.memberId === id) ||
        (e.items ?? []).some((it) => it.split.entries.some((s) => s.memberId === id)),
    ) || trip.transfers.some((t) => t.from === id || t.to === id)
  );
}

export function cloneTrip(trip: Trip, name: string): Trip {
  const now = Date.now();
  return { ...structuredClone(trip), id: uid(), name, locked: false, tombstones: {}, createdAt: now, updatedAt: now };
}

export const CATEGORIES: { id: string; emoji: string }[] = [
  { id: 'food', emoji: '🍜' },
  { id: 'drinks', emoji: '🍺' },
  { id: 'coffee', emoji: '☕' },
  { id: 'lodging', emoji: '🏨' },
  { id: 'transport', emoji: '🚕' },
  { id: 'flight', emoji: '✈️' },
  { id: 'fuel', emoji: '⛽' },
  { id: 'tickets', emoji: '🎟️' },
  { id: 'activities', emoji: '🏄' },
  { id: 'shopping', emoji: '🛍️' },
  { id: 'groceries', emoji: '🛒' },
  { id: 'gifts', emoji: '🎁' },
  { id: 'health', emoji: '💊' },
  { id: 'fees', emoji: '🧾' },
  { id: 'other', emoji: '📦' },
];

export const categoryEmoji = (id: string) => CATEGORIES.find((c) => c.id === id)?.emoji ?? '📦';

export const COMMON_CURRENCIES = [
  'VND', 'USD', 'EUR', 'THB', 'JPY', 'KRW', 'SGD', 'MYR', 'IDR', 'PHP', 'LAK', 'KHR', 'CNY', 'HKD', 'TWD',
  'AUD', 'NZD', 'GBP', 'CHF', 'CAD', 'INR', 'AED', 'TRY', 'MOP',
];
