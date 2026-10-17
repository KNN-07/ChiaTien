import { describe, expect, it } from 'vitest';
import { computeShares } from '../domain/split';
import { newMember, newTrip } from '../domain/trip';
import { ActionError, buildExpense, describeTrip, ExpenseArgs, findMember, parseArgs, resolveNames } from './actions';

function trip() {
  const t = newTrip('Đà Lạt', 'VND');
  ['Nguyễn An', 'Bình', 'Chi', 'Dũng'].forEach((n) => t.members.push(newMember(n)));
  t.groups.push({ id: 'g', name: 'Phòng 1', memberIds: [t.members[0].id, t.members[1].id], updatedAt: 1 });
  return t;
}
const build = (t: ReturnType<typeof trip>, args: unknown, base?: Parameters<typeof buildExpense>[2]) => buildExpense(t, parseArgs(ExpenseArgs, args), base);
const sharesByName = (t: ReturnType<typeof trip>, e: ReturnType<typeof build>) =>
  Object.fromEntries([...computeShares(e)].map(([id, v]) => [t.members.find((m) => m.id === id)!.name, v]));

describe('agent actions', () => {
  it('matches names without diacritics / by first word, and rejects unknown', () => {
    const t = trip();
    expect(findMember(t, 'an').name).toBe('Nguyễn An');
    expect(findMember(t, 'DUNG').name).toBe('Dũng');
    expect(() => findMember(t, 'Eve')).toThrow(ActionError);
    expect(resolveNames(t, ['phong 1']).length).toBe(2);
    expect(resolveNames(t, ['mọi người']).length).toBe(4);
  });

  it('equal split by default, everyone except one', () => {
    const t = trip();
    const e = build(t, { title: 'Lẩu', amount: 1200000, paid_by: [{ name: 'An' }], participants: [{ name: 'An' }, { name: 'Bình' }, { name: 'Dũng' }] });
    expect(e.payers[0].amount).toBe(1200000);
    expect(sharesByName(t, e)).toEqual({ 'Nguyễn An': 400000, Bình: 400000, Dũng: 400000 });
    const all = build(t, { amount: '100000', paid_by: [{ name: 'Chi' }] });
    expect(all.split.entries.length).toBe(4);
  });

  it('multiple payers with partial amounts', () => {
    const t = trip();
    const e = build(t, { amount: 1000000, paid_by: [{ name: 'An', amount: 600000 }, { name: 'Bình' }, { name: 'Chi' }] });
    expect(e.payers.map((p) => p.amount)).toEqual([600000, 200000, 200000]);
  });

  it('shares, percent with remainder, foreign currency minor units', () => {
    const t = trip();
    const s = build(t, { amount: 3500, currency: 'thb', paid_by: [{ name: 'Bình' }], split_mode: 'shares', participants: [{ name: 'An', value: 2 }, { name: 'Bình', value: 2 }, { name: 'Dũng', value: 1 }] });
    expect(s.currency).toBe('THB');
    expect(s.amount).toBe(350000);
    expect(sharesByName(t, s)).toEqual({ 'Nguyễn An': 140000, Bình: 140000, Dũng: 70000 });
    const p = build(t, { amount: 100, currency: 'USD', paid_by: [{ name: 'An' }], split_mode: 'percent', participants: [{ name: 'An', value: 50 }, { name: 'Bình' }, { name: 'Chi' }] });
    expect(p.split.entries.map((x) => x.value)).toEqual([50, 25, 25]);
  });

  it('itemized from a receipt with tax; amount computed', () => {
    const t = trip();
    const e = build(t, {
      title: 'Quán nướng',
      paid_by: [{ name: 'Chi' }],
      items: [
        { name: 'Bò', amount: 200000, for: ['An'] },
        { name: 'Bia', amount: 100000, for: ['Bình', 'Chi'] },
      ],
      tax: 30000,
    });
    expect(e.split.mode).toBe('itemized');
    expect(e.amount).toBe(330000);
    expect(sharesByName(t, e)).toEqual({ 'Nguyễn An': 220000, Bình: 55000, Chi: 55000 });
  });

  it('items from qty × unit_price, numbered in descriptions', () => {
    const t = trip();
    const e = build(t, {
      currency: 'MYR',
      paid_by: [{ name: 'Chi' }],
      items: [
        { name: 'French Fries [Large]', qty: 2, unit_price: 7.5, for: ['Chi'] },
        { name: 'Fragrant Rice', qty: 3, amount: 11.4, for: ['Dũng'] },
      ],
    });
    expect(e.amount).toBe(2640);
    expect(e.items!.map((i) => [i.qty, i.unitPrice, i.amount])).toEqual([
      [2, 750, 1500],
      [3, 380, 1140],
    ]);
    t.expenses.push(build(t, { title: 'Earlier', amount: 1000, date: '2026-01-01', paid_by: [{ name: 'An' }] }), e);
    const d = describeTrip(t);
    expect(d.expenses.map((x) => [x.title, x.no])).toEqual([
      ['', 2],
      ['Earlier', 1],
    ]);
    expect(d.expenses[0].items?.[1]).toMatchObject({ no: 2, qty: 3, unit_price: 3.8, amount: 11.4 });
    expect(() => build(t, { paid_by: [{ name: 'An' }], items: [{ name: 'x', qty: 2 }] })).toThrow(/amount or unit_price/);
  });

  it('update keeps untouched fields and converts on currency change', () => {
    const t = trip();
    const e = build(t, { title: 'Taxi', amount: 200000, paid_by: [{ name: 'An' }] });
    const u = build(t, { amount: 250000 }, e);
    expect(u.id).toBe(e.id);
    expect(u.title).toBe('Taxi');
    expect(u.payers[0].amount).toBe(250000);
    const c = build(t, { currency: 'USD' }, { ...e, amount: 20, payers: [{ ...e.payers[0], amount: 20 }] });
    expect(c.amount).toBe(2000);
  });

  it('rejects missing payer and bad percent', () => {
    const t = trip();
    expect(() => build(t, { amount: 1000 })).toThrow(/paid_by/);
    expect(() => build(t, { amount: 1000, paid_by: [{ name: 'An' }], split_mode: 'percent', participants: [{ name: 'An', value: 30 }, { name: 'Bình', value: 30 }] })).toThrow(/percent/);
  });
});
