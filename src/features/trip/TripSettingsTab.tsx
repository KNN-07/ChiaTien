import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AmountInput, Button, Card, Chip, Field, Input, Money, Select, Toggle, toast } from '../../components/ui';
import { resolveRate } from '../../domain/fx';
import { cloneTrip, COMMON_CURRENCIES, today, uid } from '../../domain/trip';
import type { ExchangeRecord, Trip } from '../../domain/types';
import { useT, type DictKey } from '../../i18n';
import { deleteTrip, removeFrom, saveTrip, updateTrip } from '../../services/db';
import { tripToCsv } from '../../services/csv';
import { refreshRates } from '../../services/fxsync';
import { copyText, downloadFile, safeFileName, shareUrl } from '../../services/share';

const EMOJIS = ['🏝️', '🏔️', '🏕️', '🏙️', '✈️', '🚗', '🍜', '🎉', '⛩️', '🗼', '🏖️', '🎿'];

export function TripSettingsTab({ trip }: { trip: Trip }) {
  const t = useT();
  const nav = useNavigate();
  const ro = trip.locked;
  const [newCur, setNewCur] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (fn: (d: Trip) => void) => updateTrip(trip.id, fn);
  const foreign = trip.currencies.filter((c) => c !== trip.baseCurrency);

  const fetchAll = async () => {
    setBusy(true);
    try {
      const n = await refreshRates(trip, { force: true });
      toast(t('ts.fetch_ok', { n }));
    } catch (e) {
      toast(t('ts.fetch_failed', { err: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const addCurrency = (c: string) => {
    const cur = c.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur) || trip.currencies.includes(cur)) return;
    set((d) => d.currencies.push(cur)).then(() => refreshRates({ ...trip, currencies: [...trip.currencies, cur] }).catch(() => 0));
    setNewCur('');
  };

  const share = async () => {
    const url = shareUrl(trip);
    if (url.length > 8000) toast(t('ts.link_long', { n: url.length }));
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.name, url });
        return;
      } catch {
        /* cancelled → fall back to copy */
      }
    }
    if (await copyText(url)) toast(t('copied'));
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-3">
          <Field label={t('ts.name')}>
            <Input disabled={ro} defaultValue={trip.name} onBlur={(e) => e.target.value.trim() && set((d) => (d.name = e.target.value.trim()))} />
          </Field>
          <Field label={t('ts.emoji')}>
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map((e) => (
                <Chip key={e} active={trip.emoji === e} onClick={() => !ro && set((d) => (d.emoji = e))} className="!px-2 text-lg">
                  {e}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label={t('ts.dates')}>
            <div className="grid grid-cols-2 gap-2">
              <Input disabled={ro} type="date" value={trip.startDate ?? ''} onChange={(e) => set((d) => (d.startDate = e.target.value || undefined))} />
              <Input disabled={ro} type="date" value={trip.endDate ?? ''} onChange={(e) => set((d) => (d.endDate = e.target.value || undefined))} />
            </div>
          </Field>
        </div>
      </Card>

      <Card title={`💱 ${t('ts.currencies')}`}>
        <Field label={t('ts.base_currency')} hint={t('ts.base_warn')}>
          <Select
            disabled={ro}
            value={trip.baseCurrency}
            onChange={(e) => {
              const c = e.target.value;
              set((d) => {
                d.baseCurrency = c;
                if (!d.currencies.includes(c)) d.currencies.unshift(c);
                d.autoRates = {};
                d.fxOverrides = {};
                d.expenses.forEach((x) => (x.fxRate = undefined));
              }).then(() => refreshRates({ ...trip, baseCurrency: c, autoRates: {} }).catch(() => 0));
            }}
          >
            {[...new Set([...COMMON_CURRENCIES, trip.baseCurrency])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {trip.currencies.map((c) => (
            <Chip key={c} active={c === trip.baseCurrency}>
              {c}
              {!ro && c !== trip.baseCurrency && !trip.expenses.some((e) => e.currency === c) && (
                <span onClick={() => set((d) => (d.currencies = d.currencies.filter((x) => x !== c)))} className="ml-1 opacity-60 hover:opacity-100">
                  ✕
                </span>
              )}
            </Chip>
          ))}
        </div>
        {!ro && (
          <div className="mt-3 flex gap-2">
            <Select value="" onChange={(e) => addCurrency(e.target.value)} className="flex-1">
              <option value="">+ {t('ts.add_currency')}</option>
              {COMMON_CURRENCIES.filter((c) => !trip.currencies.includes(c)).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Input value={newCur} onChange={(e) => setNewCur(e.target.value)} placeholder="ISO" maxLength={3} className="!w-20 uppercase" />
            <Button onClick={() => addCurrency(newCur)}>{t('add')}</Button>
          </div>
        )}
      </Card>

      {foreign.length > 0 && (
        <Card
          title={`📈 ${t('ts.rates')}`}
          action={
            <Button size="sm" disabled={busy} onClick={fetchAll}>
              {busy ? t('ts.fetching') : `↻ ${t('ts.fetch_rates')}`}
            </Button>
          }
        >
          <p className="mb-2 text-xs text-slate-500">{t('ts.rates_hint', { base: trip.baseCurrency })}</p>
          <div className="space-y-2">
            {foreign.map((c) => {
              const r = resolveRate(trip, c, today());
              return (
                <div key={c} className="flex items-center gap-2">
                  <span className="w-12 font-semibold">{c}</span>
                  <Input
                    disabled={ro}
                    inputMode="decimal"
                    defaultValue={trip.fxOverrides[c] ?? ''}
                    placeholder={r.rate ? String(+r.rate.toPrecision(6)) : '—'}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value.replace(',', '.'));
                      set((d) => {
                        if (v > 0) d.fxOverrides[c] = v;
                        else delete d.fxOverrides[c];
                      });
                    }}
                    className="flex-1"
                  />
                  <span className="w-28 text-right text-xs text-slate-500">{t(`fx.${r.source}` as DictKey)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {foreign.length > 0 && <ExchangesCard trip={trip} />}

      <Card title={`🔗 ${t('ts.share')}`}>
        <p className="mb-3 text-xs text-slate-500">{t('ts.share_hint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={share}>
            🔗 {t('ts.share_link')}
          </Button>
          <Button onClick={() => downloadFile(`${safeFileName(trip.name)}.json`, JSON.stringify(trip, null, 2))}>⬇️ {t('ts.export_json')}</Button>
          <Button onClick={() => downloadFile(`${safeFileName(trip.name)}.csv`, tripToCsv(trip), 'text/csv;charset=utf-8')}>📄 {t('ts.export_csv')}</Button>
          <Button
            onClick={async () => {
              const c = cloneTrip(trip, t('trips.copy_name', { name: trip.name }));
              await saveTrip(c);
              nav(`/trip/${c.id}`);
            }}
          >
            📑 {t('duplicate')}
          </Button>
        </div>
      </Card>

      <Card title={t('ts.danger')}>
        <Toggle checked={trip.locked} onChange={(v) => set((d) => (d.locked = v))} label={`🔒 ${t('ts.lock')}`} />
        <Button
          variant="danger"
          className="mt-3"
          onClick={async () => {
            if (!confirm(t('ts.delete_confirm', { name: trip.name }))) return;
            await deleteTrip(trip.id);
            nav('/');
          }}
        >
          🗑️ {t('ts.delete_trip')}
        </Button>
      </Card>
    </div>
  );
}

function ExchangesCard({ trip }: { trip: Trip }) {
  const t = useT();
  const ro = trip.locked;
  const foreign = trip.currencies.filter((c) => c !== trip.baseCurrency);
  const blank = (): ExchangeRecord => ({
    id: uid(),
    date: today(),
    fromCurrency: trip.baseCurrency,
    fromAmount: 0,
    toCurrency: foreign[0],
    toAmount: 0,
    updatedAt: 0,
  });
  const [x, setX] = useState<ExchangeRecord>(blank);
  const curs = [trip.baseCurrency, ...foreign];
  return (
    <Card title={`🏦 ${t('ts.exchanges')}`}>
      <p className="mb-3 text-xs text-slate-500">{t('ts.exchanges_hint')}</p>
      <ul className="mb-3 space-y-1">
        {trip.exchanges.map((e) => (
          <li key={e.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900/50">
            <span className="text-slate-500">{e.date.slice(5)}</span>
            <Money minor={e.fromAmount} currency={e.fromCurrency} />
            <span>→</span>
            <Money minor={e.toAmount} currency={e.toCurrency} className="flex-1" />
            {!ro && (
              <button className="text-slate-400 hover:text-rose-600" onClick={() => updateTrip(trip.id, (d) => removeFrom(d, d.exchanges, e.id))}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {!ro && (
        <div className="space-y-2">
          <div className="grid grid-cols-[auto_1fr_5.5rem] items-center gap-2">
            <span className="w-10 text-sm text-slate-500">{t('ts.gave')}</span>
            <AmountInput value={x.fromAmount} currency={x.fromCurrency} onChange={(fromAmount) => setX({ ...x, fromAmount })} />
            <Select value={x.fromCurrency} onChange={(e) => setX({ ...x, fromCurrency: e.target.value })}>
              {curs.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <span className="w-10 text-sm text-slate-500">{t('ts.got')}</span>
            <AmountInput value={x.toAmount} currency={x.toCurrency} onChange={(toAmount) => setX({ ...x, toAmount })} />
            <Select value={x.toCurrency} onChange={(e) => setX({ ...x, toCurrency: e.target.value })}>
              {curs.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Input type="date" value={x.date} onChange={(e) => setX({ ...x, date: e.target.value })} />
            <Button
              disabled={!x.fromAmount || !x.toAmount || x.fromCurrency === x.toCurrency}
              onClick={async () => {
                await updateTrip(trip.id, (d) => d.exchanges.push({ ...x, updatedAt: Date.now() }));
                setX(blank());
              }}
            >
              + {t('ts.add_exchange')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
