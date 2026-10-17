/** Local currency symbols / abbreviations printed on receipts → ISO 4217. */
const CURRENCY_ALIASES: Record<string, string> = {
  RM: 'MYR',
  'M$': 'MYR',
  '฿': 'THB',
  BAHT: 'THB',
  B: 'THB',
  Đ: 'VND',
  '₫': 'VND',
  VNĐ: 'VND',
  VNDONG: 'VND',
  DONG: 'VND',
  '¥': 'JPY',
  YEN: 'JPY',
  '円': 'JPY',
  '₩': 'KRW',
  WON: 'KRW',
  '원': 'KRW',
  'S$': 'SGD',
  SG$: 'SGD',
  RP: 'IDR',
  '₱': 'PHP',
  '€': 'EUR',
  '£': 'GBP',
  'NT$': 'TWD',
  'HK$': 'HKD',
  '₭': 'LAK',
  KIP: 'LAK',
  '៛': 'KHR',
  RIEL: 'KHR',
  '元': 'CNY',
  RMB: 'CNY',
  '₹': 'INR',
  RS: 'INR',
  'A$': 'AUD',
  'C$': 'CAD',
  'US$': 'USD',
  $: 'USD',
};

export function normalizeCurrency(raw: string | undefined | null, fallback: string): string {
  const s = (raw ?? '').trim();
  if (!s) return fallback;
  const up = s.toUpperCase().replace(/\s+/g, '');
  if (CURRENCY_ALIASES[up] ?? CURRENCY_ALIASES[s]) return CURRENCY_ALIASES[up] ?? CURRENCY_ALIASES[s];
  if (/^[A-Z]{3}$/.test(up)) return up;
  return fallback;
}

/**
 * Receipt dates come as 29/09/2026, 29-09-26, 2026/09/29, 2026-09-29…
 * Day-first is assumed for ambiguous dd/mm (as on most receipts outside the US).
 * Returns YYYY-MM-DD or '' if unusable / in the future.
 */
export function normalizeDate(raw: string | undefined | null, today = new Date()): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  let y: number, m: number, d: number;
  let mt = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (mt) [y, m, d] = [+mt[1], +mt[2], +mt[3]];
  else if ((mt = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    [d, m, y] = [+mt[1], +mt[2], +mt[3]];
    if (y < 100) y += 2000;
    if (m > 12 && d <= 12) [d, m] = [m, d];
  } else return '';
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const tomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
  return iso <= tomorrow ? iso : '';
}

/**
 * Models often report an *inclusive* tax/service charge (e.g. "SST 6% incl.") as if it were
 * added on top. If items + extras overshoot the paid total but items alone (± tip/discount)
 * match it, the tax/service were already inside the prices: drop them.
 */
export function reconcileExtras(
  itemsTotal: number,
  total: number,
  x: { tax: number; service: number; tip: number; discount: number },
  tolerance = 0,
): { tax: number; service: number; tip: number; discount: number } {
  const full = itemsTotal + x.tax + x.service + x.tip - x.discount;
  if (!total || Math.abs(full - total) <= tolerance) return x;
  const withoutTaxes = itemsTotal + x.tip - x.discount;
  if (Math.abs(withoutTaxes - total) <= tolerance) return { ...x, tax: 0, service: 0 };
  if (Math.abs(itemsTotal + x.service + x.tip - x.discount - total) <= tolerance) return { ...x, tax: 0 };
  if (Math.abs(itemsTotal + x.tax + x.tip - x.discount - total) <= tolerance) return { ...x, service: 0 };
  return x;
}
