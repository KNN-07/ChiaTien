import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MemberPicker } from '../../components/MemberPicker';
import { Page, TopBar } from '../../components/layout';
import { AmountInput, Avatar, Button, Card, Chip, cx, Empty, Field, Input, Money, Segmented, Select, Textarea, toast } from '../../components/ui';
import { resolveRate } from '../../domain/fx';
import { allocate, convertMinor, currencyDigits, formatMoney, toMinor } from '../../domain/money';
import { computeShares, totalWithFee, rescale } from '../../domain/split';
import { CATEGORIES, COMMON_CURRENCIES, emptyExpense, uid } from '../../domain/trip';
import type { Expense, ID, SplitEntry, SplitMode, Trip } from '../../domain/types';
import { validateExpense } from '../../domain/validate';
import { useLocale, useT, type DictKey } from '../../i18n';
import { putImage, removeFrom, updateTrip, upsert, useImageUrl, useTrip } from '../../services/db';
import { ensureRate } from '../../services/fxsync';
import { scanReceipt, type Receipt } from '../../services/gemma';
import { compressImage } from '../../services/image';
import { getSettings, setSettings, useSettings } from '../../services/settings';
import { computedBillTotal, emptyExtras, ItemsEditor, newItem } from './ItemsEditor';

const MODES: SplitMode[] = ['equal', 'shares', 'exact', 'percent', 'adjust', 'itemized'];

export function ExpenseEditor() {
  const { tripId, expenseId } = useParams();
  const { search } = useLocation();
  const trip = useTrip(tripId);
  const t = useT();
  if (trip === undefined) return null;
  if (!trip)
    return (
      <Page>
        <TopBar title={t('not_found')} back="/" />
        <Empty icon="🤷" title={t('not_found')} />
      </Page>
    );
  return <Editor key={`${expenseId}${search}`} trip={trip} expenseId={expenseId!} />;
}

/** Redistribute entry values when the split mode or the selected people change. */
function defaultEntries(mode: SplitMode, ids: ID[], amount: number, prev: SplitEntry[]): SplitEntry[] {
  const old = new Map(prev.map((e) => [e.memberId, e.value]));
  switch (mode) {
    case 'equal':
    case 'itemized':
      return ids.map((id) => ({ memberId: id, value: 1 }));
    case 'shares':
      return ids.map((id) => ({ memberId: id, value: old.get(id) ?? 1 }));
    case 'percent': {
      const parts = allocate(10000, ids.map(() => 1)); // hundredths of a percent
      return ids.map((id, i) => ({ memberId: id, value: parts[i] / 100 }));
    }
    case 'exact': {
      const parts = allocate(amount, ids.map(() => 1));
      return ids.map((id, i) => ({ memberId: id, value: parts[i] }));
    }
    case 'adjust':
      return ids.map((id) => ({ memberId: id, value: old.get(id) ?? 0 }));
  }
}

function Editor({ trip, expenseId }: { trip: Trip; expenseId: string }) {
  const t = useT();
  const locale = useLocale();
  const nav = useNavigate();
  const settings = useSettings();
  const [params] = useSearchParams();
  const existing = trip.expenses.find((e) => e.id === expenseId);
  const isNew = !existing;
  const ro = trip.locked;

  const [draft, setDraft] = useState<Expense>(() => {
    if (existing) return structuredClone(existing);
    const e = emptyExpense(trip, getSettings().lastPayer[trip.id]);
    return e;
  });
  const [multiPayer, setMultiPayer] = useState(() => (existing?.payers.length ?? 1) > 1);
  const [amountManual, setAmountManual] = useState(() => !!existing && existing.split.mode === 'itemized' && existing.amount !== computedBillTotal(existing));
  const [pendingImage, setPendingImage] = useState<Blob | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const storedUrl = useImageUrl(draft.receiptImageId);
  const [pendingUrl, setPendingUrl] = useState<string>();
  useEffect(() => {
    if (!pendingImage) return setPendingUrl(undefined);
    const u = URL.createObjectURL(pendingImage);
    setPendingUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [pendingImage]);

  const patch = (p: Partial<Expense>) => setDraft((d) => ({ ...d, ...p }));

  /** Switch currency keeping the typed numbers (minor-unit digits differ, e.g. VND 0 vs THB 2). */
  const changeCurrency = (currency: string) =>
    setDraft((d) => {
      const k = 10 ** (currencyDigits(currency) - currencyDigits(d.currency));
      const m = (v: number) => Math.round(v * k);
      const x = d.extras;
      return {
        ...d,
        currency,
        amount: m(d.amount),
        payers: d.payers.map((p) => ({ ...p, amount: m(p.amount) })),
        split:
          d.split.mode === 'exact' || d.split.mode === 'adjust'
            ? { ...d.split, entries: d.split.entries.map((e) => ({ ...e, value: m(e.value) })) }
            : d.split,
        items: d.items?.map((it) => ({ ...it, amount: m(it.amount) })),
        extras: x && { ...x, tax: m(x.tax), service: m(x.service), tip: m(x.tip), discount: m(x.discount) },
        fxRate: undefined,
      };
    });

  // Fetch the day's rate in the background so the preview can show base-currency amounts.
  useEffect(() => {
    if (!ro && draft.date) ensureRate(trip, draft.date, draft.currency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.currency, draft.date]);

  /** Expense as it will be saved: single payer gets the whole amount. */
  const normalized = useMemo<Expense>(() => {
    const payers = multiPayer ? draft.payers.filter((p) => p.amount !== 0) : draft.payers.slice(0, 1).map((p) => ({ ...p, amount: draft.amount }));
    return { ...draft, title: draft.title.trim(), payers };
  }, [draft, multiPayer]);

  const issues = useMemo(() => validateExpense(trip, normalized), [trip, normalized]);
  const errors = issues.filter((i) => i.severity === 'error');
  const shares = useMemo(() => {
    const s = computeShares(normalized);
    return normalized.feePct ? rescale(s, totalWithFee(normalized)) : s;
  }, [normalized]);
  const rate = resolveRate(trip, draft.currency, draft.date, draft.fxRate);
  const currencies = [...new Set([...trip.currencies, draft.currency])];
  const isIncome = draft.kind === 'income';
  const splitIds = draft.split.entries.map((e) => e.memberId);

  const setMode = (mode: SplitMode) => {
    const ids = splitIds.length ? splitIds : trip.members.filter((m) => m.kind !== 'pot').map((m) => m.id);
    const p: Partial<Expense> = { split: { mode, entries: defaultEntries(mode, ids, draft.amount, draft.split.entries) } };
    if (mode === 'itemized' && !(draft.items?.length)) {
      p.items = [newItem()];
      p.extras = emptyExtras();
      setAmountManual(draft.amount > 0);
    }
    patch(p);
  };
  const setSplitIds = (ids: ID[]) =>
    patch({
      split: {
        mode: draft.split.mode,
        entries: defaultEntries(draft.split.mode, ids, draft.amount, draft.split.entries),
      },
    });
  const setEntry = (id: ID, value: number) =>
    patch({ split: { ...draft.split, entries: draft.split.entries.map((e) => (e.memberId === id ? { ...e, value } : e)) } });

  const onItemsChange = (p: Pick<Expense, 'items' | 'extras'>) => {
    const next = { ...draft, ...p };
    if (!amountManual) next.amount = computedBillTotal(next);
    setDraft(next);
  };

  const applyReceipt = (r: Receipt) => {
    const cur = /^[A-Z]{3}$/.test(r.currency) ? r.currency : draft.currency;
    const m = (v?: number) => toMinor(v ?? 0, cur);
    const items = r.items
      .filter((it) => it.total || it.name)
      .map((it) => ({
        id: uid(),
        name: it.qty && it.qty !== 1 ? `${it.name} ×${it.qty}` : it.name,
        qty: it.qty,
        amount: m(it.total || (it.qty ?? 1) * (it.unitPrice ?? 0)),
        split: { mode: 'equal' as const, entries: [] },
      }));
    const extras = { tax: m(r.tax), service: m(r.serviceCharge), tip: m(r.tip), discount: Math.abs(m(r.discount)), mode: 'proportional' as const };
    const total = m(r.total) || computedBillTotal({ items, extras });
    const ids = splitIds.length ? splitIds : trip.members.filter((x) => x.kind !== 'pot').map((x) => x.id);
    setDraft((d) => ({
      ...d,
      title: d.title || r.merchant,
      date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date <= new Date(Date.now() + 86400000).toISOString().slice(0, 10) ? r.date : d.date,
      currency: cur,
      category: CATEGORIES.some((c) => c.id === r.category) ? r.category : d.category,
      amount: total,
      items: items.length ? items : [newItem()],
      extras,
      split: { mode: 'itemized', entries: ids.map((id) => ({ memberId: id, value: 1 })) },
    }));
    setAmountManual(true);
    setScanMsg(t('scan.done', { n: items.length }));
  };

  const onPickImage = async (file: File) => {
    setScanMsg(null);
    const img = await compressImage(file);
    setPendingImage(img);
    if (!settings.apiKey) {
      setScanMsg(t('scan.need_key'));
      return;
    }
    setScanning(true);
    try {
      const r = await scanReceipt({
        apiKey: settings.apiKey,
        model: settings.model,
        image: img,
        hintCurrency: draft.currency,
        categories: CATEGORIES.map((c) => c.id),
        thinking: settings.thinking,
      });
      applyReceipt(r);
    } catch (e) {
      setScanMsg(t('scan.failed', { err: e instanceof Error ? e.message : String(e) }));
    } finally {
      setScanning(false);
    }
  };

  const save = async (andNew = false) => {
    if (errors.length) return toast(t(`issue.${errors[0].code}` as DictKey, { x: '' }));
    let receiptImageId = normalized.receiptImageId;
    if (pendingImage) {
      receiptImageId = receiptImageId ?? uid();
      await putImage(trip.id, receiptImageId, pendingImage);
    }
    const toSave: Expense = {
      ...normalized,
      receiptImageId,
      items: normalized.split.mode === 'itemized' ? normalized.items : undefined,
      extras: normalized.split.mode === 'itemized' ? normalized.extras : undefined,
    };
    await updateTrip(trip.id, (d) => {
      upsert(d.expenses, toSave);
      if (!d.currencies.includes(toSave.currency)) d.currencies.push(toSave.currency);
    });
    if (toSave.payers.length === 1) setSettings({ lastPayer: { ...getSettings().lastPayer, [trip.id]: toSave.payers[0].memberId } });
    ensureRate(trip, toSave.date, toSave.currency);
    toast(t('exp.saved'));
    if (andNew) nav(`/trip/${trip.id}/expense/new?n=${Date.now()}`, { replace: true });
    else nav(`/trip/${trip.id}`, { replace: true });
  };

  const del = async () => {
    if (!confirm(t('confirm_delete'))) return;
    await updateTrip(trip.id, (d) => removeFrom(d, d.expenses, draft.id));
    nav(`/trip/${trip.id}`, { replace: true });
  };

  const duplicate = () => {
    const now = Date.now();
    const copy = { ...structuredClone(normalized), id: uid(), receiptImageId: undefined, createdAt: now, updatedAt: now };
    updateTrip(trip.id, (d) => d.expenses.push(copy)).then(() => nav(`/trip/${trip.id}/expense/${copy.id}`, { replace: true }));
  };

  const payerTotal = draft.payers.reduce((a, p) => a + p.amount, 0);
  const people = trip.members.filter((m) => m.kind !== 'pot');
  const shareSum = draft.split.entries.reduce((a, e) => a + e.value, 0);
  const diffLabel = (d: number) =>
    d > 0 ? t('exp.remaining', { x: formatMoney(d, draft.currency, locale) }) : t('exp.over', { x: formatMoney(-d, draft.currency, locale) });

  return (
    <Page>
      <TopBar back={`/trip/${trip.id}`} title={isNew ? t('exp.new') : t('exp.edit')} subtitle={`${trip.emoji ?? ''} ${trip.name}`} />
      <fieldset disabled={ro} className="min-w-0 space-y-4">
        {/* Scan */}
        <Card className={cx(params.get('scan') && isNew && !pendingImage && 'ring-2 ring-teal-500')}>
          <div className="flex items-center gap-3">
            <Button variant={params.get('scan') ? 'primary' : 'secondary'} disabled={scanning} onClick={() => fileRef.current?.click()}>
              📷 {scanning ? t('scan.scanning') : t('scan.pick')}
            </Button>
            {(pendingUrl || storedUrl) && (
              <a href={pendingUrl || storedUrl} target="_blank" rel="noreferrer">
                <img src={pendingUrl || storedUrl} alt="" className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200" />
              </a>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickImage(f);
              e.target.value = '';
            }}
          />
          {scanning && <div className="mt-3 h-1 w-full overflow-hidden rounded bg-slate-100"><div className="h-1 w-1/3 animate-pulse rounded bg-teal-500" /></div>}
          {scanMsg && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {scanMsg}{' '}
              {!settings.apiKey && (
                <Link to="/settings" className="text-teal-700 underline">
                  {t('scan.go_settings')}
                </Link>
              )}
            </p>
          )}
        </Card>

        {/* Basics */}
        <Card>
          <div className="space-y-3">
            <Segmented
              value={draft.kind}
              onChange={(kind) => patch({ kind })}
              options={[
                { value: 'expense', label: `🧾 ${t('exp.kind_expense')}` },
                { value: 'income', label: `💰 ${t('exp.kind_income')}` },
              ]}
            />
            {isIncome && <p className="text-xs text-slate-500">{t('exp.income_hint')}</p>}
            <Field label={t('exp.title')}>
              <Input value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder={t('exp.title_ph')} />
            </Field>
            <div className="grid grid-cols-[1fr_6.5rem] gap-2">
              <Field label={t('exp.amount')} hint={t('exp.amount_hint')}>
                <AmountInput
                  autoFocus={isNew && !params.get('scan')}
                  value={draft.amount}
                  currency={draft.currency}
                  onChange={(amount) => {
                    if (draft.split.mode === 'itemized') setAmountManual(true);
                    patch({ amount });
                  }}
                  className="text-lg font-semibold"
                />
              </Field>
              <Field label={t('exp.currency')}>
                <Select value={draft.currency} onChange={(e) => changeCurrency(e.target.value)}>
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                  <optgroup label="—">
                    {COMMON_CURRENCIES.filter((c) => !currencies.includes(c)).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </optgroup>
                </Select>
              </Field>
            </div>
            {draft.currency !== trip.baseCurrency && (
              <p className="-mt-1 text-xs text-slate-500">
                {rate.rate ? (
                  <>
                    ≈ <Money minor={convertMinor(totalWithFee(draft), draft.currency, trip.baseCurrency, rate.rate)} currency={trip.baseCurrency} /> · 1 {draft.currency} ={' '}
                    {+rate.rate.toPrecision(6)} {trip.baseCurrency} ({t(`fx.${rate.source}` as DictKey)})
                  </>
                ) : (
                  <span className="text-amber-600">⚠️ {t('issue.missing_rate')}</span>
                )}
              </p>
            )}
            <Field label={t('exp.date')}>
              <Input type="date" value={draft.date} onChange={(e) => patch({ date: e.target.value })} />
            </Field>
            {!isIncome && (
              <Field label={t('exp.category')}>
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  {CATEGORIES.map((c) => (
                    <Chip key={c.id} active={draft.category === c.id} onClick={() => patch({ category: c.id })} className="shrink-0">
                      {c.emoji} {t(`cat.${c.id}` as DictKey)}
                    </Chip>
                  ))}
                </div>
              </Field>
            )}
          </div>
        </Card>

        {/* Payers */}
        <Card
          title={isIncome ? t('exp.received_by') : t('exp.paid_by')}
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!multiPayer && draft.payers[0]) patch({ payers: [{ ...draft.payers[0], amount: draft.amount }] });
                setMultiPayer(!multiPayer);
              }}
            >
              {multiPayer ? t('exp.single_payer') : t('exp.multi_payer')}
            </Button>
          }
        >
          {!multiPayer ? (
            <div className="flex flex-wrap gap-1.5">
              {trip.members.map((m) => (
                <Chip key={m.id} className="!pl-1" active={draft.payers[0]?.memberId === m.id} onClick={() => patch({ payers: [{ memberId: m.id, amount: draft.amount }] })}>
                  <Avatar name={m.name} id={m.id} size="sm" kind={m.kind} />
                  {m.name}
                </Chip>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {trip.members.map((m) => {
                const p = draft.payers.find((x) => x.memberId === m.id);
                const setAmt = (amount: number) =>
                  patch({
                    payers: p ? draft.payers.map((x) => (x.memberId === m.id ? { ...x, amount } : x)) : [...draft.payers, { memberId: m.id, amount }],
                  });
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <Avatar name={m.name} id={m.id} size="sm" kind={m.kind} />
                    <span className="w-24 truncate text-sm">{m.name}</span>
                    <div className="flex-1">
                      <AmountInput value={p?.amount ?? 0} currency={draft.currency} onChange={setAmt} />
                    </div>
                    <Button size="sm" variant="ghost" title={t('exp.fill_rest')} onClick={() => setAmt((p?.amount ?? 0) + draft.amount - payerTotal)}>
                      ⤵
                    </Button>
                  </div>
                );
              })}
              <p className={cx('text-right text-sm', payerTotal === draft.amount ? 'text-emerald-600' : 'text-amber-600')}>
                {payerTotal === draft.amount ? '✓' : diffLabel(draft.amount - payerTotal)}
              </p>
            </div>
          )}
        </Card>

        {/* Split */}
        <Card
          title={t('exp.split_for')}
          action={
            !isIncome &&
            draft.payers[0] &&
            !multiPayer && (
              <Button
                size="sm"
                variant="ghost"
                title={t('exp.treat_hint')}
                onClick={() => patch({ split: { mode: 'equal', entries: [{ memberId: draft.payers[0].memberId, value: 1 }] } })}
              >
                🎁 {t('exp.treat')}
              </Button>
            )
          }
        >
          <div className="-mx-1 mb-2 flex gap-1 overflow-x-auto px-1 pb-1">
            {MODES.map((m) => (
              <Chip key={m} active={draft.split.mode === m} onClick={() => setMode(m)} className="shrink-0">
                {t(`mode.${m}` as DictKey)}
              </Chip>
            ))}
          </div>
          <p className="mb-3 text-xs text-slate-500">{t(`mode.${draft.split.mode}_hint` as DictKey)}</p>

          {draft.split.mode === 'itemized' ? (
            <>
              <ItemsEditor trip={trip} draft={draft} onChange={onItemsChange} />
              {amountManual && computedBillTotal(draft) !== draft.amount && computedBillTotal(draft) > 0 && (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setAmountManual(false);
                    patch({ amount: computedBillTotal(draft) });
                  }}
                >
                  {t('exp.use_items_total')}
                </Button>
              )}
            </>
          ) : (
            <>
              <MemberPicker trip={trip} selected={splitIds} onChange={setSplitIds} date={draft.date} />
              {draft.split.mode !== 'equal' && draft.split.entries.length > 0 && (
                <div className="mt-3 space-y-2">
                  {draft.split.entries.map((e) => {
                    const m = trip.members.find((x) => x.id === e.memberId);
                    const others = draft.split.entries.filter((x) => x.memberId !== e.memberId).reduce((a, x) => a + x.value, 0);
                    return (
                      <div key={e.memberId} className="flex items-center gap-2">
                        <span className="w-24 truncate text-sm">{m?.name}</span>
                        <div className="flex-1">
                          {draft.split.mode === 'exact' || draft.split.mode === 'adjust' ? (
                            <AmountInput value={e.value} currency={draft.currency} onChange={(v) => setEntry(e.memberId, v)} />
                          ) : (
                            <Input
                              inputMode="decimal"
                              type="number"
                              step="any"
                              min={0}
                              value={Number.isFinite(e.value) ? e.value : ''}
                              onChange={(ev) => setEntry(e.memberId, parseFloat(ev.target.value) || 0)}
                            />
                          )}
                        </div>
                        <span className="w-6 text-sm text-slate-500">{draft.split.mode === 'percent' ? '%' : draft.split.mode === 'shares' ? '×' : ''}</span>
                        {(draft.split.mode === 'exact' || draft.split.mode === 'percent') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title={t('exp.fill_rest')}
                            onClick={() => setEntry(e.memberId, Math.max(0, (draft.split.mode === 'percent' ? 100 : draft.amount) - others))}
                          >
                            ⤵
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {draft.split.mode === 'exact' && shareSum !== draft.amount && (
                    <p className="text-right text-sm text-amber-600">{diffLabel(draft.amount - shareSum)}</p>
                  )}
                  {draft.split.mode === 'percent' && Math.abs(shareSum - 100) > 0.001 && <p className="text-right text-sm text-amber-600">{+shareSum.toFixed(2)}% / 100%</p>}
                </div>
              )}
            </>
          )}
        </Card>

        {/* Preview */}
        {shares.size > 0 && draft.amount !== 0 && (
          <Card title={t('exp.preview')}>
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {[...shares].map(([id, v]) => {
                const m = trip.members.find((x) => x.id === id);
                return (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <Avatar name={m?.name ?? '?'} id={id} size="sm" kind={m?.kind} />
                    <span className="flex-1 truncate">{m?.name}</span>
                    <Money minor={v} currency={draft.currency} className="font-medium" />
                    {draft.currency !== trip.baseCurrency && rate.rate && (
                      <span className="text-xs text-slate-500">
                        ≈<Money minor={convertMinor(v, draft.currency, trip.baseCurrency, rate.rate)} currency={trip.baseCurrency} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {issues.length > 0 && (
          <ul className="space-y-1">
            {issues.map((i) => (
              <li key={i.code} className={cx('rounded-lg px-3 py-1.5 text-sm', i.severity === 'error' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200')}>
                {i.severity === 'error' ? '⛔' : '⚠️'}{' '}
                {t(`issue.${i.code}` as DictKey, {
                  x:
                    i.diff === undefined
                      ? ''
                      : i.code === 'percent_not_100'
                        ? +i.diff.toFixed(2)
                        : formatMoney(i.diff, draft.currency, locale),
                })}
              </li>
            ))}
          </ul>
        )}

        {/* Advanced */}
        <Card>
          <details open={!!(draft.feePct || draft.fxRate || draft.note)}>
            <summary className="cursor-pointer font-semibold">{t('exp.advanced')}</summary>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('exp.fee_pct')}>
                  <Input type="number" inputMode="decimal" step="any" min={0} value={draft.feePct ?? ''} onChange={(e) => patch({ feePct: parseFloat(e.target.value) || undefined })} placeholder="0" />
                </Field>
                {draft.currency !== trip.baseCurrency && (
                  <Field label={t('exp.fx_rate')}>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      value={draft.fxRate ?? ''}
                      onChange={(e) => patch({ fxRate: parseFloat(e.target.value) || undefined })}
                      placeholder={t('exp.fx_rate_ph', { cur: draft.currency, base: trip.baseCurrency })}
                    />
                  </Field>
                )}
              </div>
              <Field label={t('exp.note')}>
                <Textarea value={draft.note ?? ''} onChange={(e) => patch({ note: e.target.value })} />
              </Field>
              {(pendingImage || draft.receiptImageId) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPendingImage(null);
                    patch({ receiptImageId: undefined });
                  }}
                >
                  🗑️ {t('exp.remove_photo')}
                </Button>
              )}
            </div>
          </details>
        </Card>
      </fieldset>

      {!ro && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-2xl gap-2">
            {!isNew && (
              <>
                <Button variant="ghost" className="text-rose-600" onClick={del}>
                  🗑️
                </Button>
                <Button variant="ghost" onClick={duplicate} title={t('duplicate')}>
                  📑
                </Button>
              </>
            )}
            <div className="flex-1" />
            {isNew && <Button onClick={() => save(true)}>{t('save')} + {t('add')}</Button>}
            <Button variant="primary" onClick={() => save()} disabled={errors.length > 0} className="min-w-28">
              {t('save')}
            </Button>
          </div>
        </div>
      )}
      {people.length === 0 && <Empty icon="👥" title={t('exp.need_members')} />}
    </Page>
  );
}
