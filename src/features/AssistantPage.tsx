import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { runAgentTurn, slimHistory, type AgentEvent } from '../agent/agent';
import { undoTurn } from '../agent/tools';
import { Page, TopBar } from '../components/layout';
import { Button, Chip, cx, Select } from '../components/ui';
import type { ID, Trip } from '../domain/types';
import { useT, type DictKey } from '../i18n';
import type { Content, Part } from '../services/ai';
import { useTrip, useTrips } from '../services/db';
import { blobToBase64, compressImage } from '../services/image';
import { useSettings } from '../services/settings';

interface Turn {
  id: number;
  text: string;
  imageUrl?: string;
  events: AgentEvent[];
  status: 'running' | 'done' | 'error' | 'undone';
  error?: string;
  before: Map<ID, Trip | null>;
  touched: ID[];
}

interface Chat {
  history: Content[];
  turns: Turn[];
  image?: Blob;
}

/** Conversations survive navigation within the session, one per trip context. */
const chats = new Map<string, Chat>();

export function AssistantPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tripId = params.get('trip') ?? '';
  const trip = useTrip(tripId || undefined);
  const trips = useTrips();
  const settings = useSettings();
  const [chat, setChatState] = useState<Chat>(() => chats.get(tripId) ?? { history: [], turns: [] });
  const [input, setInput] = useState('');
  const [image, setImage] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const setChat = (fn: (c: Chat) => Chat) =>
    setChatState((c) => {
      const next = fn(c);
      chats.set(tripId, next);
      return next;
    });

  useEffect(() => {
    setChatState(chats.get(tripId) ?? { history: [], turns: [] });
  }, [tripId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.turns]);
  useEffect(() => {
    if (!image) return setImageUrl(undefined);
    const u = URL.createObjectURL(image);
    setImageUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [image]);

  const updateTurn = (id: number, fn: (x: Turn) => Turn) => setChat((c) => ({ ...c, turns: c.turns.map((x) => (x.id === id ? fn(x) : x)) }));

  const send = async (text: string) => {
    const msg = text.trim();
    if ((!msg && !image) || busy || !settings.apiKey) return;
    const id = Date.now();
    const parts: Part[] = [];
    if (image) parts.push({ inlineData: { mimeType: image.type || 'image/jpeg', data: await blobToBase64(image) } });
    parts.push({ text: msg || '(receipt photo)' });
    const turn: Turn = { id, text: msg, imageUrl: image ? URL.createObjectURL(image) : undefined, events: [], status: 'running', before: new Map(), touched: [] };
    const ctx = { before: turn.before, image: image ?? chat.image, touched: new Set<ID>() };
    setChat((c) => ({ ...c, turns: [...c.turns, turn], image: image ?? c.image }));
    setInput('');
    setImage(null);
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const history = await runAgentTurn({
        apiKey: settings.apiKey,
        model: settings.model,
        thinking: settings.thinking,
        lang: settings.lang,
        history: slimHistory(chat.history),
        userParts: parts,
        currentTrip: trip ?? undefined,
        ctx,
        signal: ac.signal,
        onEvent: (e) => updateTurn(id, (x) => ({ ...x, events: [...x.events, e], touched: [...ctx.touched] })),
      });
      setChat((c) => ({ ...c, history }));
      updateTurn(id, (x) => ({ ...x, status: 'done', touched: [...ctx.touched] }));
    } catch (e) {
      const aborted = ac.signal.aborted;
      updateTurn(id, (x) => ({ ...x, status: aborted ? 'done' : 'error', error: aborted ? undefined : e instanceof Error ? e.message : String(e), touched: [...ctx.touched] }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const listen = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Rec = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = settings.lang === 'vi' ? 'vi-VN' : 'en-US';
    rec.interimResults = false;
    rec.onresult = (ev) => setInput((s) => `${s} ${ev.results[0][0].transcript}`.trim());
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };
  const canListen = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const examples: DictKey[] = trip ? ['ai.ex2', 'ai.ex3', 'ai.ex5', 'ai.ex4'] : ['ai.ex1', 'ai.ex2', 'ai.ex4'];

  return (
    <Page className="flex flex-col !pb-0">
      <TopBar
        back={tripId ? `/trip/${tripId}` : '/'}
        title={`✨ ${t('ai.title')}`}
        subtitle={settings.model}
        right={
          chat.turns.length > 0 && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setChat(() => ({ history: [], turns: [] }))}>
              {t('ai.clear')}
            </Button>
          )
        }
      />
      <Select value={tripId} onChange={(e) => setParams(e.target.value ? { trip: e.target.value } : {}, { replace: true })} className="mb-3">
        <option value="">🗂️ {t('ai.no_context')}</option>
        {trips?.map((x) => (
          <option key={x.id} value={x.id}>
            {x.emoji} {x.name}
          </option>
        ))}
      </Select>

      <div className="flex-1 space-y-4 pb-40">
        {!settings.apiKey && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            {t('ai.need_key')}{' '}
            <Link to="/settings" className="underline">
              {t('scan.go_settings')}
            </Link>
          </p>
        )}
        {chat.turns.length === 0 && (
          <div className="py-6 text-center">
            <div className="mb-2 text-4xl">✨</div>
            <p className="mx-auto max-w-md text-sm text-slate-600 dark:text-slate-300">{t('ai.welcome')}</p>
            <div className="mt-4 flex flex-col items-center gap-2">
              {examples.map((k) => (
                <Chip key={k} onClick={() => setInput(t(k))} className="max-w-full text-left">
                  💬 {t(k)}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {chat.turns.map((turn) => (
          <div key={turn.id} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-teal-600 px-3.5 py-2 text-white">
                {turn.imageUrl && <img src={turn.imageUrl} alt="" className="mb-1.5 max-h-40 rounded-lg" />}
                {turn.text && <p className="whitespace-pre-wrap">{turn.text}</p>}
              </div>
            </div>
            {turn.events.map((e, i) =>
              e.type === 'text' ? (
                <div key={i} className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-3.5 py-2 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                  {e.text}
                </div>
              ) : (
                <ToolCard key={i} event={e} />
              ),
            )}
            {turn.status === 'running' && <p className="animate-pulse text-sm text-slate-500">⏳ {t('ai.working')}</p>}
            {turn.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">{t('ai.error', { err: turn.error })}</p>}
            {turn.status !== 'running' && turn.before.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {turn.status === 'undone' ? (
                  <span className="text-slate-500">↩️ {t('ai.undone')}</span>
                ) : (
                  <Button
                    size="sm"
                    onClick={async () => {
                      await undoTurn(turn.before);
                      updateTurn(turn.id, (x) => ({ ...x, status: 'undone' }));
                    }}
                  >
                    ↩️ {t('ai.undo')}
                  </Button>
                )}
                {turn.status !== 'undone' &&
                  turn.touched
                    .filter((id) => id !== tripId)
                    .map((id) => (
                      <Link key={id} to={`/trip/${id}`} className="text-teal-700 underline dark:text-teal-400">
                        {t('ai.view_trip')} →
                      </Link>
                    ))}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <form
          className="mx-auto max-w-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          {imageUrl && (
            <div className="mb-2 flex items-center gap-2">
              <img src={imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
              <button type="button" className="text-sm text-slate-500" onClick={() => setImage(null)}>
                ✕
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button type="button" title={t('ai.attach')} onClick={() => fileRef.current?.click()} className="rounded-full p-2.5 text-xl hover:bg-slate-100 dark:hover:bg-slate-800">
              📷
            </button>
            {canListen && (
              <button
                type="button"
                title={t('ai.voice')}
                onClick={listen}
                className={cx('rounded-full p-2.5 text-xl hover:bg-slate-100 dark:hover:bg-slate-800', listening && 'animate-pulse bg-rose-100')}
              >
                🎙️
              </button>
            )}
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={listening ? t('ai.listening') : t('ai.placeholder')}
              className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-900 sm:text-sm"
            />
            {busy ? (
              <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
                ■ {t('ai.stop')}
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={!settings.apiKey || (!input.trim() && !image)}>
                ➤
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) setImage(await compressImage(f));
            }}
          />
        </form>
      </div>
    </Page>
  );
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: (ev: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
  onend: () => void;
  start: () => void;
}

/** Compact card for one tool call. Read-only lookups are shown muted. */
function ToolCard({ event }: { event: Extract<AgentEvent, { type: 'tool' }> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const r = event.result;
  const readOnly = ['list_trips', 'get_trip', 'get_balances'].includes(event.name);
  const label = t(`tool.${event.name}` as DictKey);
  const summary = event.ok ? summarize(event) : String(r.error ?? '');
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className={cx(
        'block w-full max-w-[90%] rounded-xl px-3 py-1.5 text-left text-sm',
        !event.ok
          ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200'
          : readOnly
            ? 'text-slate-500'
            : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
      )}
    >
      <span className="font-medium">
        {event.ok ? (readOnly ? '🔎' : '✅') : '⚠️'} {label}
      </span>
      {summary && <span className="ml-1.5">{summary}</span>}
      {open && <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap text-xs opacity-80">{JSON.stringify({ args: event.args, result: r }, null, 1)}</pre>}
    </button>
  );
}

function summarize(e: Extract<AgentEvent, { type: 'tool' }>): string {
  const r = e.result as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const a = e.args as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const num = (v: number) => new Intl.NumberFormat().format(v);
  switch (e.name) {
    case 'create_trip':
      return `${r.name} · ${(r.members ?? []).join(', ')}`;
    case 'add_members':
      return (r.added ?? []).join(', ');
    case 'add_expense':
    case 'update_expense': {
      const x = r.expense;
      if (!x) return '';
      return `${x.title || x.category} · ${num(x.amount)} ${x.currency} · ${x.paid_by.map((p: { name: string }) => p.name).join(', ')} → ${x.shares.map((s: { name: string }) => s.name).join(', ')}`;
    }
    case 'delete_expense':
      return String(r.deleted ?? '');
    case 'add_transfer':
      return `${r.from} → ${r.to} · ${num(r.amount)} ${r.currency}`;
    case 'set_group':
      return `${r.name}: ${(r.members ?? []).join(', ')}`;
    case 'set_exchange_rate':
    case 'add_currency_exchange':
      return String(r.rate ?? '');
    case 'update_member':
      return String(r.member?.name ?? a.name ?? '');
    case 'get_trip':
      return String(r.name ?? '');
    default:
      return '';
  }
}
