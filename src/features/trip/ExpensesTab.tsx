import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Chip, Empty, Input, Money, Select } from '../../components/ui';
import { computeBalances } from '../../domain/balances';
import { CATEGORIES, categoryEmoji, memberName } from '../../domain/trip';
import type { Trip } from '../../domain/types';
import { validateExpense } from '../../domain/validate';
import { useLocale, useT, type DictKey } from '../../i18n';

export function ExpensesTab({ trip }: { trip: Trip }) {
  const t = useT();
  const locale = useLocale();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [cat, setCat] = useState('');
  const result = useMemo(() => computeBalances(trip), [trip]);
  const byId = useMemo(() => new Map(result.expenses.map((e) => [e.expense.id, e])), [result]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return [...trip.expenses]
      .filter((e) => !cat || e.category === cat)
      .filter((e) => !who || e.payers.some((p) => p.memberId === who) || byId.get(e.id)?.shares.has(who))
      .filter((e) => !ql || e.title.toLowerCase().includes(ql) || (e.note ?? '').toLowerCase().includes(ql))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [trip.expenses, q, who, cat, byId]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    list.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return [...m];
  }, [list]);

  const people = trip.members.filter((m) => m.kind !== 'pot');
  if (people.length === 0)
    return (
      <Empty
        icon="👥"
        title={t('exp.need_members')}
        action={
          <Button variant="primary" onClick={() => nav(`/trip/${trip.id}?tab=members`)}>
            {t('exp.go_members')}
          </Button>
        }
      />
    );

  const filteredTotal = list.reduce((a, e) => a + (byId.get(e.id)?.total ?? 0), 0);
  const whoShare = who ? list.reduce((a, e) => a + (byId.get(e.id)?.shares.get(who) ?? 0), 0) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('exp.total_spent')}</p>
            <Money minor={filteredTotal} currency={trip.baseCurrency} className="text-2xl font-bold" />
            {who && (
              <p className="text-sm text-slate-500">
                {memberName(trip, who)}: <Money minor={whoShare} currency={trip.baseCurrency} className="font-medium text-slate-700 dark:text-slate-200" />
              </p>
            )}
          </div>
          {!trip.locked && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => nav(`/trip/${trip.id}/expense/new?scan=1`)}>📷 {t('exp.scan')}</Button>
              <Button variant="primary" onClick={() => nav(`/trip/${trip.id}/expense/new`)}>
                + {t('exp.new')}
              </Button>
            </div>
          )}
        </div>
        {result.missing.length > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            ⚠️ {t('bal.missing_rate', { n: result.missing.length })}{' '}
            <Link to={`/trip/${trip.id}?tab=settings`} className="underline">
              {t('ts.fetch_rates')}
            </Link>
          </p>
        )}
      </Card>

      {trip.expenses.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} />
          <Select value={who} onChange={(e) => setWho(e.target.value)} aria-label={t('exp.filter_member')}>
            <option value="">👤 {t('exp.filter_member')}</option>
            {people.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('exp.filter_category')}>
            <option value="">🏷️ {t('exp.filter_category')}</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {t(`cat.${c.id}` as DictKey)}
              </option>
            ))}
          </Select>
        </div>
      )}

      {trip.expenses.length === 0 ? (
        <Empty icon="🧾" title={t('exp.empty')} hint={t('exp.empty_hint')} />
      ) : (
        groups.map(([date, items]) => (
          <div key={date}>
            <h4 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {new Date(date + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </h4>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-700/60 dark:bg-slate-800/60 dark:ring-slate-700">
              {items.map((e) => {
                const eb = byId.get(e.id);
                const issues = validateExpense(trip, e);
                const payerLabel =
                  e.payers.length === 1
                    ? t(e.kind === 'income' ? 'exp.received_by_short' : 'exp.paid_by_short', { name: memberName(trip, e.payers[0].memberId) })
                    : t('exp.payers_n', { n: e.payers.length });
                return (
                  <Link key={e.id} to={`/trip/${trip.id}/expense/${e.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <span className="text-2xl">{e.kind === 'income' ? '💰' : categoryEmoji(e.category)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {e.title || t(`cat.${e.category}` as DictKey)}
                        {e.receiptImageId && <span className="ml-1 text-xs">📎</span>}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {payerLabel} · {t('exp.n_people', { n: eb?.shares.size ?? 0 })}
                        {issues.some((i) => i.severity === 'error' || i.code === 'missing_rate') && <span className="ml-1 text-amber-600">⚠️</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <Money
                        minor={e.kind === 'income' ? -e.amount : e.amount}
                        currency={e.currency}
                        className={e.kind === 'income' ? 'font-semibold text-emerald-600' : 'font-semibold'}
                      />
                      {e.currency !== trip.baseCurrency && eb && !eb.missingRate && (
                        <p className="text-xs text-slate-500">
                          ≈ <Money minor={eb.total} currency={trip.baseCurrency} />
                        </p>
                      )}
                      {who && eb?.shares.has(who) && (
                        <p className="text-xs text-teal-700 dark:text-teal-400">
                          <Money minor={eb.shares.get(who) ?? 0} currency={trip.baseCurrency} />
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))
      )}
      {(q || who || cat) && (
        <div className="flex justify-center">
          <Chip
            onClick={() => {
              setQ('');
              setWho('');
              setCat('');
            }}
          >
            ✕ {t('all')}
          </Chip>
        </div>
      )}
    </div>
  );
}
