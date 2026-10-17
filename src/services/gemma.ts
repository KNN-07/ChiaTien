import { z } from 'zod';
import { AiError, generate, isAuthError, textOf, type Part } from './ai';
import { blobToBase64 } from './image';

export { listModels as listGemmaModels } from './ai';

const num = z.preprocess((v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return v;
}, z.number());

const str = z
  .string()
  .nullish()
  .transform((v) => v ?? '');

export const ReceiptSchema = z.object({
  merchant: str,
  date: str,
  /** Raw value from the model; normalise with normalizeCurrency(). */
  currency: str,
  category: str,
  items: z.array(z.object({ name: str, qty: num.optional(), unitPrice: num.optional(), total: num })).default([]),
  subtotal: num.optional(),
  tax: num.optional(),
  serviceCharge: num.optional(),
  tip: num.optional(),
  discount: num.optional(),
  total: num,
});

export type Receipt = z.infer<typeof ReceiptSchema>;

const receiptProps = (categories: string[]) => ({
  merchant: { type: 'string', description: 'Shop / restaurant name' },
  date: { type: 'string', description: 'Purchase date as YYYY-MM-DD, or empty' },
  currency: { type: 'string', description: 'ISO 4217 code, e.g. MYR (not RM), THB (not ฿), VND (not đ)' },
  category: { type: 'string', enum: categories },
  items: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        qty: { type: 'number' },
        unitPrice: { type: 'number' },
        total: { type: 'number', description: 'Line total after item discounts' },
      },
      required: ['name', 'total'],
    },
  },
  subtotal: { type: 'number' },
  tax: { type: 'number', description: 'Tax added on top of the items; 0 if prices already include it' },
  serviceCharge: { type: 'number', description: 'Service charge added on top; 0 if included' },
  tip: { type: 'number' },
  discount: { type: 'number', description: 'Positive number' },
  total: { type: 'number', description: 'Final amount paid' },
});

/** JSON Schema for Gemini structured output: one or more receipts per photo. */
const scanJsonSchema = (categories: string[]) => ({
  type: 'object',
  properties: {
    receipts: {
      type: 'array',
      items: { type: 'object', properties: receiptProps(categories), required: ['merchant', 'currency', 'items', 'total'] },
    },
  },
  required: ['receipts'],
});

const PROMPT = (hintCurrency: string) => `Extract the receipt(s) in this photo as JSON: {"receipts": [ ... ]}.
- The photo may show several separate receipts or bills: return each one as its own entry, left to right.
- currency: ISO 4217 code (RM → MYR, ฿ → THB, đ/₫ → VND, ¥ → JPY). If unclear use "${hintCurrency}".
- date: YYYY-MM-DD.
- Amounts are plain numbers in normal units, no thousands separators ("120.000đ" → 120000, "RM15.00" → 15).
- items: only lines with their own price; skip zero-priced modifiers/options (e.g. ":Coke 0.00").
- Item total = line total (qty × unit price after item discounts). Keep names short, original language.
- tax / serviceCharge only if added on top of the items (0 if "inclusive"); discount positive; total = amount actually paid.
Return only the JSON object.`;

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.search(/[[{]/);
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start < 0 || end <= start) throw new Error('No JSON in model response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Accept {receipts:[…]}, a bare array, or a single receipt object. */
export function parseReceipts(data: unknown): Receipt[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { receipts?: unknown }).receipts)
      ? (data as { receipts: unknown[] }).receipts
      : [data];
  const out = list.map((r) => ReceiptSchema.parse(r)).map((r) => ({ ...r, items: r.items.filter((it) => it.total !== 0) }));
  return out.filter((r) => r.total || r.items.length);
}

/**
 * Structured output first (responseJsonSchema); if the API rejects it (400),
 * fall back to JSON mime type only, then to plain prompting.
 */
const MODES: ('schema' | 'json' | 'plain')[] = ['schema', 'json', 'plain'];

export async function scanReceipt(opts: {
  apiKey: string;
  model: string;
  image: Blob;
  hintCurrency: string;
  categories: string[];
  thinking?: boolean;
  signal?: AbortSignal;
  onWait?: (seconds: number) => void;
}): Promise<Receipt[]> {
  const data = await blobToBase64(opts.image);
  const parts: Part[] = [{ text: PROMPT(opts.hintCurrency) }, { inlineData: { mimeType: opts.image.type || 'image/jpeg', data } }];
  let lastErr: unknown;
  for (const mode of MODES) {
    const generationConfig: Record<string, unknown> = { temperature: 0.1 };
    if (mode !== 'plain') generationConfig.responseMimeType = 'application/json';
    if (mode === 'schema') generationConfig.responseJsonSchema = scanJsonSchema(opts.categories);
    try {
      const res = await generate({ apiKey: opts.apiKey, model: opts.model, contents: [{ role: 'user', parts }], generationConfig, thinking: opts.thinking, signal: opts.signal, onWait: opts.onWait });
      const receipts = parseReceipts(extractJson(textOf(res)));
      if (!receipts.length) throw new Error('No receipt found in the photo');
      return receipts;
    } catch (e) {
      lastErr = e;
      // Retry in a looser mode on unsupported config (400) or unparseable output;
      // transient 5xx are already retried inside generate().
      if (isAuthError(e) || (e instanceof AiError && e.status !== 400) || opts.signal?.aborted) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Scan failed');
}
