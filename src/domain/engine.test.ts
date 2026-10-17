import { describe, expect, it } from 'vitest';
import { computeBalances, entityNets } from './balances';
import { resolveRate } from './fx';
import { mergeTrips } from './merge';
import { allocate, parseAmount } from './money';
import { planSettlement, minimizeTransfers } from './settle';
import { computeShares, sumShares } from './split';
import { newMember, newTrip, emptyExpense, presentOn } from './trip';
import type { Expense, Trip } from './types';
import { validateExpense } from './validate';

function setup(names = ['An', 'Bình', 'Chi']) {
  const trip = newTrip('Test', 'VND');
  trip.settings.roundTo = 0;
  const ms = names.map((n) => newMember(n));
  trip.members.push(...ms);
  return { trip, ids: ms.map((m) => m.id) };
}

function exp(trip: Trip, patch: Partial<Expense>): Expense {
  const e = { ...emptyExpense(trip), currency: 'VND', ...patch };
  trip.expenses.push(e);
  return e;
}

const netOf = (trip: Trip) => {
  const r = computeBalances(trip);
  return Object.fromEntries([...r.members].map(([id, b]) => [id, b.net]));
};

describe('allocate', () => {
  it('sums exactly with remainders', () => {
    expect(allocate(100000, [1, 1, 1])).toEqual([33334, 33333, 33333]);
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocate(10, [0, 0])).toEqual([0, 0]);
    expect(allocate(7, [1, 0, 1]).reduce((a, b) => a + b)).toBe(7);
  });
});

describe('parseAmount', () => {
  it('handles VN formats and shorthands', () => {
    expect(parseAmount('1.200.000', 'VND')).toBe(1200000);
    expect(parseAmount('150k', 'VND')).toBe(150000);
    expect(parseAmount('1.5tr', 'VND')).toBe(1500000);
    expect(parseAmount('12,50', 'EUR')).toBe(12.5);
    expect(parseAmount('1,234.56', 'USD')).toBe(1234.56);
    expect(parseAmount('120+35*2', 'THB')).toBe(190);
    expect(parseAmount('(300-20)/4', 'THB')).toBe(70);
    expect(parseAmount('abc', 'VND')).toBeNull();
  });
});

describe('split modes', () => {
  it('equal / shares / percent / exact / adjust', () => {
    const { trip, ids } = setup();
    const [a, b, c] = ids;
    const base = { amount: 100000, payers: [{ memberId: a, amount: 100000 }] };
    const all = ids.map((id) => ({ memberId: id, value: 1 }));
    expect(sumShares(computeShares(exp(trip, { ...base, split: { mode: 'equal', entries: all } })))).toBe(100000);
    const sh = computeShares(
      exp(trip, { ...base, split: { mode: 'shares', entries: [{ memberId: a, value: 2 }, { memberId: b, value: 1 }, { memberId: c, value: 1 }] } }),
    );
    expect(sh.get(a)).toBe(50000);
    const pc = computeShares(
      exp(trip, { ...base, split: { mode: 'percent', entries: [{ memberId: a, value: 50 }, { memberId: b, value: 30 }, { memberId: c, value: 20 }] } }),
    );
    expect([pc.get(a), pc.get(b), pc.get(c)]).toEqual([50000, 30000, 20000]);
    const ex = computeShares(
      exp(trip, { ...base, split: { mode: 'exact', entries: [{ memberId: a, value: 70000 }, { memberId: b, value: 30000 }] } }),
    );
    expect([ex.get(a), ex.get(b)]).toEqual([70000, 30000]);
    const adj = computeShares(
      exp(trip, { ...base, split: { mode: 'adjust', entries: [{ memberId: a, value: 10000 }, { memberId: b, value: 0 }, { memberId: c, value: -10000 }] } }),
    );
    expect([adj.get(a), adj.get(b), adj.get(c)]).toEqual([43334, 33333, 23333]);
  });

  it('itemized with tax/service distributed proportionally', () => {
    const { trip, ids } = setup();
    const [a, b, c] = ids;
    const e = exp(trip, {
      amount: 330000,
      payers: [{ memberId: a, amount: 330000 }],
      split: { mode: 'itemized', entries: [] },
      items: [
        { id: '1', name: 'Bò', amount: 200000, split: { mode: 'equal', entries: [{ memberId: a, value: 1 }] } },
        { id: '2', name: 'Lẩu', amount: 100000, split: { mode: 'equal', entries: [{ memberId: b, value: 1 }, { memberId: c, value: 1 }] } },
      ],
      extras: { tax: 30000, service: 0, tip: 0, discount: 0, mode: 'proportional' },
    });
    const s = computeShares(e);
    expect([s.get(a), s.get(b), s.get(c)]).toEqual([220000, 55000, 55000]);
    expect(validateExpense(trip, e).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('balances & settlement', () => {
  it('multi-payer, income, transfers stay zero-sum', () => {
    const { trip, ids } = setup();
    const [a, b, c] = ids;
    const all = ids.map((id) => ({ memberId: id, value: 1 }));
    exp(trip, { amount: 900000, payers: [{ memberId: a, amount: 600000 }, { memberId: b, amount: 300000 }], split: { mode: 'equal', entries: all } });
    exp(trip, { kind: 'income', amount: 300000, payers: [{ memberId: c, amount: 300000 }], split: { mode: 'equal', entries: all } });
    trip.transfers.push({ id: 't', from: c, to: a, amount: 100000, currency: 'VND', date: '2026-01-01', updatedAt: 1 });
    const n = netOf(trip);
    // a: paid 600 − 300 consumed + 100 refund share − received 100 = 300
    expect(n[a]).toBe(300000 + 100000 - 100000);
    expect(Object.values(n).reduce((x, y) => x + y, 0)).toBe(0);
    const plan = planSettlement(trip);
    const after = { ...n };
    plan.transfers.forEach((t) => {
      after[t.from] += t.amount;
      after[t.to] -= t.amount;
    });
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });

  it('minimizeTransfers needs at most n−1 transfers', () => {
    const nets = new Map([['a', 500], ['b', -200], ['c', -200], ['d', -100]]);
    const t = minimizeTransfers(nets);
    expect(t.length).toBeLessThanOrEqual(3);
    expect(t.reduce((s, x) => s + x.amount, 0)).toBe(500);
  });

  it('pot: contributions and spending', () => {
    const { trip, ids } = setup(['An', 'Bình']);
    const pot = newMember('Quỹ', 'pot');
    trip.members.push(pot);
    const [a, b] = ids;
    trip.transfers.push({ id: '1', from: a, to: pot.id, amount: 500000, currency: 'VND', date: '2026-01-01', updatedAt: 1 });
    trip.transfers.push({ id: '2', from: b, to: pot.id, amount: 500000, currency: 'VND', date: '2026-01-01', updatedAt: 1 });
    exp(trip, { amount: 800000, payers: [{ memberId: pot.id, amount: 800000 }], split: { mode: 'equal', entries: [{ memberId: a, value: 1 }, { memberId: b, value: 1 }] } });
    const n = netOf(trip);
    expect(n[pot.id]).toBe(-200000); // pot still holds 200k → owes it back
    expect(n[a]).toBe(100000);
  });

  it('households and guests settle via their unit/host', () => {
    const { trip, ids } = setup(['An', 'Bình', 'Chi', 'Dũng']);
    const [a, b, c, d] = ids;
    const guest = { ...newMember('Khách', 'guest'), hostId: d };
    trip.members.push(guest);
    trip.households.push({ id: 'h1', name: 'An & Bình', memberIds: [a, b], updatedAt: 1 });
    trip.settings.useHouseholds = true;
    const all = [...ids, guest.id].map((id) => ({ memberId: id, value: 1 }));
    exp(trip, { amount: 500000, payers: [{ memberId: c, amount: 500000 }], split: { mode: 'equal', entries: all } });
    const nets = entityNets(trip);
    expect(nets.get('hh:h1')).toBe(-200000);
    expect(nets.get(d)).toBe(-200000);
    expect(nets.has(guest.id)).toBe(false);
  });

  it('direct (non-simplified) debts only go to payers', () => {
    const { trip, ids } = setup();
    const [a, b, c] = ids;
    trip.settings.simplify = false;
    exp(trip, { amount: 300, payers: [{ memberId: a, amount: 300 }], split: { mode: 'equal', entries: [{ memberId: b, value: 1 }, { memberId: c, value: 1 }, { memberId: a, value: 1 }] } });
    exp(trip, { amount: 300, payers: [{ memberId: b, amount: 300 }], split: { mode: 'equal', entries: [{ memberId: c, value: 1 }] } });
    const plan = planSettlement(trip);
    expect(plan.transfers).toContainEqual(expect.objectContaining({ from: c, to: b, amount: 300 }));
    expect(plan.transfers).toContainEqual(expect.objectContaining({ from: c, to: a, amount: 100 }));
    expect(plan.transfers).toContainEqual(expect.objectContaining({ from: b, to: a, amount: 100 }));
  });
});

describe('currency', () => {
  it('converts with override, exchange record, fee and rounding of settlement', () => {
    const { trip, ids } = setup(['An', 'Bình']);
    const [a, b] = ids;
    trip.currencies.push('THB');
    trip.exchanges.push({ id: 'x', date: '2026-01-01', fromCurrency: 'VND', fromAmount: 7_500_000, toCurrency: 'THB', toAmount: 10_000_00, updatedAt: 1 });
    expect(resolveRate(trip, 'THB', '2026-01-02').rate).toBe(750);
    exp(trip, {
      currency: 'THB',
      amount: 100_00, // 100.00 THB
      feePct: 2,
      payers: [{ memberId: a, amount: 100_00 }],
      split: { mode: 'equal', entries: [{ memberId: a, value: 1 }, { memberId: b, value: 1 }] },
    });
    const n = netOf(trip);
    expect(n[a]).toBe(38250); // 102 THB * 750 / 2
    trip.settings.roundTo = 1000;
    expect(planSettlement(trip).transfers[0].amount).toBe(38000);
    trip.fxOverrides.THB = 800;
    expect(netOf(trip)[a]).toBe(40800);
  });

  it('flags missing rate', () => {
    const { trip, ids } = setup(['An']);
    const e = exp(trip, { currency: 'JPY', amount: 1000, payers: [{ memberId: ids[0], amount: 1000 }] });
    expect(validateExpense(trip, e).some((i) => i.code === 'missing_rate')).toBe(true);
    expect(computeBalances(trip).missing).toHaveLength(1);
  });
});

describe('misc', () => {
  it('presence by date', () => {
    const m = { ...newMember('X'), joinDate: '2026-01-03', leaveDate: '2026-01-05' };
    expect(presentOn(m, '2026-01-02')).toBe(false);
    expect(presentOn(m, '2026-01-04')).toBe(true);
    expect(presentOn(m, '2026-01-06')).toBe(false);
  });

  it('merge keeps newest entity and honours deletions', () => {
    const { trip, ids } = setup(['An']);
    const e = exp(trip, { title: 'old', amount: 1, payers: [{ memberId: ids[0], amount: 1 }], updatedAt: 1 });
    const other: Trip = structuredClone(trip);
    other.expenses[0] = { ...e, title: 'new', updatedAt: 5 };
    other.expenses.push({ ...e, id: 'deleted', updatedAt: 2 });
    const local = { ...trip, tombstones: { deleted: 3 } };
    const m = mergeTrips(local, other);
    expect(m.expenses.map((x) => x.title)).toEqual(['new']);
  });
});
