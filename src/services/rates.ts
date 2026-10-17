/**
 * Free FX sources, no key required:
 * - fawazahmed0/currency-api (jsDelivr + Cloudflare mirror) — has VND and most currencies, dated snapshots.
 * - Frankfurter (ECB) — fallback for major currencies.
 * Returns base-currency units per 1 unit of `currency`.
 */
async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function fromFawaz(currency: string, base: string, tag: string): Promise<number> {
  const c = currency.toLowerCase();
  const b = base.toLowerCase();
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/${c}.min.json`,
    `https://${tag}.currency-api.pages.dev/v1/currencies/${c}.min.json`,
  ];
  let lastErr: unknown;
  for (const u of urls) {
    try {
      const data = (await getJson(u)) as Record<string, Record<string, number>>;
      const v = data[c]?.[b];
      if (v) return v;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('no rate');
}

async function fromFrankfurter(currency: string, base: string, date: string): Promise<number> {
  const data = (await getJson(`https://api.frankfurter.app/${date}?from=${currency}&to=${base}`)) as {
    rates?: Record<string, number>;
  };
  const v = data.rates?.[base];
  if (!v) throw new Error('no rate');
  return v;
}

export async function fetchRate(currency: string, base: string, date: string): Promise<number> {
  if (currency === base) return 1;
  const isPastOrToday = date <= new Date().toISOString().slice(0, 10);
  const attempts: (() => Promise<number>)[] = [];
  if (isPastOrToday) attempts.push(() => fromFawaz(currency, base, date));
  attempts.push(() => fromFawaz(currency, base, 'latest'));
  attempts.push(() => fromFrankfurter(currency, base, isPastOrToday ? date : 'latest'));
  let lastErr: unknown;
  for (const a of attempts) {
    try {
      return await a();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Rate unavailable');
}
