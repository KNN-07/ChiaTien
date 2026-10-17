const digitsCache = new Map<string, number>();

/** Currencies that Intl may report with decimals but are always used as whole units. */
const ZERO_DECIMAL = ['VND', 'IDR', 'KRW', 'JPY', 'CLP', 'ISK', 'UGX', 'PYG', 'LAK', 'MMK', 'KHR', 'TWD', 'HUF'];

/** Number of minor-unit digits for a currency (VND 0, USD 2, KWD 3). */
export function currencyDigits(currency: string): number {
  const c = currency.toUpperCase();
  const cached = digitsCache.get(c);
  if (cached !== undefined) return cached;
  let d = 2;
  try {
    d = new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    d = 2;
  }
  if (ZERO_DECIMAL.includes(c)) d = 0;
  digitsCache.set(c, d);
  return d;
}

export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** currencyDigits(currency));
}

export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** currencyDigits(currency);
}

/**
 * Split an integer total across weights so the parts sum exactly to total
 * (largest-remainder method). Works for negative totals too.
 */
export function allocate(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (sumW <= 0) return weights.map(() => 0);
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(Math.round(total));
  const raw = weights.map((w) => (abs * Math.max(0, w)) / sumW);
  const parts = raw.map((r) => Math.floor(r + 1e-9));
  let rest = abs - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - parts[i], w: weights[i] }))
    .filter((o) => o.w > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % order.length) {
    parts[order[k].i] += 1;
    rest -= 1;
  }
  return parts.map((p) => (p === 0 ? 0 : p * sign));
}

/** Convert minor units between currencies with a rate (target major units per 1 source major unit). */
export function convertMinor(minor: number, from: string, to: string, rate: number): number {
  if (from === to) return minor;
  return Math.round(toMajor(minor, from) * rate * 10 ** currencyDigits(to));
}

export function formatMoney(minor: number, currency: string, locale = 'vi-VN'): string {
  const major = toMajor(minor, currency);
  const d = currencyDigits(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(major);
  } catch {
    return `${major.toFixed(d)} ${currency}`;
  }
}

/** Plain number (no symbol) suitable for putting back into an input. */
export function formatNumber(minor: number, currency: string, locale = 'vi-VN'): string {
  const d = currencyDigits(currency);
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: d }).format(
    toMajor(minor, currency),
  );
}

const SUFFIX = /(k|tr|m|b)$/i;

/** Parse one number token where "," or "." may be a thousands or decimal separator. */
function parseNumberToken(tok: string, digits: number): number {
  let s = tok;
  let mult = 1;
  const suf = s.match(SUFFIX);
  if (suf) {
    const u = suf[1].toLowerCase();
    mult = u === 'k' ? 1e3 : u === 'b' ? 1e9 : 1e6;
    s = s.slice(0, -suf[1].length);
  }
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const parts = s.split(sep);
    const last = parts[parts.length - 1];
    // "1.5k" / "12,50" / "3.25" are decimals; "1.200" / "1.200.000" are thousands groups.
    const isDecimal = parts.length === 2 && (mult > 1 || last.length !== 3 || (digits >= 3 && last.length === 3));
    s = isDecimal ? parts.join('.') : parts.join('');
  }
  const v = parseFloat(s);
  return Number.isFinite(v) ? v * mult : NaN;
}

/**
 * Parse user input into major units. Supports "1.200.000", "12,50", "150k", "1.5tr"
 * and simple arithmetic: "120+35*2", "(300-20)/3".
 */
export function parseAmount(input: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const src = input
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[×x]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[^\d.,+\-*/()ktrmb]/g, '');
  if (!src) return null;
  const tokens = src.match(/(\d[\d.,]*(?:k|tr|m|b)?|[+\-*/()])/g);
  if (!tokens || tokens.join('').length !== src.length) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') v = next() === '+' ? v + term() : v - term();
    return v;
  };
  const term = (): number => {
    let v = factor();
    while (peek() === '*' || peek() === '/') v = next() === '*' ? v * factor() : v / factor();
    return v;
  };
  const factor = (): number => {
    const t = next();
    if (t === undefined) return NaN;
    if (t === '-') return -factor();
    if (t === '+') return factor();
    if (t === '(') {
      const v = expr();
      if (next() !== ')') return NaN;
      return v;
    }
    return parseNumberToken(t, digits);
  };
  const v = expr();
  if (pos !== tokens.length || !Number.isFinite(v)) return null;
  return v;
}
