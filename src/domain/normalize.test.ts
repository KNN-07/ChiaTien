import { describe, expect, it } from 'vitest';
import { normalizeCurrency, normalizeDate, reconcileExtras } from './normalize';

describe('receipt normalisation', () => {
  it('maps local currency symbols to ISO codes', () => {
    expect(normalizeCurrency('RM', 'VND')).toBe('MYR');
    expect(normalizeCurrency('฿', 'VND')).toBe('THB');
    expect(normalizeCurrency('đ', 'USD')).toBe('VND');
    expect(normalizeCurrency('myr', 'VND')).toBe('MYR');
    expect(normalizeCurrency('??', 'VND')).toBe('VND');
    expect(normalizeCurrency('', 'JPY')).toBe('JPY');
  });

  it('parses receipt date formats, day first', () => {
    const today = new Date('2026-10-17T00:00:00Z');
    expect(normalizeDate('29/09/2026', today)).toBe('2026-09-29');
    expect(normalizeDate('2026-09-29', today)).toBe('2026-09-29');
    expect(normalizeDate('05-03-26', today)).toBe('2026-03-05');
    expect(normalizeDate('09/29/2026', today)).toBe('2026-09-29');
    expect(normalizeDate('01/01/2030', today)).toBe('');
    expect(normalizeDate('yesterday', today)).toBe('');
  });

  it('drops inclusive tax/service that the model reported as add-ons', () => {
    // Marrybrown: items 26.40, "SST 6%" 1.49 inclusive, paid 26.40
    expect(reconcileExtras(2640, 2640, { tax: 149, service: 0, tip: 0, discount: 0 })).toEqual({ tax: 0, service: 0, tip: 0, discount: 0 });
    // Genuine add-on tax stays
    expect(reconcileExtras(10000, 10800, { tax: 800, service: 0, tip: 0, discount: 0 }).tax).toBe(800);
    // Service on top, VAT inclusive
    expect(reconcileExtras(10000, 10500, { tax: 800, service: 500, tip: 0, discount: 0 })).toMatchObject({ tax: 0, service: 500 });
  });
});
