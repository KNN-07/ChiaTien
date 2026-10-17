/** Minimal Gemini API (generativelanguage.googleapis.com) client used for Gemma 4. */
const API = 'https://generativelanguage.googleapis.com/v1beta';

export interface FunctionCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

export interface Part {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: FunctionCall;
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
}

export interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface GenerateOptions {
  apiKey: string;
  model: string;
  contents: Content[];
  systemInstruction?: string;
  tools?: FunctionDeclaration[];
  generationConfig?: Record<string, unknown>;
  thinking?: boolean;
  signal?: AbortSignal;
}

export class AiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function generate(opts: GenerateOptions): Promise<Content> {
  const body: Record<string, unknown> = {
    contents: opts.contents,
    generationConfig: {
      temperature: 0.2,
      ...opts.generationConfig,
      // Gemma 4 only toggles thinking: "high" = on, "minimal" = off.
      thinkingConfig: { thinkingLevel: opts.thinking ? 'high' : 'minimal' },
    },
  };
  if (opts.systemInstruction) body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  if (opts.tools?.length) body.tools = [{ functionDeclarations: opts.tools }];

  const r = await fetch(`${API}/models/${encodeURIComponent(opts.model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = (await r.json().catch(() => ({}))) as {
    candidates?: { content?: Content; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    error?: { message?: string };
  };
  if (!r.ok) throw new AiError(data.error?.message ?? `HTTP ${r.status}`, r.status);
  const content = data.candidates?.[0]?.content;
  if (!content) throw new AiError(data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? 'Empty response');
  return { role: 'model', parts: content.parts ?? [] };
}

/** Visible answer text (thought parts excluded). */
export const textOf = (c: Content) =>
  c.parts
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim();

export async function listModels(apiKey: string): Promise<string[]> {
  const r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  const data = (await r.json().catch(() => ({}))) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
    error?: { message?: string };
  };
  if (!r.ok) throw new AiError(data.error?.message ?? `HTTP ${r.status}`, r.status);
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .sort((a, b) => Number(b.includes('gemma-4')) - Number(a.includes('gemma-4')) || Number(b.includes('gemma')) - Number(a.includes('gemma')) || a.localeCompare(b));
}

export const isAuthError = (e: unknown) => e instanceof AiError && (e.status === 401 || e.status === 403 || /API key/i.test(e.message));
