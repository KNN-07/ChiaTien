import { faCamera, faMagnifyingGlass, faPaperclip, faPlus, faReceipt, faTriangleExclamation, faUserPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CategoryIcon, Icon } from '../../components/icons';
import { Alert, Avatar, Button, Card, cn, Empty, Input, Money, SectionLabel, Select } from '../../components/ui';
import { computeBalances } from '../../domain/balances';
import { CATEGORIES, memberName } from '../../domain/trip';
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
        icon={faUserPlus}
        title={t('exp.need_members')}
        action={
          <Button icon={faUserPlus} onClick={() => nav(`/trip/${trip.id}?tab=members`)}>
            {t('exp.go_members')}
          </Button>
        }
      />
    );

  const filtered = !!(q || who || cat);
  const filteredTotal = list.reduce((a, e) => a + (byId.get(e.id)?.total ?? 0), 0);
  const whoShare = who ? list.reduce((a, e) => a + (byId.get(e.id)?.shares.get(who) ?? 0), 0) : 0;
  const n = people.length || 1;

  const summary = (
    <div className="grid gap-4">
      <Card>
        <p className="text-sm font-medium text-muted-foreground">{filtered ? t('total') : t('exp.total_spent')}</p>
        <Money minor={filteredTotal} currency={trip.baseCurrency} className="mt-1 block text-3xl font-bold tracking-tight" />
        <p className="mt-1 text-xs text-muted-foreground">
          {t('stats.avg')}: <Money minor={Math.round(result.totalSpent / n)} currency={trip.baseCurrency} />
        </p>
        {who && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
            <span>{memberName(trip, who)}</span>
            <Money minor={whoShare} currency={trip.baseCurrency} className="font-semibold" />
          </div>
        )}
        {!trip.locked && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="outline" icon={faCamera} onClick={() => nav(`/trip/${trip.id}/expense/new?scan=1`)}>
              {t('exp.scan')}
            </Button>
            <Button icon={faPlus} onClick={() => nav(`/trip/${trip.id}/expense/new`)}>
              {t('exp.new')}
            </Button>
          </div>
        )}
      </Card>
      {result.missing.length > 0 && (
        <Alert variant="warning">
          {t('bal.missing_rate', { n: result.missing.length })} <Link to={`/trip/${trip.id}?tab=settings`}>{t('ts.fetch_rates')}</Link>
        </Alert>
      )}
      <Card title={t('tab.balances')} className="hidden xl:block" contentClassName="pt-3">
        <ul className="grid gap-2.5">
          {trip.members.map((m) => {
            const b = result.members.get(m.id)!;
            return (
              <li key={m.id} className="flex items-center gap-2.5 text-sm">
                <Avatar name={m.name} kind={m.kind} size="sm" className="h-7 w-7 text-[10px]" />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <Money minor={b.net} currency={trip.baseCurrency} signed className={cn('font-medium', b.net > 0 ? 'text-positive' : b.net < 0 ? 'text-negative' : 'text-muted-foreground')} />
              </li>
            );
          })}
        </ul>
        <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => nav(`/trip/${trip.id}?tab=settle`)}>
          {t('set.suggestions')}
        </Button>
      </Card>
    </div>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div className="xl:order-2 xl:sticky xl:top-20">{summary}</div>

      <div className="grid min-w-0 gap-5 xl:order-1">
        {trip.expenses.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_11rem]">
            <div className="relative col-span-2 sm:col-span-1">
              <Icon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="pl-8" />
            </div>
            <Select value={who} onChange={(e) => setWho(e.target.value)} aria-label={t('exp.filter_member')}>
              <option value="">{t('exp.filter_member')}</option>
              {people.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
            <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('exp.filter_category')}>
              <option value="">{t('exp.filter_category')}</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {t(`cat.${c.id}` as DictKey)}
                </option>
              ))}
            </Select>
          </div>
        )}
        {filtered && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              icon={faXmark}
              onClick={() => {
                setQ('');
                setWho('');
                setCat('');
              }}
            >
              {t('all')}
            </Button>
          </div>
        )}

        {trip.expenses.length === 0 ? (
          <Empty icon={faReceipt} title={t('exp.empty')} hint={t('exp.empty_hint')} />
        ) : (
          groups.map(([date, items]) => (
            <div key={date} className="grid gap-2">
              <SectionLabel>{new Date(date + 'T00:00:00').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</SectionLabel>
              <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                {items.map((e, i) => {
                  const eb = byId.get(e.id);
                  const issues = validateExpense(trip, e);
                  const warn = issues.some((x) => x.severity === 'error' || x.code === 'missing_rate');
                  const payerLabel =
                    e.payers.length === 1
                      ? t(e.kind === 'income' ? 'exp.received_by_short' : 'exp.paid_by_short', { name: memberName(trip, e.payers[0].memberId) })
                      : t('exp.payers_n', { n: e.payers.length });
                  return (
                    <Link key={e.id} to={`/trip/${trip.id}/expense/${e.id}`} className={cn('flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50', i > 0 && 'border-t')}>
                      <CategoryIcon id={e.category} income={e.kind === 'income'} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {e.title || t(`cat.${e.category}` as DictKey)}
                          {e.receiptImageId && <Icon icon={faPaperclip} className="text-[10px] text-muted-foreground" />}
                          {warn && <Icon icon={faTriangleExclamation} className="text-[11px] text-warning" />}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {payerLabel} · {t('exp.n_people', { n: eb?.shares.size ?? 0 })}
                        </p>
                      </div>
                      <div className="text-right">
                        <Money
                          minor={e.kind === 'income' ? -e.amount : e.amount}
                          currency={e.currency}
                          className={cn('text-sm font-semibold', e.kind === 'income' && 'text-positive')}
                        />
                        {e.currency !== trip.baseCurrency && eb && !eb.missingRate && (
                          <p className="text-xs text-muted-foreground">
                            ≈ <Money minor={eb.total} currency={trip.baseCurrency} />
                          </p>
                        )}
                        {who && eb?.shares.has(who) && (
                          <p className="text-xs text-muted-foreground">
                            {memberName(trip, who)}: <Money minor={eb.shares.get(who) ?? 0} currency={trip.baseCurrency} />
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
      </div>
    </div>
  );
}
