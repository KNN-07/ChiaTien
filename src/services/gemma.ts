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

export const ReceiptSchema = z.object({
  merchant: z.string().nullish().transform((v) => v ?? ''),
  date: z.string().nullish().transform((v) => v ?? ''),
  currency: z.string().nullish().transform((v) => (v ?? '').toUpperCase().slice(0, 3)),
  category: z.string().nullish().transform((v) => v ?? ''),
  items: z
    .array(
      z.object({
        name: z.string().nullish().transform((v) => v ?? ''),
        qty: num.optional(),
        unitPrice: num.optional(),
        total: num,
      }),
    )
    .default([]),
  subtotal: num.optional(),
  tax: num.optional(),
  serviceCharge: num.optional(),
  tip: num.optional(),
  discount: num.optional(),
  total: num,
});

export type Receipt = z.infer<typeof ReceiptSchema>;

/** JSON Schema for Gemini structured output. */
const receiptJsonSchema = (categories: string[]) => ({
  type: 'object',
  properties: {
    merchant: { type: 'string', description: 'Shop / restaurant name' },
    date: { type: 'string', description: 'Purchase date YYYY-MM-DD, or empty' },
    currency: { type: 'string', description: 'ISO 4217 code' },
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
    tax: { type: 'number' },
    serviceCharge: { type: 'number' },
    tip: { type: 'number' },
    discount: { type: 'number', description: 'Positive number' },
    total: { type: 'number', description: 'Final amount paid' },
  },
  required: ['merchant', 'currency', 'items', 'total'],
});

const PROMPT = (hintCurrency: string) => `Read this receipt / bill photo and extract it as JSON.
- Currency: ISO 4217 code (VND, THB, JPY, USD…). If unclear use "${hintCurrency}".
- Amounts are plain numbers in normal units, no thousands separators ("120.000đ" → 120000, "฿1,250.50" → 1250.5).
- Item "total" = line total (qty × unit price after item discounts). Keep names short, original language.
- tax = VAT/tax amount only if added on top (0 if included); serviceCharge, tip, discount (positive) or 0.
- total = final amount actually paid. Missing values → 0.
Return only the JSON object.`;

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in model response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Structured output first (responseJsonSchema); if the model/API rejects it,
 * fall back to JSON mime type only, then to plain prompting.
 */
const MODES: Record<string, unknown>[] = [
  { responseMimeType: 'application/json', responseJsonSchema: undefined as unknown },
  { responseMimeType: 'application/json' },
  {},
];

export async function scanReceipt(opts: {
  apiKey: string;
  model: string;
  image: Blob;
  hintCurrency: string;
  categories: string[];
  thinking?: boolean;
}): Promise<Receipt> {
  const data = await blobToBase64(opts.image);
  const parts: Part[] = [{ text: PROMPT(opts.hintCurrency) }, { inlineData: { mimeType: opts.image.type || 'image/jpeg', data } }];
  let lastErr: unknown;
  for (const mode of MODES) {
    const generationConfig = 'responseJsonSchema' in mode ? { ...mode, responseJsonSchema: receiptJsonSchema(opts.categories) } : mode;
    try {
      const res = await generate({
        apiKey: opts.apiKey,
        model: opts.model,
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.1, ...generationConfig },
        thinking: opts.thinking,
      });
      return ReceiptSchema.parse(extractJson(textOf(res)));
    } catch (e) {
      lastErr = e;
      if (isAuthError(e) || (e instanceof AiError && e.status === 404)) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Scan failed');
}
