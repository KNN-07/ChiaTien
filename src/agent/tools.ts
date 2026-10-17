import { CATEGORIES, newTrip, today, uid } from '../domain/trip';
import type { ID, Trip } from '../domain/types';
import { toMinor } from '../domain/money';
import type { FunctionDeclaration } from '../services/ai';
import { db, deleteTrip, putImage, removeFrom, saveTrip, upsert } from '../services/db';
import { ensureRate } from '../services/fxsync';
import {
  ActionError,
  addMembers,
  buildExpense,
  describeBalances,
  describeExpense,
  describeTrip,
  ExpenseArgs,
  findMember,
  parseArgs,
  rateInfo,
  resolveNames,
} from './actions';

/* ---------- declarations (Gemini REST schema: uppercase types) ---------- */

const S = (description: string) => ({ type: 'STRING', description });
const N = (description: string) => ({ type: 'NUMBER', description });
const B = (description: string) => ({ type: 'BOOLEAN', description });
const ARR = (items: object, description: string) => ({ type: 'ARRAY', items, description });
const OBJ = (properties: Record<string, object>, required: string[] = [], description?: string) => ({
  type: 'OBJECT',
  properties,
  required,
  ...(description ? { description } : {}),
});

const TRIP_ID = S('Trip id from list_trips / create_trip.');
const NAMES = ARR({ type: 'STRING' }, 'Member names (group names and "all" are also accepted).');

const expenseProps = {
  title: S('Short description, e.g. "Dinner hotpot".'),
  amount: N('Total in normal units (150k → 150000). Optional for itemized: computed from items + extras.'),
  currency: S('ISO 4217 code. Defaults to the trip currency used most recently.'),
  date: S('YYYY-MM-DD. Defaults to today.'),
  category: { type: 'STRING', enum: CATEGORIES.map((c) => c.id), description: 'Category id.' },
  kind: { type: 'STRING', enum: ['expense', 'income'], description: 'income = refund / money received, split back to people.' },
  paid_by: ARR(OBJ({ name: S('Member name'), amount: N('Amount this person paid; omit to split the rest equally.') }, ['name']), 'Who paid (or received, for income).'),
  split_mode: {
    type: 'STRING',
    enum: ['equal', 'exact', 'percent', 'shares', 'adjust', 'itemized'],
    description: 'equal (default) | exact (value = amount owed) | percent | shares (weights, kid = 0.5) | adjust (equal ± value) | itemized (use items).',
  },
  participants: ARR(
    OBJ({ name: S('Member or group name, or "all".'), value: N('Per split_mode: amount, percent, weight or adjustment.') }, ['name']),
    'Who shares the cost. Omit = everyone present on that date.',
  ),
  items: ARR(OBJ({ name: S('Item name'), amount: N('Line total'), for: NAMES }, ['name', 'amount']), 'Bill items, for itemized splits. Items without "for" are spread like extras.'),
  tax: N('Tax added on top of items (itemized).'),
  service: N('Service charge (itemized).'),
  tip: N('Tip (itemized).'),
  discount: N('Discount as a positive number (itemized).'),
  fee_pct: N('Card / FX fee percent added on top.'),
  fx_rate: N('Custom rate for this expense: base-currency units per 1 unit of its currency.'),
  note: S('Free note.'),
  attach_receipt: B('Attach the photo the user sent in this conversation to the expense.'),
};

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  { name: 'list_trips', description: 'List all trips on this device with ids, members and totals.', parameters: OBJ({}) },
  { name: 'get_trip', description: 'Full details of one trip: members, groups, currencies, expenses (with ids), transfers.', parameters: OBJ({ trip_id: TRIP_ID }, ['trip_id']) },
  {
    name: 'create_trip',
    description: 'Create a new trip.',
    parameters: OBJ(
      {
        name: S('Trip name'),
        base_currency: S('Main ISO currency, default VND.'),
        members: NAMES,
        other_currencies: ARR({ type: 'STRING' }, 'Other currencies that will be used.'),
        start_date: S('YYYY-MM-DD'),
        end_date: S('YYYY-MM-DD'),
      },
      ['name'],
    ),
  },
  {
    name: 'update_trip',
    description: 'Rename a trip or change its settings.',
    parameters: OBJ(
      {
        trip_id: TRIP_ID,
        name: S('New name'),
        start_date: S('YYYY-MM-DD'),
        end_date: S('YYYY-MM-DD'),
        add_currencies: ARR({ type: 'STRING' }, 'Currencies to add.'),
        settle_currency: S('Currency used to settle up.'),
        round_to: N('Round settlement amounts to this many units (e.g. 1000 VND). 0 = none.'),
        simplify: B('Minimise number of payments.'),
        use_households: B('Settle per household/couple.'),
        guest_to_host: B("Charge guests' shares to their host."),
        locked: B('Lock (read-only) or unlock the trip.'),
      },
      ['trip_id'],
    ),
  },
  {
    name: 'add_members',
    description: 'Add people to a trip. kind: person (default), guest (joins briefly, can be charged to a host) or pot (shared fund).',
    parameters: OBJ(
      {
        trip_id: TRIP_ID,
        names: NAMES,
        kind: { type: 'STRING', enum: ['person', 'guest', 'pot'] },
        host: S('For guests: the member who invited them.'),
        join_date: S('YYYY-MM-DD if they join later.'),
        leave_date: S('YYYY-MM-DD if they leave early.'),
      },
      ['trip_id', 'names'],
    ),
  },
  {
    name: 'update_member',
    description: 'Rename a member, set join/leave dates, kind, host or bank account (VietQR).',
    parameters: OBJ(
      {
        trip_id: TRIP_ID,
        name: S('Current name'),
        new_name: S('New name'),
        kind: { type: 'STRING', enum: ['person', 'guest', 'pot'] },
        host: S('Host member name (guests)'),
        join_date: S('YYYY-MM-DD, empty string to clear'),
        leave_date: S('YYYY-MM-DD, empty string to clear'),
        bank_bin: S('Vietnamese bank BIN, e.g. 970436 Vietcombank, 970407 Techcombank, 970422 MB, 970416 ACB, 970418 BIDV, 970415 VietinBank, 970432 VPBank, 970423 TPBank'),
        bank_account: S('Account number'),
        bank_holder: S('Account holder name, uppercase without accents'),
      },
      ['trip_id', 'name'],
    ),
  },
  {
    name: 'remove_member',
    description: 'Remove a member who has no expenses or payments.',
    parameters: OBJ({ trip_id: TRIP_ID, name: S('Member name') }, ['trip_id', 'name']),
  },
  {
    name: 'set_group',
    description: 'Create or replace a sub-group (e.g. "Room 1") or a household/couple that settles as one unit.',
    parameters: OBJ({ trip_id: TRIP_ID, name: S('Group name'), members: NAMES, household: B('true = household/couple') }, ['trip_id', 'name', 'members']),
  },
  {
    name: 'add_expense',
    description: 'Record an expense (or income/refund). Amounts in normal units. Returns the computed shares.',
    parameters: OBJ({ trip_id: TRIP_ID, ...expenseProps }, ['trip_id', 'paid_by']),
  },
  {
    name: 'update_expense',
    description: 'Change an existing expense. Only the given fields change. Get ids from get_trip.',
    parameters: OBJ({ trip_id: TRIP_ID, expense_id: S('Expense id'), ...expenseProps }, ['trip_id', 'expense_id']),
  },
  {
    name: 'delete_expense',
    description: 'Delete an expense by id.',
    parameters: OBJ({ trip_id: TRIP_ID, expense_id: S('Expense id') }, ['trip_id', 'expense_id']),
  },
  {
    name: 'add_transfer',
    description: 'Record money given from one member to another: repayments, or contributions into a shared pot.',
    parameters: OBJ(
      { trip_id: TRIP_ID, from: S('Payer name'), to: S('Receiver name'), amount: N('Amount'), currency: S('ISO code'), date: S('YYYY-MM-DD'), note: S('Note') },
      ['trip_id', 'from', 'to', 'amount'],
    ),
  },
  {
    name: 'delete_transfer',
    description: 'Delete a recorded transfer by id.',
    parameters: OBJ({ trip_id: TRIP_ID, transfer_id: S('Transfer id') }, ['trip_id', 'transfer_id']),
  },
  {
    name: 'set_exchange_rate',
    description: 'Manually set the rate for a currency: base-currency units per 1 unit. rate 0 clears the override.',
    parameters: OBJ({ trip_id: TRIP_ID, currency: S('ISO code'), rate: N('Base units per 1 unit') }, ['trip_id', 'currency', 'rate']),
  },
  {
    name: 'add_currency_exchange',
    description: 'Record a real money exchange (e.g. 10,000,000 VND → 13,000 THB). Its rate is then used for the trip.',
    parameters: OBJ(
      { trip_id: TRIP_ID, from_currency: S('ISO'), from_amount: N('Amount given'), to_currency: S('ISO'), to_amount: N('Amount received'), date: S('YYYY-MM-DD') },
      ['trip_id', 'from_currency', 'from_amount', 'to_currency', 'to_amount'],
    ),
  },
  {
    name: 'get_balances',
    description: 'Who paid what, who used what, net balances and the suggested settle-up payments.',
    parameters: OBJ({ trip_id: TRIP_ID }, ['trip_id']),
  },
];

/* ---------- execution ---------- */

export interface ToolContext {
  /** Snapshot of each trip before this turn's first change (null = created this turn). */
  before: Map<ID, Trip | null>;
  /** Photo the user attached in this conversation, if any. */
  image?: Blob;
  /** Trip the user is looking at (for change tracking in the UI). */
  touched: Set<ID>;
}

const MUTATING = new Set([
  'create_trip',
  'update_trip',
  'add_members',
  'update_member',
  'remove_member',
  'set_group',
  'add_expense',
  'update_expense',
  'delete_expense',
  'add_transfer',
  'delete_transfer',
  'set_exchange_rate',
  'add_currency_exchange',
]);
export const isMutating = (name: string) => MUTATING.has(name);

async function loadTrip(id: unknown): Promise<Trip> {
  const t = typeof id === 'string' ? await db.trips.get(id) : undefined;
  if (!t) throw new ActionError(`Unknown trip_id "${String(id)}". Call list_trips to get ids.`);
  return t;
}

/** Load → mutate a copy → save, remembering the original for undo. */
async function mutate<R>(ctx: ToolContext, tripId: unknown, fn: (t: Trip) => R | Promise<R>, allowLocked = false): Promise<R> {
  const orig = await loadTrip(tripId);
  if (orig.locked && !allowLocked) throw new ActionError('Trip is locked. Ask the user before unlocking it (update_trip locked=false).');
  if (!ctx.before.has(orig.id)) ctx.before.set(orig.id, structuredClone(orig));
  const draft = structuredClone(orig);
  const r = await fn(draft);
  draft.updatedAt = Date.now();
  await saveTrip(draft);
  ctx.touched.add(draft.id);
  return r;
}

const optDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const isoCur = (v: unknown) => (typeof v === 'string' && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : undefined);
const strList = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  switch (name) {
    case 'list_trips': {
      const trips = await db.trips.orderBy('updatedAt').reverse().toArray();
      return {
        trips: trips.map((t) => ({
          trip_id: t.id,
          name: t.name,
          base_currency: t.baseCurrency,
          members: t.members.map((m) => m.name),
          expense_count: t.expenses.length,
          locked: t.locked,
        })),
      };
    }
    case 'get_trip':
      return describeTrip(await loadTrip(args.trip_id));

    case 'get_balances':
      return describeBalances(await loadTrip(args.trip_id));

    case 'create_trip': {
      const base = isoCur(args.base_currency) ?? 'VND';
      const t = newTrip(String(args.name ?? '').trim() || 'Trip', base);
      t.startDate = optDate(args.start_date);
      t.endDate = optDate(args.end_date);
      strList(args.other_currencies).forEach((c) => {
        const cc = isoCur(c);
        if (cc && !t.currencies.includes(cc)) t.currencies.push(cc);
      });
      addMembers(t, strList(args.members));
      await saveTrip(t);
      ctx.before.set(t.id, null);
      ctx.touched.add(t.id);
      return { trip_id: t.id, name: t.name, members: t.members.map((m) => m.name), currencies: t.currencies };
    }

    case 'update_trip': {
      const unlock = args.locked === false;
      const run = async (t: Trip) => {
        if (typeof args.name === 'string' && args.name.trim()) t.name = args.name.trim();
        if (args.start_date !== undefined) t.startDate = optDate(args.start_date);
        if (args.end_date !== undefined) t.endDate = optDate(args.end_date);
        strList(args.add_currencies).forEach((c) => {
          const cc = isoCur(c);
          if (cc && !t.currencies.includes(cc)) t.currencies.push(cc);
        });
        const sc = isoCur(args.settle_currency);
        if (sc) {
          t.settings.settleCurrency = sc;
          if (!t.currencies.includes(sc)) t.currencies.push(sc);
        }
        if (typeof args.round_to === 'number') t.settings.roundTo = Math.max(0, Math.round(toMinor(args.round_to, t.settings.settleCurrency)));
        if (typeof args.simplify === 'boolean') t.settings.simplify = args.simplify;
        if (typeof args.use_households === 'boolean') t.settings.useHouseholds = args.use_households;
        if (typeof args.guest_to_host === 'boolean') t.settings.guestToHost = args.guest_to_host;
        if (typeof args.locked === 'boolean') t.locked = args.locked;
        return { ok: true, name: t.name, currencies: t.currencies, settings: t.settings, locked: t.locked };
      };
      const r = await mutate(ctx, args.trip_id, run, unlock);
      const t = await loadTrip(args.trip_id);
      for (const c of t.currencies) await ensureRate(t, today(), c);
      return r;
    }

    case 'add_members':
      return mutate(ctx, args.trip_id, (t) => {
        const kind = (['person', 'guest', 'pot'] as const).find((k) => k === args.kind) ?? 'person';
        const added = addMembers(t, strList(args.names), kind, typeof args.host === 'string' ? args.host : undefined, optDate(args.join_date), optDate(args.leave_date));
        return { added, members: t.members.map((m) => m.name) };
      });

    case 'update_member':
      return mutate(ctx, args.trip_id, (t) => {
        const m = findMember(t, String(args.name ?? ''));
        if (typeof args.new_name === 'string' && args.new_name.trim()) m.name = args.new_name.trim();
        if (args.kind === 'person' || args.kind === 'guest' || args.kind === 'pot') m.kind = args.kind;
        if (typeof args.host === 'string') m.hostId = args.host ? findMember(t, args.host).id : undefined;
        if (args.join_date !== undefined) m.joinDate = optDate(args.join_date);
        if (args.leave_date !== undefined) m.leaveDate = optDate(args.leave_date);
        if (args.bank_account || args.bank_bin) {
          m.bank = {
            bin: String(args.bank_bin ?? m.bank?.bin ?? ''),
            account: String(args.bank_account ?? m.bank?.account ?? '').replace(/\s/g, ''),
            holder: args.bank_holder ? String(args.bank_holder).toUpperCase() : m.bank?.holder,
          };
        }
        m.updatedAt = Date.now();
        return { ok: true, member: { name: m.name, kind: m.kind, join_date: m.joinDate, leave_date: m.leaveDate, bank: m.bank } };
      });

    case 'remove_member':
      return mutate(ctx, args.trip_id, (t) => {
        const m = findMember(t, String(args.name ?? ''));
        const used =
          t.expenses.some((e) => e.payers.some((p) => p.memberId === m.id) || e.split.entries.some((s) => s.memberId === m.id) || (e.items ?? []).some((i) => i.split.entries.some((s) => s.memberId === m.id))) ||
          t.transfers.some((x) => x.from === m.id || x.to === m.id);
        if (used) throw new ActionError(`${m.name} appears in expenses or transfers and cannot be removed.`);
        removeFrom(t, t.members, m.id);
        t.groups.forEach((g) => (g.memberIds = g.memberIds.filter((x) => x !== m.id)));
        t.households.forEach((g) => (g.memberIds = g.memberIds.filter((x) => x !== m.id)));
        return { ok: true, removed: m.name };
      });

    case 'set_group':
      return mutate(ctx, args.trip_id, (t) => {
        const ids = resolveNames(t, strList(args.members));
        const gname = String(args.name ?? '').trim() || 'Group';
        const list = args.household ? t.households : t.groups;
        const existing = list.find((g) => g.name.toLowerCase() === gname.toLowerCase());
        if (args.household) t.households.forEach((h) => h !== existing && (h.memberIds = h.memberIds.filter((x) => !ids.includes(x))));
        upsert(list, { id: existing?.id ?? uid(), name: gname, memberIds: ids, updatedAt: 0 });
        return { ok: true, name: gname, members: ids.map((id) => t.members.find((m) => m.id === id)?.name) };
      });

    case 'add_expense':
    case 'update_expense': {
      const parsed = parseArgs(ExpenseArgs, args);
      let attached: string | undefined;
      const r = await mutate(ctx, args.trip_id, async (t) => {
        let base;
        if (name === 'update_expense') {
          base = t.expenses.find((e) => e.id === args.expense_id);
          if (!base) throw new ActionError(`Unknown expense_id "${String(args.expense_id)}". Use get_trip to find it.`);
        }
        const exp = buildExpense(t, parsed, base);
        if (args.attach_receipt && ctx.image) {
          exp.receiptImageId = exp.receiptImageId ?? uid();
          await putImage(t.id, exp.receiptImageId, ctx.image);
          attached = exp.receiptImageId;
        }
        upsert(t.expenses, exp);
        if (!t.currencies.includes(exp.currency)) t.currencies.push(exp.currency);
        return { trip: t, exp };
      });
      await ensureRate(r.trip, r.exp.date, r.exp.currency);
      const fresh = await loadTrip(r.trip.id);
      return {
        ok: true,
        expense: describeExpense(fresh, r.exp),
        ...(r.exp.currency !== fresh.baseCurrency ? { rate: rateInfo(fresh, r.exp.currency, r.exp.date) } : {}),
        ...(attached ? { receipt_attached: true } : {}),
      };
    }

    case 'delete_expense':
      return mutate(ctx, args.trip_id, (t) => {
        const e = t.expenses.find((x) => x.id === args.expense_id);
        if (!e) throw new ActionError(`Unknown expense_id "${String(args.expense_id)}".`);
        removeFrom(t, t.expenses, e.id);
        return { ok: true, deleted: e.title || e.id };
      });

    case 'add_transfer':
      return mutate(ctx, args.trip_id, (t) => {
        const from = findMember(t, String(args.from ?? ''));
        const to = findMember(t, String(args.to ?? ''));
        if (from.id === to.id) throw new ActionError('from and to must be different people.');
        const cur = isoCur(args.currency) ?? t.settings.settleCurrency ?? t.baseCurrency;
        const amount = toMinor(Math.abs(Number(args.amount)), cur);
        if (!amount) throw new ActionError('amount must be > 0');
        const x = { id: uid(), from: from.id, to: to.id, amount, currency: cur, date: optDate(args.date) ?? today(), note: typeof args.note === 'string' ? args.note : undefined, updatedAt: Date.now() };
        t.transfers.push(x);
        if (!t.currencies.includes(cur)) t.currencies.push(cur);
        return { ok: true, transfer_id: x.id, from: from.name, to: to.name, amount: Number(args.amount), currency: cur };
      });

    case 'delete_transfer':
      return mutate(ctx, args.trip_id, (t) => {
        if (!t.transfers.some((x) => x.id === args.transfer_id)) throw new ActionError(`Unknown transfer_id "${String(args.transfer_id)}".`);
        removeFrom(t, t.transfers, String(args.transfer_id));
        return { ok: true };
      });

    case 'set_exchange_rate':
      return mutate(ctx, args.trip_id, (t) => {
        const c = isoCur(args.currency);
        if (!c) throw new ActionError('currency must be an ISO code');
        const rate = Number(args.rate);
        if (rate > 0) t.fxOverrides[c] = rate;
        else delete t.fxOverrides[c];
        if (!t.currencies.includes(c)) t.currencies.push(c);
        return { ok: true, rate: rateInfo(t, c, today()) };
      });

    case 'add_currency_exchange':
      return mutate(ctx, args.trip_id, (t) => {
        const fc = isoCur(args.from_currency);
        const tc = isoCur(args.to_currency);
        if (!fc || !tc || fc === tc) throw new ActionError('from_currency and to_currency must be two different ISO codes');
        t.exchanges.push({
          id: uid(),
          date: optDate(args.date) ?? today(),
          fromCurrency: fc,
          fromAmount: toMinor(Math.abs(Number(args.from_amount)), fc),
          toCurrency: tc,
          toAmount: toMinor(Math.abs(Number(args.to_amount)), tc),
          updatedAt: Date.now(),
        });
        [fc, tc].forEach((c) => !t.currencies.includes(c) && t.currencies.push(c));
        const other = fc === t.baseCurrency ? tc : fc;
        return { ok: true, rate: rateInfo(t, other, today()) };
      });
  }
  throw new ActionError(`Unknown tool ${name}`);
}

/** Restore every trip changed during a turn. */
export async function undoTurn(before: Map<ID, Trip | null>) {
  for (const [id, snap] of before) {
    if (snap === null) await deleteTrip(id);
    else await saveTrip({ ...snap, updatedAt: Date.now() });
  }
}

