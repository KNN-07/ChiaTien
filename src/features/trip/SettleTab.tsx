import { faArrowRight, faCheck, faCircleCheck, faCopy, faPlus, faQrcode } from '@fortawesome/free-solid-svg-icons';
import { useMemo, useState } from 'react';
import { Icon } from '../../components/icons';
import { Alert, AmountInput, Avatar, Button, Card, cn, Field, Input, Money, Select, Separator, Sheet, Toggle, toast } from '../../components/ui';
import { computeBalances, entityName, transferInBase } from '../../domain/balances';
import { currencyDigits, formatMoney } from '../../domain/money';
import { planSettlement, type Settlement } from '../../domain/settle';
import { memberName, today, uid } from '../../domain/trip';
import type { BankInfo, ID, Transfer, Trip } from '../../domain/types';
import { useLocale, useT } from '../../i18n';
import { removeFrom, updateTrip, upsert } from '../../services/db';
import { copyText } from '../../services/share';
import { bankName, vietQrUrl } from '../../services/vietqr';

function roundOptions(cur: string): number[] {
  const d = currencyDigits(cur);
  if (d === 0) return [0, 100, 1000, 5000, 10000];
  return [0, 10 ** d, 10 * 10 ** d];
}

/** Bank of the entity (member, or any member of a household that has one). */
function entityBank(trip: Trip, entity: ID): BankInfo | undefined {
  if (entity.startsWith('hh:')) {
    const hh = trip.households.find((h) => `hh:${h.id}` === entity);
    return hh?.memberIds.map((id) => trip.members.find((m) => m.id === id)?.bank).find(Boolean);
  }
  return trip.members.find((m) => m.id === entity)?.bank;
}

/** A household payment is recorded between its first members. */
function entityMember(trip: Trip, entity: ID): ID {
  if (!entity.startsWith('hh:')) return entity;
  return trip.households.find((h) => `hh:${h.id}` === entity)?.memberIds[0] ?? entity;
}

export function SettleTab({ trip }: { trip: Trip }) {
  const t = useT();
  const locale = useLocale();
  const ro = trip.locked;
  const result = useMemo(() => computeBalances(trip), [trip]);
  const plan = useMemo(() => planSettlement(trip, result), [trip, result]);
  const [qr, setQr] = useState<Settlement | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const s = trip.settings;
  const setS = (p: Partial<Trip['settings']>) => updateTrip(trip.id, (d) => (d.settings = { ...d.settings, ...p }));
  const fmt = (m: number, c: string) => formatMoney(m, c, locale);

  const markPaid = (x: Settlement) =>
    updateTrip(trip.id, (d) =>
      d.transfers.push({
        id: uid(),
        from: entityMember(trip, x.from),
        to: entityMember(trip, x.to),
        amount: x.amount,
        currency: x.currency,
        date: today(),
        // Freeze the rate used for the suggestion so the payment cancels the debt exactly.
        fxRate: x.currency !== trip.baseCurrency ? plan.rate : undefined,
        note: t('set.mark_paid'),
        updatedAt: Date.now(),
      }),
    );

  const summary = () => {
    const lines = [t('set.summary_header', { name: trip.name }), t('set.summary_total', { x: fmt(result.totalSpent, trip.baseCurrency) }), ''];
    trip.members
      .filter((m) => m.kind !== 'pot' || result.members.get(m.id)?.net)
      .forEach((m) => {
        const b = result.members.get(m.id)!;
        lines.push(`• ${m.name}: ${t('bal.consumed')} ${fmt(b.consumed, trip.baseCurrency)}, ${t('bal.net')} ${b.net >= 0 ? '+' : '−'}${fmt(Math.abs(b.net), trip.baseCurrency)}`);
      });
    lines.push('');
    if (plan.transfers.length === 0) lines.push(t('set.summary_none'));
    else {
      lines.push(t('set.summary_transfers'));
      plan.transfers.forEach((x) => {
        const bank = entityBank(trip, x.to);
        lines.push(`→ ${entityName(trip, x.from)} → ${entityName(trip, x.to)}: ${fmt(x.amount, x.currency)}${bank ? ` (${bankName(bank.bin)} ${bank.account}${bank.holder ? ` ${bank.holder}` : ''})` : ''}`);
      });
    }
    return lines.join('\n');
  };

  const sorted = [...trip.transfers].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
  const currencies = [...new Set([trip.baseCurrency, ...trip.currencies])];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div className="grid gap-6">
        <Card
          title={t('set.suggestions')}
          description={s.roundTo > 1 && plan.transfers.length > 0 ? t('set.rounded', { x: fmt(s.roundTo, plan.currency) }) : undefined}
          action={
            <Button size="sm" variant="outline" icon={faCopy} onClick={async () => toast((await copyText(summary())) ? t('copied') : summary())}>
              <span className="hidden sm:inline">{t('set.copy_summary')}</span>
            </Button>
          }
        >
          {!plan.rate ? (
            <Alert variant="warning">{t('set.no_rate', { cur: plan.currency })}</Alert>
          ) : plan.transfers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Icon icon={faCircleCheck} className="text-2xl text-positive" />
              {t('set.all_settled')}
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {plan.transfers.map((x, i) => {
                const bank = entityBank(trip, x.to);
                return (
                  <li key={i} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                    <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                      <Avatar name={entityName(trip, x.from)} className="h-7 w-7 text-[10px]" />
                      <span className="truncate font-medium">{entityName(trip, x.from)}</span>
                      <Icon icon={faArrowRight} className="text-xs text-muted-foreground" />
                      <Avatar name={entityName(trip, x.to)} className="h-7 w-7 text-[10px]" />
                      <span className="truncate font-medium">{entityName(trip, x.to)}</span>
                    </div>
                    <Money minor={x.amount} currency={x.currency} className="font-semibold" />
                    <div className="flex gap-2">
                      {bank && x.currency === 'VND' && (
                        <Button size="sm" variant="outline" icon={faQrcode} onClick={() => setQr(x)}>
                          {t('set.qr')}
                        </Button>
                      )}
                      {!ro && (
                        <Button size="sm" icon={faCheck} onClick={() => markPaid(x)}>
                          {t('set.mark_paid')}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title={t('set.history')}
          action={
            !ro && (
              <Button
                size="sm"
                variant="outline"
                icon={faPlus}
                onClick={() =>
                  setTransfer({
                    id: uid(),
                    from: trip.members[0]?.id ?? '',
                    to: trip.members[1]?.id ?? '',
                    amount: 0,
                    currency: trip.settings.settleCurrency || trip.baseCurrency,
                    date: today(),
                    updatedAt: 0,
                  })
                }
              >
                {t('set.record_transfer')}
              </Button>
            )
          }
        >
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ul className="-mx-2 grid">
              {sorted.map((x) => (
                <li key={x.id}>
                  <button disabled={ro} onClick={() => setTransfer(x)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60">
                    <span className="w-12 text-xs tabular-nums text-muted-foreground">{x.date.slice(5)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {memberName(trip, x.from)} → {memberName(trip, x.to)}
                      {x.note && <span className="text-muted-foreground"> · {x.note}</span>}
                    </span>
                    <Money minor={x.amount} currency={x.currency} className="font-medium" />
                    {x.currency !== trip.baseCurrency && (
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        ≈ <Money minor={transferInBase(trip, x) ?? 0} currency={trip.baseCurrency} />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={t('set.options')} className="xl:sticky xl:top-20">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('set.currency')}>
            <Select
              disabled={ro}
              value={s.settleCurrency}
              onChange={(e) => setS({ settleCurrency: e.target.value, roundTo: roundOptions(e.target.value)[e.target.value === 'VND' ? 2 : 0] })}
            >
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('set.round_to')}>
            <Select disabled={ro} value={s.roundTo} onChange={(e) => setS({ roundTo: Number(e.target.value) })}>
              {roundOptions(s.settleCurrency).map((r) => (
                <option key={r} value={r}>
                  {r ? fmt(r, s.settleCurrency) : t('set.round_none')}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Separator className="mt-4" />
        <div className="divide-y">
          <Toggle disabled={ro} checked={s.simplify} onChange={(v) => setS({ simplify: v })} label={t('set.simplify')} hint={t('set.simplify_hint')} />
          <Toggle
            disabled={ro || trip.households.length === 0}
            checked={s.useHouseholds}
            onChange={(v) => setS({ useHouseholds: v })}
            label={t('set.households')}
            hint={trip.households.length === 0 ? t('mem.households_hint') : undefined}
          />
          <Toggle disabled={ro} checked={s.guestToHost} onChange={(v) => setS({ guestToHost: v })} label={t('set.guest_host')} />
        </div>
      </Card>

      {qr && <QrSheet trip={trip} s={qr} onClose={() => setQr(null)} />}
      {transfer && <TransferSheet trip={trip} value={transfer} onClose={() => setTransfer(null)} />}
    </div>
  );
}

function QrSheet({ trip, s, onClose }: { trip: Trip; s: Settlement; onClose: () => void }) {
  const t = useT();
  const bank = entityBank(trip, s.to)!;
  const info = `${t('set.qr_content', { trip: trip.name })} ${entityName(trip, s.from)}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd');
  return (
    <Sheet open onClose={onClose} title={`${entityName(trip, s.from)} → ${entityName(trip, s.to)}`} description={t('set.qr_hint')}>
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        <img src={vietQrUrl(bank, s.amount, info)} alt="VietQR" className="w-64 max-w-full rounded-lg border bg-white p-2" />
        <Money minor={s.amount} currency={s.currency} className="text-2xl font-bold tracking-tight" />
        <p className="text-sm text-muted-foreground">
          {bankName(bank.bin)} · {bank.account} {bank.holder && `· ${bank.holder}`}
        </p>
      </div>
    </Sheet>
  );
}

export function TransferSheet({ trip, value, onClose }: { trip: Trip; value: Transfer; onClose: () => void }) {
  const t = useT();
  const [x, setX] = useState(value);
  const exists = trip.transfers.some((tr) => tr.id === x.id);
  const valid = x.from && x.to && x.from !== x.to && x.amount > 0;
  const save = async () => {
    await updateTrip(trip.id, (d) => upsert(d.transfers, x));
    onClose();
  };
  const del = async () => {
    await updateTrip(trip.id, (d) => removeFrom(d, d.transfers, x.id));
    onClose();
  };
  const currencies = [...new Set([trip.baseCurrency, ...trip.currencies])];
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('set.transfer')}
      footer={
        <>
          {exists && (
            <Button variant="ghost" className={cn('mr-auto text-negative hover:text-negative')} onClick={del}>
              {t('delete')}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button disabled={!valid} onClick={save}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('set.from')}>
            <Select value={x.from} onChange={(e) => setX({ ...x, from: e.target.value })}>
              {trip.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('set.to')}>
            <Select value={x.to} onChange={(e) => setX({ ...x, to: e.target.value })}>
              {trip.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label={t('exp.amount')}>
            <AmountInput value={x.amount} currency={x.currency} onChange={(amount) => setX({ ...x, amount })} />
          </Field>
          <Field label={t('exp.currency')}>
            <Select value={x.currency} onChange={(e) => setX({ ...x, currency: e.target.value })}>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('exp.date')}>
          <Input type="date" value={x.date} onChange={(e) => setX({ ...x, date: e.target.value })} />
        </Field>
        <Field label={t('exp.note')}>
          <Input value={x.note ?? ''} onChange={(e) => setX({ ...x, note: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}
