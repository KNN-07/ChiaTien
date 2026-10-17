import { z } from 'zod';
import { blobToBase64 } from './image';

const API = 'https://generativelanguage.googleapis.com/v1beta';

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

const PROMPT = (hintCurrency: string, categories: string[]) => `You are a receipt parser. Read the attached receipt / bill photo and return ONLY one JSON object, no markdown, no explanation.

Schema:
{
  "merchant": string,            // shop / restaurant name
  "date": "YYYY-MM-DD" | "",     // purchase date if visible
  "currency": string,            // ISO 4217 code, e.g. VND, THB, JPY, USD. If unclear use "${hintCurrency}"
  "category": string,            // one of: ${categories.join(', ')}
  "items": [ { "name": string, "qty": number, "unitPrice": number, "total": number } ],
  "subtotal": number,
  "tax": number,                 // VAT / tax amount (0 if included in prices or absent)
  "serviceCharge": number,       // service charge amount (0 if none)
  "tip": number,
  "discount": number,            // positive number for any discount / voucher
  "total": number                // final amount actually paid
}

Rules:
- All amounts are plain numbers in the currency's normal units, no thousands separators (e.g. "120.000đ" -> 120000, "฿1,250.50" -> 1250.5).
- "total" of an item is the line total (qty × unit price after item-level discounts).
- Keep item names short, in the original language.
- If a value is missing use 0.`;

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in model response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

interface GenResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

async function generate(apiKey: string, model: string, parts: unknown[]): Promise<string> {
  const r = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    }),
  });
  const data = (await r.json().catch(() => ({}))) as GenResponse;
  if (!r.ok) throw new Error(data.error?.message ?? `HTTP ${r.status}`);
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}

export async function scanReceipt(opts: {
  apiKey: string;
  model: string;
  image: Blob;
  hintCurrency: string;
  categories: string[];
}): Promise<Receipt> {
  const data = await blobToBase64(opts.image);
  const parts = [
    { text: PROMPT(opts.hintCurrency, opts.categories) },
    { inline_data: { mime_type: opts.image.type || 'image/jpeg', data } },
  ];
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await generate(opts.apiKey, opts.model, parts);
      return ReceiptSchema.parse(extractJson(text));
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && /API key|permission|quota|not found/i.test(e.message)) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Scan failed');
}

export async function listGemmaModels(apiKey: string): Promise<string[]> {
  const r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  const data = (await r.json().catch(() => ({}))) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
    error?: { message?: string };
  };
  if (!r.ok) throw new Error(data.error?.message ?? `HTTP ${r.status}`);
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .sort((a, b) => Number(b.includes('gemma')) - Number(a.includes('gemma')) || a.localeCompare(b));
}
