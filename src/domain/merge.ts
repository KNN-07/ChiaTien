import type { Trip } from './types';

type Entity = { id: string; updatedAt: number };

function mergeList<T extends Entity>(a: T[], b: T[], tomb: Record<string, number>): T[] {
  const map = new Map<string, T>();
  for (const x of [...a, ...b]) {
    const cur = map.get(x.id);
    if (!cur || (x.updatedAt ?? 0) > (cur.updatedAt ?? 0)) map.set(x.id, x);
  }
  return [...map.values()].filter((x) => !(tomb[x.id] && tomb[x.id] >= (x.updatedAt ?? 0)));
}

/** Merge two copies of the same trip: per-entity last-write-wins, deletions via tombstones. */
export function mergeTrips(local: Trip, incoming: Trip): Trip {
  const tombstones = { ...local.tombstones };
  for (const [k, v] of Object.entries(incoming.tombstones ?? {})) tombstones[k] = Math.max(tombstones[k] ?? 0, v);
  const newer = incoming.updatedAt > local.updatedAt ? incoming : local;
  return {
    ...newer,
    members: mergeList(local.members, incoming.members, tombstones),
    groups: mergeList(local.groups, incoming.groups, tombstones),
    households: mergeList(local.households, incoming.households, tombstones),
    expenses: mergeList(local.expenses, incoming.expenses, tombstones),
    transfers: mergeList(local.transfers, incoming.transfers, tombstones),
    exchanges: mergeList(local.exchanges, incoming.exchanges, tombstones),
    currencies: [...new Set([...local.currencies, ...incoming.currencies])],
    autoRates: { ...incoming.autoRates, ...local.autoRates },
    fxOverrides: { ...(newer === local ? incoming : local).fxOverrides, ...newer.fxOverrides },
    tombstones,
    updatedAt: Math.max(local.updatedAt, incoming.updatedAt),
  };
}

/** Fill defaults on data from older versions / other sources. */
export function normalizeTrip(t: Trip): Trip {
  return {
    ...t,
    currencies: t.currencies?.length ? t.currencies : [t.baseCurrency],
    members: t.members ?? [],
    groups: t.groups ?? [],
    households: t.households ?? [],
    expenses: t.expenses ?? [],
    transfers: t.transfers ?? [],
    exchanges: t.exchanges ?? [],
    fxOverrides: t.fxOverrides ?? {},
    autoRates: t.autoRates ?? {},
    tombstones: t.tombstones ?? {},
    settings: {
      ...{ settleCurrency: t.baseCurrency, roundTo: 0, simplify: true, useHouseholds: false, guestToHost: true },
      ...t.settings,
    },
  };
}

/** Shared copies carry no photos: keep receipt images this device already has. */
export function keepLocalImages(local: Trip, next: Trip): Trip {
  const imgs = new Map(local.expenses.filter((e) => e.receiptImageId).map((e) => [e.id, e.receiptImageId]));
  return { ...next, expenses: next.expenses.map((e) => (e.receiptImageId || !imgs.has(e.id) ? e : { ...e, receiptImageId: imgs.get(e.id) })) };
}
