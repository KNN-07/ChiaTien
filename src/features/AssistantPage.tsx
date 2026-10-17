import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { runAgentTurn, slimHistory, type AgentEvent } from '../agent/agent';
import { undoTurn } from '../agent/tools';
import {
  faArrowRight,
  faArrowUp,
  faChevronDown,
  faCircleCheck,
  faMagnifyingGlass,
  faMicrophone,
  faPaperclip,
  faPenToSquare,
  faRotateLeft,
  faSpinner,
  faStop,
  faTriangleExclamation,
  faWandMagicSparkles,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { Icon } from '../components/icons';
import { BottomBar, Page, TopBar } from '../components/layout';
import { Alert, Button, buttonVariants, cn, Select } from '../components/ui';
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
    <Page wide={false} className="flex flex-col">
      <TopBar
        back={tripId ? `/trip/${tripId}` : '/'}
        title={t('ai.title')}
        subtitle={settings.model}
        right={
          chat.turns.length > 0 && (
            <Button size="sm" variant="ghost" icon={faPenToSquare} disabled={busy} onClick={() => setChat(() => ({ history: [], turns: [] }))}>
              <span className="hidden sm:inline">{t('ai.clear')}</span>
            </Button>
          )
        }
      />
      <Select value={tripId} onChange={(e) => setParams(e.target.value ? { trip: e.target.value } : {}, { replace: true })} className="mb-5" aria-label={t('ai.context', { name: '' })}>
        <option value="">{t('ai.no_context')}</option>
        {trips?.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </Select>

      <div className="flex-1 space-y-5 pb-44">
        {!settings.apiKey && (
          <Alert variant="warning">
            {t('ai.need_key')} <Link to="/settings">{t('scan.go_settings')}</Link>
          </Alert>
        )}
        {chat.turns.length === 0 && (
          <div className="flex flex-col items-center py-10 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border bg-muted">
              <Icon icon={faWandMagicSparkles} />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">{t('ai.title')}</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('ai.welcome')}</p>
            <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
              {examples.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setInput(t(k))}
                  className="rounded-lg border bg-card px-3 py-2.5 text-left text-sm shadow-sm transition-colors hover:bg-accent"
                >
                  {t(k)}
                </button>
              ))}
            </div>
          </div>
        )}

        {chat.turns.map((turn) => (
          <div key={turn.id} className="grid gap-2">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-lg bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                {turn.imageUrl && <img src={turn.imageUrl} alt="" className="mb-1.5 max-h-40 rounded-md" />}
                {turn.text && <p className="whitespace-pre-wrap">{turn.text}</p>}
              </div>
            </div>
            {turn.events.map((e, i) =>
              e.type === 'text' ? (
                <div key={i} className="flex gap-2.5">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-muted">
                    <Icon icon={faWandMagicSparkles} className="text-[11px]" />
                  </span>
                  <div className="max-w-[90%] whitespace-pre-wrap rounded-lg border bg-card px-3.5 py-2 text-sm shadow-sm">{e.text}</div>
                </div>
              ) : (
                <ToolCard key={i} event={e} />
              ),
            )}
            {turn.status === 'running' && (
              <p className="flex items-center gap-2 pl-9 text-sm text-muted-foreground">
                <Icon icon={faSpinner} spin className="text-xs" /> {t('ai.working')}
              </p>
            )}
            {turn.error && <Alert variant="destructive">{t('ai.error', { err: turn.error })}</Alert>}
            {turn.status !== 'running' && turn.before.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 pl-9 text-sm">
                {turn.status === 'undone' ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Icon icon={faRotateLeft} className="text-xs" /> {t('ai.undone')}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={faRotateLeft}
                    onClick={async () => {
                      await undoTurn(turn.before);
                      updateTurn(turn.id, (x) => ({ ...x, status: 'undone' }));
                    }}
                  >
                    {t('ai.undo')}
                  </Button>
                )}
                {turn.status !== 'undone' &&
                  turn.touched
                    .filter((id) => id !== tripId)
                    .map((id) => (
                      <Link key={id} to={`/trip/${id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                        {t('ai.view_trip')} <Icon icon={faArrowRight} className="text-[10px]" />
                      </Link>
                    ))}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <BottomBar className="bg-background/80">
        <form
          className="mx-auto max-w-3xl"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="rounded-xl border bg-card shadow-sm focus-within:ring-1 focus-within:ring-ring">
            {imageUrl && (
              <div className="flex items-center gap-2 px-3 pt-3">
                <img src={imageUrl} alt="" className="h-12 w-12 rounded-md border object-cover" />
                <Button variant="ghost" size="icon-sm" onClick={() => setImage(null)} aria-label={t('exp.remove_photo')}>
                  <Icon icon={faXmark} className="text-xs" />
                </Button>
              </div>
            )}
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={listening ? t('ai.listening') : t('ai.placeholder')}
              className="block max-h-40 w-full resize-none bg-transparent px-3 pt-3 text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
            <div className="flex items-center gap-1 p-2">
              <Button variant="ghost" size="icon-sm" title={t('ai.attach')} aria-label={t('ai.attach')} onClick={() => fileRef.current?.click()}>
                <Icon icon={faPaperclip} />
              </Button>
              {canListen && (
                <Button variant="ghost" size="icon-sm" title={t('ai.voice')} aria-label={t('ai.voice')} onClick={listen} className={cn(listening && 'animate-pulse text-negative')}>
                  <Icon icon={faMicrophone} />
                </Button>
              )}
              <div className="flex-1" />
              {busy ? (
                <Button size="sm" variant="outline" icon={faStop} onClick={() => abortRef.current?.abort()}>
                  {t('ai.stop')}
                </Button>
              ) : (
                <Button type="submit" size="icon-sm" disabled={!settings.apiKey || (!input.trim() && !image)} aria-label={t('ai.send')}>
                  <Icon icon={faArrowUp} />
                </Button>
              )}
            </div>
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
      </BottomBar>
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

/** Compact row for one tool call. Read-only lookups are shown muted. */
function ToolCard({ event }: { event: Extract<AgentEvent, { type: 'tool' }> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const r = event.result;
  const readOnly = ['list_trips', 'get_trip', 'get_balances'].includes(event.name);
  const label = t(`tool.${event.name}` as DictKey);
  const summary = event.ok ? summarize(event) : String(r.error ?? '');
  return (
    <div className="pl-9">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full max-w-[90%] items-start gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50',
          !event.ok && 'border-negative/40 bg-negative/5 text-negative',
          event.ok && readOnly && 'border-dashed text-muted-foreground',
        )}
      >
        <Icon
          icon={!event.ok ? faTriangleExclamation : readOnly ? faMagnifyingGlass : faCircleCheck}
          className={cn('mt-0.5 text-[11px]', event.ok && !readOnly && 'text-positive')}
        />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{label}</span>
          {summary && <span className={cn('ml-1.5', event.ok && 'text-muted-foreground')}>{summary}</span>}
          {open && <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px] text-foreground">{JSON.stringify({ args: event.args, result: r }, null, 1)}</pre>}
        </span>
        <Icon icon={faChevronDown} className={cn('mt-0.5 text-[10px] text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
    </div>
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
