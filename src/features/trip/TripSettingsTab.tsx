import { faArrowRight, faArrowsRotate, faClone, faDownload, faFileCsv, faLink, faPlus, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, TRIP_ICONS, tripIcon } from '../../components/icons';
import { AmountInput, Badge, Button, Card, cn, Field, Input, Money, Select, Toggle, toast } from '../../components/ui';
import { resolveRate } from '../../domain/fx';
import { cloneTrip, COMMON_CURRENCIES, today, uid } from '../../domain/trip';
import type { ExchangeRecord, Trip } from '../../domain/types';
import { useT, type DictKey } from '../../i18n';
import { deleteTrip, removeFrom, saveTrip, updateTrip } from '../../services/db';
import { tripToCsv } from '../../services/csv';
import { refreshRates } from '../../services/fxsync';
import { copyText, downloadFile, safeFileName, shareUrl } from '../../services/share';

export function TripSettingsTab({ trip }: { trip: Trip }) {
  const t = useT();
  const nav = useNavigate();
  const ro = trip.locked;
  const [newCur, setNewCur] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (fn: (d: Trip) => void) => updateTrip(trip.id, fn);
  const foreign = trip.currencies.filter((c) => c !== trip.baseCurrency);
  const currentIcon = tripIcon(trip.emoji);

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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div className="grid gap-6">
        <Card title={t('ts.name')}>
          <div className="grid gap-4">
            <Input disabled={ro} defaultValue={trip.name} onBlur={(e) => e.target.value.trim() && set((d) => (d.name = e.target.value.trim()))} />
            <Field label={t('ts.emoji')}>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(TRIP_ICONS).map(([key, ic]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={ro}
                    onClick={() => set((d) => (d.emoji = key))}
                    className={cn(
                      'inline-flex h-9 w-9 items-center justify-center rounded-md border text-sm transition-colors',
                      ic === currentIcon ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                    )}
                    aria-label={key}
                  >
                    <Icon icon={ic} />
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t('ts.dates')}>
              <div className="grid grid-cols-2 gap-3">
                <Input disabled={ro} type="date" value={trip.startDate ?? ''} onChange={(e) => set((d) => (d.startDate = e.target.value || undefined))} />
                <Input disabled={ro} type="date" value={trip.endDate ?? ''} onChange={(e) => set((d) => (d.endDate = e.target.value || undefined))} />
              </div>
            </Field>
          </div>
        </Card>

        <Card title={t('ts.currencies')} description={t('ts.base_warn')}>
          <div className="grid gap-4">
            <Field label={t('ts.base_currency')}>
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
            <div className="flex flex-wrap gap-1.5">
              {trip.currencies.map((c) => (
                <Badge key={c} variant={c === trip.baseCurrency ? 'default' : 'outline'} className="h-7 px-2.5 text-xs">
                  {c}
                  {!ro && c !== trip.baseCurrency && !trip.expenses.some((e) => e.currency === c) && (
                    <button onClick={() => set((d) => (d.currencies = d.currencies.filter((x) => x !== c)))} className="ml-1 opacity-60 hover:opacity-100" aria-label={`remove ${c}`}>
                      <Icon icon={faXmark} className="text-[10px]" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
            {!ro && (
              <div className="flex gap-2">
                <Select value="" onChange={(e) => addCurrency(e.target.value)} className="flex-1">
                  <option value="">{t('ts.add_currency')}</option>
                  {COMMON_CURRENCIES.filter((c) => !trip.currencies.includes(c)).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
                <Input value={newCur} onChange={(e) => setNewCur(e.target.value)} placeholder="ISO" maxLength={3} className="w-20 uppercase" />
                <Button variant="outline" size="icon" onClick={() => addCurrency(newCur)} aria-label={t('add')}>
                  <Icon icon={faPlus} />
                </Button>
              </div>
            )}
          </div>
        </Card>

        {foreign.length > 0 && (
          <Card
            title={t('ts.rates')}
            description={t('ts.rates_hint', { base: trip.baseCurrency })}
            action={
              <Button size="sm" variant="outline" disabled={busy} icon={faArrowsRotate} onClick={fetchAll}>
                {busy ? t('ts.fetching') : t('ts.fetch_rates')}
              </Button>
            }
          >
            <div className="divide-y rounded-lg border">
              {foreign.map((c) => {
                const r = resolveRate(trip, c, today());
                return (
                  <div key={c} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-12 text-sm font-semibold">{c}</span>
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
                    <Badge variant={r.source === 'missing' ? 'warning' : 'secondary'} className="w-32 justify-center font-medium">
                      {t(`fx.${r.source}` as DictKey)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {foreign.length > 0 && <ExchangesCard trip={trip} />}
      </div>

      <div className="grid gap-6 xl:sticky xl:top-20">
        <Card title={t('ts.share')} description={t('ts.share_hint')}>
          <div className="grid gap-2">
            <Button icon={faLink} onClick={share}>
              {t('ts.share_link')}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" icon={faDownload} onClick={() => downloadFile(`${safeFileName(trip.name)}.json`, JSON.stringify(trip, null, 2))}>
                JSON
              </Button>
              <Button variant="outline" icon={faFileCsv} onClick={() => downloadFile(`${safeFileName(trip.name)}.csv`, tripToCsv(trip), 'text/csv;charset=utf-8')}>
                CSV
              </Button>
            </div>
            <Button
              variant="outline"
              icon={faClone}
              onClick={async () => {
                const c = cloneTrip(trip, t('trips.copy_name', { name: trip.name }));
                await saveTrip(c);
                nav(`/trip/${c.id}`);
              }}
            >
              {t('duplicate')}
            </Button>
          </div>
        </Card>

        <Card title={t('ts.danger')} className="border-destructive/40">
          <Toggle checked={trip.locked} onChange={(v) => set((d) => (d.locked = v))} label={t('ts.lock')} />
          <Button
            variant="destructive"
            icon={faTrash}
            className="mt-2 w-full"
            onClick={async () => {
              if (!confirm(t('ts.delete_confirm', { name: trip.name }))) return;
              await deleteTrip(trip.id);
              nav('/');
            }}
          >
            {t('ts.delete_trip')}
          </Button>
        </Card>
      </div>
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
    <Card title={t('ts.exchanges')} description={t('ts.exchanges_hint')}>
      {trip.exchanges.length > 0 && (
        <ul className="mb-4 divide-y rounded-lg border">
          {trip.exchanges.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-12 text-xs tabular-nums text-muted-foreground">{e.date.slice(5)}</span>
              <Money minor={e.fromAmount} currency={e.fromCurrency} />
              <Icon icon={faArrowRight} className="text-xs text-muted-foreground" />
              <Money minor={e.toAmount} currency={e.toCurrency} className="flex-1 font-medium" />
              {!ro && (
                <Button variant="ghost" size="icon-sm" onClick={() => updateTrip(trip.id, (d) => removeFrom(d, d.exchanges, e.id))} aria-label={t('delete')}>
                  <Icon icon={faXmark} className="text-xs" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!ro && (
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_6rem] gap-2 sm:grid-cols-[1fr_6rem_auto_1fr_6rem] sm:items-end">
            <Field label={t('ts.gave')}>
              <AmountInput value={x.fromAmount} currency={x.fromCurrency} onChange={(fromAmount) => setX({ ...x, fromAmount })} />
            </Field>
            <Select value={x.fromCurrency} onChange={(e) => setX({ ...x, fromCurrency: e.target.value })} className="self-end">
              {curs.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Icon icon={faArrowRight} className="hidden pb-3 text-xs text-muted-foreground sm:block" />
            <Field label={t('ts.got')}>
              <AmountInput value={x.toAmount} currency={x.toCurrency} onChange={(toAmount) => setX({ ...x, toAmount })} />
            </Field>
            <Select value={x.toCurrency} onChange={(e) => setX({ ...x, toCurrency: e.target.value })} className="self-end">
              {curs.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Input type="date" value={x.date} onChange={(e) => setX({ ...x, date: e.target.value })} className="flex-1" />
            <Button
              variant="outline"
              icon={faPlus}
              disabled={!x.fromAmount || !x.toAmount || x.fromCurrency === x.toCurrency}
              onClick={async () => {
                await updateTrip(trip.id, (d) => d.exchanges.push({ ...x, updatedAt: Date.now() }));
                setX(blank());
              }}
            >
              {t('ts.add_exchange')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
