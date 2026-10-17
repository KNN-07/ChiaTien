import { resolveRate } from './fx';
import { allocate, convertMinor } from './money';
import { computeShares, payerShares, rescale, totalWithFee, type Shares } from './split';
import type { Expense, ID, Trip } from './types';

export interface ExpenseInBase {
  expense: Expense;
  rate?: number;
  /** Total in base minor units incl. fee; negative for income. */
  total: number;
  /** Consumption per member in base minor units (sums to total). */
  shares: Shares;
  /** Paid per member in base minor units (sums to total). */
  paid: Shares;
  missingRate: boolean;
}

export function expenseInBase(trip: Trip, exp: Expense): ExpenseInBase {
  const { rate } = resolveRate(trip, exp.currency, exp.date, exp.fxRate);
  const sign = exp.kind === 'income' ? -1 : 1;
  if (!rate) {
    return { expense: exp, total: 0, shares: new Map(), paid: new Map(), missingRate: true };
  }
  const total = sign * convertMinor(totalWithFee(exp), exp.currency, trip.baseCurrency, rate);
  return {
    expense: exp,
    rate,
    total,
    shares: rescale(computeShares(exp), total),
    paid: rescale(payerShares(exp), total),
    missingRate: false,
  };
}

export function transferInBase(trip: Trip, t: { amount: number; currency: string; date: string; fxRate?: number }) {
  const { rate } = resolveRate(trip, t.currency, t.date, t.fxRate);
  if (!rate) return undefined;
  return convertMinor(t.amount, t.currency, trip.baseCurrency, rate);
}

export interface MemberBalance {
  id: ID;
  paid: number;
  consumed: number;
  sent: number;
  received: number;
  /** > 0: others owe this member. */
  net: number;
}

export interface BalanceResult {
  members: Map<ID, MemberBalance>;
  expenses: ExpenseInBase[];
  missing: Expense[];
  totalSpent: number;
}

export function computeBalances(trip: Trip): BalanceResult {
  const members = new Map<ID, MemberBalance>();
  const get = (id: ID) => {
    let b = members.get(id);
    if (!b) {
      b = { id, paid: 0, consumed: 0, sent: 0, received: 0, net: 0 };
      members.set(id, b);
    }
    return b;
  };
  trip.members.forEach((m) => get(m.id));
  const expenses: ExpenseInBase[] = [];
  const missing: Expense[] = [];
  let totalSpent = 0;
  for (const exp of trip.expenses) {
    const eb = expenseInBase(trip, exp);
    expenses.push(eb);
    if (eb.missingRate) {
      missing.push(exp);
      continue;
    }
    totalSpent += eb.total;
    eb.paid.forEach((v, id) => (get(id).paid += v));
    eb.shares.forEach((v, id) => (get(id).consumed += v));
  }
  for (const t of trip.transfers) {
    const v = transferInBase(trip, t);
    if (v === undefined) continue;
    get(t.from).sent += v;
    get(t.to).received += v;
  }
  members.forEach((b) => (b.net = b.paid - b.consumed + b.sent - b.received));
  return { members, expenses, missing, totalSpent };
}

/** Map a member to the entity that settles for them (host for guests, household). */
export function settlementEntity(trip: Trip, memberId: ID): ID {
  let id = memberId;
  if (trip.settings.guestToHost) {
    const m = trip.members.find((x) => x.id === id);
    if (m?.kind === 'guest' && m.hostId && trip.members.some((x) => x.id === m.hostId)) id = m.hostId;
  }
  if (trip.settings.useHouseholds) {
    const hh = trip.households.find((h) => h.memberIds.includes(id));
    if (hh) return `hh:${hh.id}`;
  }
  return id;
}

export function entityName(trip: Trip, entityId: ID): string {
  if (entityId.startsWith('hh:')) return trip.households.find((h) => `hh:${h.id}` === entityId)?.name ?? '?';
  return trip.members.find((m) => m.id === entityId)?.name ?? '?';
}

export function entityNets(trip: Trip, result = computeBalances(trip)): Map<ID, number> {
  const out = new Map<ID, number>();
  result.members.forEach((b, id) => {
    const e = settlementEntity(trip, id);
    out.set(e, (out.get(e) ?? 0) + b.net);
  });
  return out;
}

/**
 * Pairwise debts (no simplification): debts[a][b] = how much a owes b, base minor units.
 * Only who-paid-for-whom relationships produce debts.
 */
export function pairwiseDebts(trip: Trip, result = computeBalances(trip)): Map<ID, Map<ID, number>> {
  const m = new Map<ID, Map<ID, number>>();
  const addDebt = (a: ID, b: ID, v: number) => {
    if (a === b || v === 0) return;
    if (v < 0) [a, b, v] = [b, a, -v];
    let row = m.get(a);
    if (!row) m.set(a, (row = new Map()));
    row.set(b, (row.get(b) ?? 0) + v);
  };
  for (const eb of result.expenses) {
    if (eb.missingRate) continue;
    const payerIds = [...eb.paid.keys()];
    const payerW = payerIds.map((id) => Math.abs(eb.paid.get(id) ?? 0));
    eb.shares.forEach((share, consumer) => {
      const parts = allocate(share, payerW);
      payerIds.forEach((p, i) =>
        addDebt(settlementEntity(trip, consumer), settlementEntity(trip, p), parts[i]),
      );
    });
  }
  for (const t of trip.transfers) {
    const v = transferInBase(trip, t);
    if (v === undefined) continue;
    // Paying someone reduces what you owe them: model it as the receiver owing the sender.
    addDebt(settlementEntity(trip, t.to), settlementEntity(trip, t.from), v);
  }
  return m;
}
