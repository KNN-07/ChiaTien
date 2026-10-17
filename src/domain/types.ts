export type ID = string;

export type MemberKind = 'person' | 'guest' | 'pot';

export interface BankInfo {
  bin: string; // NAPAS BIN (e.g. 970436) or VietQR bank code
  account: string;
  holder?: string;
}

export interface Member {
  id: ID;
  name: string;
  kind: MemberKind;
  /** For guests: their shares are charged to this member when trip.settings.guestToHost is on. */
  hostId?: ID;
  joinDate?: string; // YYYY-MM-DD
  leaveDate?: string;
  bank?: BankInfo;
  updatedAt: number;
}

export interface Group {
  id: ID;
  name: string;
  memberIds: ID[];
  updatedAt: number;
}

/** A household settles as one unit (couple, family). */
export interface Household {
  id: ID;
  name: string;
  memberIds: ID[];
  updatedAt: number;
}

export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares' | 'adjust' | 'itemized';

/**
 * value meaning by mode:
 * - equal: ignored (presence = included)
 * - exact: amount in minor units
 * - percent: percentage (0-100)
 * - shares: weight
 * - adjust: +/- amount in minor units on top of an equal split
 */
export interface SplitEntry {
  memberId: ID;
  value: number;
}

export interface SplitSpec {
  mode: SplitMode;
  entries: SplitEntry[];
}

export interface ItemSplit {
  mode: 'equal' | 'shares';
  entries: SplitEntry[];
}

export interface Item {
  id: ID;
  name: string;
  qty?: number;
  /** Line total in minor units. */
  amount: number;
  split: ItemSplit;
}

/** Bill extras in minor units. Informational: the engine distributes (amount − items total). */
export interface Extras {
  tax: number;
  service: number;
  tip: number;
  discount: number;
  mode: 'proportional' | 'equal';
}

export interface Payer {
  memberId: ID;
  amount: number; // minor units
}

export interface Expense {
  id: ID;
  kind: 'expense' | 'income';
  title: string;
  category: string;
  date: string; // YYYY-MM-DD
  currency: string;
  /** Total in minor units of `currency` (before card fee). */
  amount: number;
  /** Who paid (expense) or who received the money (income). */
  payers: Payer[];
  split: SplitSpec;
  items?: Item[];
  extras?: Extras;
  /** Override: base-currency units per 1 unit of `currency`. */
  fxRate?: number;
  /** Card / conversion fee in percent, added on top of amount. */
  feePct?: number;
  receiptImageId?: ID;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Transfer {
  id: ID;
  from: ID;
  to: ID;
  amount: number; // minor units
  currency: string;
  date: string;
  fxRate?: number;
  note?: string;
  updatedAt: number;
}

/** A real currency exchange (e.g. 10,000,000 VND -> 13,000 THB at a money changer). */
export interface ExchangeRecord {
  id: ID;
  date: string;
  fromCurrency: string;
  fromAmount: number; // minor units
  toCurrency: string;
  toAmount: number; // minor units
  note?: string;
  updatedAt: number;
}

export interface TripSettings {
  settleCurrency: string;
  /** Round settlement amounts to a multiple of this many minor units (e.g. 1000 for VND). 0/1 = none. */
  roundTo: number;
  simplify: boolean;
  useHouseholds: boolean;
  guestToHost: boolean;
}

export interface Trip {
  id: ID;
  name: string;
  emoji?: string;
  startDate?: string;
  endDate?: string;
  baseCurrency: string;
  currencies: string[];
  members: Member[];
  groups: Group[];
  households: Household[];
  expenses: Expense[];
  transfers: Transfer[];
  exchanges: ExchangeRecord[];
  /** Manual rate overrides: base units per 1 unit of currency. */
  fxOverrides: Record<string, number>;
  /** Fetched rates keyed `${YYYY-MM-DD}|${CUR}` -> base units per 1 unit. */
  autoRates: Record<string, number>;
  settings: TripSettings;
  locked: boolean;
  /** Deleted entity ids -> deletion time, used when merging shared copies. */
  tombstones: Record<ID, number>;
  createdAt: number;
  updatedAt: number;
}
