import { CATEGORIES, today } from '../domain/trip';
import type { Trip } from '../domain/types';
import { generate, textOf, type Content, type Part } from '../services/ai';
import { ActionError } from './actions';
import { executeTool, TOOL_DECLARATIONS, type ToolContext } from './tools';

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; args: Record<string, unknown>; result: Record<string, unknown>; ok: boolean }
  | { type: 'wait'; seconds: number };

const MAX_STEPS = 12;

function systemPrompt(lang: 'vi' | 'en', currentTrip?: Trip | null) {
  return `You are the assistant inside ChiaTiền, a trip expense-splitting app. You manage the user's trips by calling tools.
Today is ${today()}. Reply in ${lang === 'vi' ? 'Vietnamese' : 'English'} (or the language the user writes in), short and friendly.

How to work:
- Act directly with tools; don't ask for confirmation for normal adds/edits (the user can undo). Do ask when something essential is genuinely unknown or ambiguous (e.g. who paid, which trip).
- Before changing a trip you haven't seen in this conversation, call get_trip (or list_trips if you need the id). Use exact member names from the trip.
- Amounts are normal units. Vietnamese shorthand: "k" = ×1,000 (150k = 150000), "tr"/"triệu"/"củ" = ×1,000,000, "lít" = 100,000 (slang), "xị" = 100,000 (slang).
- "tôi"/"mình"/"I"/"me" is the user; if you don't know which member that is, ask once and remember.
- Default split: equal among everyone present that day (omit participants). "trừ X"/"except X" → list the others. "A bao"/"A treats" → participants = [A].
- Children / half portions → split_mode "shares". Someone ordered extra → "adjust" or "itemized".
- Shared fund ("quỹ chung", "góp quỹ"): add a member with kind "pot", record contributions with add_transfer person → pot, and expenses paid_by the pot.
- Repayments ("A đã trả B 200k", "A chuyển khoản cho B") → add_transfer.
- Refunds / deposits returned / selling stuff → save_expense with kind "income"; paid_by = who received the money.
- Foreign currency: set currency; rates are fetched automatically. If the user mentions a real exchange ("đổi 10 triệu được 13.000 baht"), call add_currency_exchange.
- Receipt photo: read it carefully. A photo can contain several receipts: record each one as its own expense. Prefer itemized with items (assign items via "for" when the user says who had what); skip zero-priced modifier lines; tax/service only if added on top (not "inclusive"); set attach_receipt=true. Use ISO currency codes (RM → MYR).
- Categories: ${CATEGORIES.map((c) => c.id).join(', ')}.
- Several expenses in one message → call save_expense once per expense, in parallel.
- Expenses have numbers ("no" in get_trip, oldest = 1) and items are numbered within a bill: "khoản số 3" / "món 2 của khoản 5" refer to these. Items: pass qty and unit_price when known.
- When the user gives instructions per receipt/expense ("left one Chi paid, only Chi and Dũng ate; right one An paid, split with everyone"), apply each instruction only to its own expense: paid_by = who paid THAT one; participants = the people named for THAT one ("everyone"/"cả nhóm"/"chia đều" with no names → omit participants). "trái"/"left" = the leftmost receipt in the photo, "phải"/"right" = the rightmost. Re-read the user's words before each call.
- After acting, confirm briefly what was recorded (amount, payer, split). For balance questions call get_balances and summarise who pays whom.
${
    currentTrip
      ? `\nThe user currently has this trip open: "${currentTrip.name}" (trip_id ${currentTrip.id}, base ${currentTrip.baseCurrency}). Members: ${
          currentTrip.members.map((m) => (m.kind === 'person' ? m.name : `${m.name} (${m.kind})`)).join(', ') || 'none yet'
        }. Assume they mean this trip; you don't need get_trip just to add expenses.`
      : ''
  }`;
}

export async function runAgentTurn(opts: {
  apiKey: string;
  model: string;
  thinking: boolean;
  lang: 'vi' | 'en';
  history: Content[];
  userParts: Part[];
  currentTrip?: Trip | null;
  ctx: ToolContext;
  onEvent: (e: AgentEvent) => void;
  signal?: AbortSignal;
}): Promise<Content[]> {
  const contents: Content[] = [...opts.history, { role: 'user', parts: opts.userParts }];
  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await generate({
      apiKey: opts.apiKey,
      model: opts.model,
      contents,
      systemInstruction: systemPrompt(opts.lang, opts.currentTrip),
      tools: TOOL_DECLARATIONS,
      thinking: opts.thinking,
      signal: opts.signal,
      onWait: (seconds) => opts.onEvent({ type: 'wait', seconds }),
    });
    // Keep the model turn verbatim (incl. thought signatures) for the next request.
    contents.push(reply);
    const text = textOf(reply);
    if (text) opts.onEvent({ type: 'text', text });
    const calls = reply.parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    if (!calls.length) break;

    const responses: Part[] = [];
    // Run sequentially: later calls often depend on earlier ones (create trip → add expense).
    for (const call of calls) {
      const args = (call.args ?? {}) as Record<string, unknown>;
      let result: Record<string, unknown>;
      let ok = true;
      try {
        result = await executeTool(call.name, args, opts.ctx);
      } catch (e) {
        ok = false;
        result = { error: e instanceof ActionError ? e.message : `Unexpected error: ${e instanceof Error ? e.message : String(e)}` };
      }
      opts.onEvent({ type: 'tool', name: call.name, args, result, ok });
      responses.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response: result } });
    }
    contents.push({ role: 'user', parts: responses });
    if (opts.signal?.aborted) break;
  }
  return contents;
}

/** Drop inline images from older turns so long chats stay light. */
export function slimHistory(contents: Content[]): Content[] {
  return contents.map((c, i) =>
    i >= contents.length - 2 ? c : { ...c, parts: c.parts.map((p) => (p.inlineData ? { text: '[photo sent earlier]' } : p)) },
  );
}
