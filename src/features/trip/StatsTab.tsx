import { faChartSimple } from '@fortawesome/free-solid-svg-icons';
import { useMemo } from 'react';
import { CategoryIcon } from '../../components/icons';
import { Card, Empty, Money } from '../../components/ui';
import { computeBalances } from '../../domain/balances';
import { formatMoney } from '../../domain/money';
import type { Trip } from '../../domain/types';
import { useLocale, useT, type DictKey } from '../../i18n';

interface Row {
  key: string;
  label: string;
  value: number;
  category?: string;
}

/** Single-series ranked bar list: one hue, value labels in text ink, hover title for exact value. */
function BarList({ rows, currency }: { rows: Row[]; currency: string }) {
  const locale = useLocale();
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${formatMoney(r.value, currency, locale)}`} className="flex items-center gap-3">
          {r.category && <CategoryIcon id={r.category} income={r.category === 'income'} className="h-7 w-7" />}
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex justify-between gap-2 text-sm">
              <span className="truncate">{r.label}</span>
              <Money minor={r.value} currency={currency} className="font-medium" />
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(Math.max(0, r.value) / max) * 100}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StatsTab({ trip }: { trip: Trip }) {
  const t = useT();
  const locale = useLocale();
  const r = useMemo(() => computeBalances(trip), [trip]);
  const cur = trip.baseCurrency;

  const { byCat, byPerson, byPayer, byDay } = useMemo(() => {
    const cat = new Map<string, number>();
    const day = new Map<string, number>();
    for (const eb of r.expenses) {
      if (eb.missingRate) continue;
      const k = eb.expense.kind === 'income' ? 'income' : eb.expense.category;
      cat.set(k, (cat.get(k) ?? 0) + eb.total);
      day.set(eb.expense.date, (day.get(eb.expense.date) ?? 0) + eb.total);
    }
    const people = trip.members.filter((m) => m.kind !== 'pot');
    return {
      byCat: [...cat]
        .map(([k, v]) => ({ key: k, category: k, label: k === 'income' ? t('exp.kind_income') : t(`cat.${k}` as DictKey), value: v }))
        .sort((a, b) => b.value - a.value),
      byPerson: people.map((m) => ({ key: m.id, label: m.name, value: r.members.get(m.id)?.consumed ?? 0 })).sort((a, b) => b.value - a.value),
      byPayer: trip.members
        .map((m) => ({ key: m.id, label: m.name, value: r.members.get(m.id)?.paid ?? 0 }))
        .filter((x) => x.value)
        .sort((a, b) => b.value - a.value),
      byDay: [...day]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, v]) => ({ key: d, label: new Date(d + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'numeric' }), value: v })),
    };
  }, [r, trip.members, t, locale]);

  if (r.totalSpent === 0) return <Empty icon={faChartSimple} title={t('stats.empty')} />;
  const n = trip.members.filter((m) => m.kind !== 'pot').length || 1;
  const days = byDay.length || 1;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={t('exp.total_spent')} minor={r.totalSpent} cur={cur} />
        <Kpi label={t('stats.avg')} minor={Math.round(r.totalSpent / n)} cur={cur} />
        <Kpi label={t('stats.daily_avg')} minor={Math.round(r.totalSpent / days)} cur={cur} />
        <Card>
          <p className="text-sm font-medium text-muted-foreground">{t('tab.expenses')}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{trip.expenses.length}</p>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('stats.by_category')}>
          <BarList rows={byCat} currency={cur} />
        </Card>
        <Card title={t('stats.by_day')}>
          <BarList rows={byDay} currency={cur} />
        </Card>
        <Card title={t('stats.by_person')}>
          <BarList rows={byPerson} currency={cur} />
        </Card>
        <Card title={t('stats.by_payer')}>
          <BarList rows={byPayer} currency={cur} />
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, minor, cur }: { label: string; minor: number; cur: string }) {
  return (
    <Card>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">
        <Money minor={minor} currency={cur} />
      </p>
    </Card>
  );
}
