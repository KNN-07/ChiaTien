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

// Kept terse on purpose: these declarations are resent on every agent step and the
// free tier allows only ~16k input tokens/minute for Gemma 4.
const T = (type: string, description?: string) => (description ? { type, description } : { type });
const S = (d?: string) => T('STRING', d);
const N = (d?: string) => T('NUMBER', d);
const B = (d?: string) => T('BOOLEAN', d);
const ARR = (items: object, description?: string) => ({ type: 'ARRAY', items, ...(description ? { description } : {}) });
const OBJ = (properties: Record<string, object>, required: string[] = []) => ({ type: 'OBJECT', properties, required });
const E = (values: string[], description?: string) => ({ type: 'STRING', enum: values, ...(description ? { description } : {}) });

const ID = S();
const DATE = S('YYYY-MM-DD');
const NAMES = ARR(S(), 'member names; group names or "all" ok');

const expenseProps = {
  expense_id: S('set to edit an existing expense (only given fields change)'),
  title: S(),
  amount: N('normal units; optional when itemized'),
  currency: S('ISO 4217'),
  date: DATE,
  category: E(CATEGORIES.map((c) => c.id)),
  kind: E(['expense', 'income'], 'income = refund/money received'),
  paid_by: ARR(OBJ({ name: S(), amount: N('omit = split remainder') }, ['name'])),
  split_mode: E(['equal', 'exact', 'percent', 'shares', 'adjust', 'itemized'], 'default equal'),
  participants: ARR(OBJ({ name: S(), value: N('amount|percent|weight|adjustment per split_mode') }, ['name']), 'omit = everyone present'),
  items: ARR(OBJ({ name: S(), amount: N('line total'), for: NAMES }, ['name', 'amount'])),
  tax: N('added on top only'),
  service: N('added on top only'),
  tip: N(),
  discount: N('positive'),
  fee_pct: N('card/FX fee %'),
  fx_rate: N('base units per 1 unit'),
  note: S(),
  attach_receipt: B("attach the user's photo"),
};

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  { name: 'list_trips', description: 'All trips with ids and members.', parameters: OBJ({}) },
  { name: 'get_trip', description: 'Trip details: members, groups, currencies, expenses and transfers with ids.', parameters: OBJ({ trip_id: ID }, ['trip_id']) },
  {
    name: 'create_trip',
    description: 'Create a trip.',
    parameters: OBJ({ name: S(), base_currency: S('ISO, default VND'), members: NAMES, other_currencies: ARR(S()), start_date: DATE, end_date: DATE }, ['name']),
  },
  {
    name: 'update_trip',
    description: 'Rename a trip or change settings.',
    parameters: OBJ(
      {
        trip_id: ID,
        name: S(),
        start_date: DATE,
        end_date: DATE,
        add_currencies: ARR(S()),
        settle_currency: S(),
        round_to: N('round settlements to N units, 0 = none'),
        simplify: B('minimise payments'),
        use_households: B(),
        guest_to_host: B(),
        locked: B(),
      },
      ['trip_id'],
    ),
  },
  {
    name: 'add_members',
    description: 'Add people. kind: person (default), guest (charged to host) or pot (shared fund).',
    parameters: OBJ({ trip_id: ID, names: NAMES, kind: E(['person', 'guest', 'pot']), host: S(), join_date: DATE, leave_date: DATE }, ['trip_id', 'names']),
  },
  {
    name: 'update_member',
    description: 'Edit a member: name, kind, host, join/leave dates ("" clears), bank for VietQR (bank_bin e.g. 970436 VCB, 970407 TCB, 970422 MB).',
    parameters: OBJ(
      { trip_id: ID, name: S(), new_name: S(), kind: E(['person', 'guest', 'pot']), host: S(), join_date: S(), leave_date: S(), bank_bin: S(), bank_account: S(), bank_holder: S() },
      ['trip_id', 'name'],
    ),
  },
  { name: 'remove_member', description: 'Remove a member with no expenses/payments.', parameters: OBJ({ trip_id: ID, name: S() }, ['trip_id', 'name']) },
  {
    name: 'set_group',
    description: 'Create/replace a sub-group, or a household that settles as one.',
    parameters: OBJ({ trip_id: ID, name: S(), members: NAMES, household: B() }, ['trip_id', 'name', 'members']),
  },
  {
    name: 'save_expense',
    description: 'Add an expense/income, or edit one when expense_id is given. Returns computed shares.',
    parameters: OBJ({ trip_id: ID, ...expenseProps }, ['trip_id']),
  },
  {
    name: 'delete',
    description: 'Delete an expense or transfer by id.',
    parameters: OBJ({ trip_id: ID, what: E(['expense', 'transfer']), id: ID }, ['trip_id', 'what', 'id']),
  },
  {
    name: 'add_transfer',
    description: 'Money given between members: repayments, or contributions to a pot.',
    parameters: OBJ({ trip_id: ID, from: S(), to: S(), amount: N(), currency: S(), date: DATE, note: S() }, ['trip_id', 'from', 'to', 'amount']),
  },
  {
    name: 'set_exchange_rate',
    description: 'Manual rate: base units per 1 unit; 0 clears.',
    parameters: OBJ({ trip_id: ID, currency: S(), rate: N() }, ['trip_id', 'currency', 'rate']),
  },
  {
    name: 'add_currency_exchange',
    description: 'Record a real exchange (e.g. 10,000,000 VND to 13,000 THB); its rate is then used.',
    parameters: OBJ({ trip_id: ID, from_currency: S(), from_amount: N(), to_currency: S(), to_amount: N(), date: DATE }, ['trip_id', 'from_currency', 'from_amount', 'to_currency', 'to_amount']),
  },
  { name: 'get_balances', description: 'Net balances and suggested settle-up payments.', parameters: OBJ({ trip_id: ID }, ['trip_id']) },
];

/* ---------- execution ---------- */

export interface ToolContext {
  /** Snapshot of each trip before this turn's first change (null = created this turn). */
  before: Map<ID, Trip | null>;
  /** Latest photo the user attached in this conversation, if any. */
  image?: Blob;
  /** Photo attached to the current message: auto-attached to expenses created in this turn. */
  turnImage?: Blob;
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
  'save_expense',
  'add_expense',
  'update_expense',
  'delete',
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

    case 'save_expense':
    case 'add_expense':
    case 'update_expense': {
      const isUpdate = name === 'update_expense' || (name === 'save_expense' && !!args.expense_id);
      const parsed = parseArgs(ExpenseArgs, args);
      let attached: string | undefined;
      const r = await mutate(ctx, args.trip_id, async (t) => {
        let base;
        if (isUpdate) {
          base = t.expenses.find((e) => e.id === args.expense_id);
          if (!base) throw new ActionError(`Unknown expense_id "${String(args.expense_id)}". Use get_trip to find it.`);
        }
        const exp = buildExpense(t, parsed, base);
        const photo = args.attach_receipt === true ? ctx.image : args.attach_receipt !== false && !isUpdate ? ctx.turnImage : undefined;
        if (photo) {
          exp.receiptImageId = exp.receiptImageId ?? uid();
          await putImage(t.id, exp.receiptImageId, photo);
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

    case 'delete':
      if (args.what === 'transfer') return executeTool('delete_transfer', { trip_id: args.trip_id, transfer_id: args.id }, ctx);
      return executeTool('delete_expense', { trip_id: args.trip_id, expense_id: args.id }, ctx);

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

