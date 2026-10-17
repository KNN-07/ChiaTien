import { useMemo } from 'react';
import { Card, Empty, Money } from '../../components/ui';
import { computeBalances } from '../../domain/balances';
import { formatMoney } from '../../domain/money';
import { categoryEmoji } from '../../domain/trip';
import type { Trip } from '../../domain/types';
import { useLocale, useT, type DictKey } from '../../i18n';

interface Row {
  key: string;
  label: string;
  value: number;
}

/** Single-series ranked bar list: one hue, value labels in text ink, hover title for exact value. */
function BarList({ rows, currency }: { rows: Row[]; currency: string }) {
  const locale = useLocale();
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${formatMoney(r.value, currency, locale)}`}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate text-slate-700 dark:text-slate-300">{r.label}</span>
            <Money minor={r.value} currency={currency} className="font-medium text-slate-900 dark:text-slate-100" />
          </div>
          <div className="h-2 w-full rounded bg-slate-100 dark:bg-slate-700/60">
            <div className="h-2 rounded bg-teal-600 dark:bg-teal-400" style={{ width: `${(Math.max(0, r.value) / max) * 100}%` }} />
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
        .map(([k, v]) => ({ key: k, label: k === 'income' ? `💰 ${t('exp.kind_income')}` : `${categoryEmoji(k)} ${t(`cat.${k}` as DictKey)}`, value: v }))
        .sort((a, b) => b.value - a.value),
      byPerson: people.map((m) => ({ key: m.id, label: m.name, value: r.members.get(m.id)?.consumed ?? 0 })).sort((a, b) => b.value - a.value),
      byPayer: trip.members.map((m) => ({ key: m.id, label: m.name, value: r.members.get(m.id)?.paid ?? 0 })).filter((x) => x.value).sort((a, b) => b.value - a.value),
      byDay: [...day]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, v]) => ({ key: d, label: new Date(d + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'numeric' }), value: v })),
    };
  }, [r, trip.members, t, locale]);

  if (r.totalSpent === 0) return <Empty icon="📊" title={t('stats.empty')} />;
  const n = trip.members.filter((m) => m.kind !== 'pot').length || 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-sm text-slate-500">{t('exp.total_spent')}</p>
          <Money minor={r.totalSpent} currency={cur} className="text-xl font-bold" />
        </Card>
        <Card>
          <p className="text-sm text-slate-500">{t('stats.avg')}</p>
          <Money minor={Math.round(r.totalSpent / n)} currency={cur} className="text-xl font-bold" />
        </Card>
      </div>
      <Card title={t('stats.by_category')}>
        <BarList rows={byCat} currency={cur} />
      </Card>
      <Card title={t('stats.by_person')}>
        <BarList rows={byPerson} currency={cur} />
      </Card>
      <Card title={t('stats.by_payer')}>
        <BarList rows={byPayer} currency={cur} />
      </Card>
      <Card title={t('stats.by_day')}>
        <BarList rows={byDay} currency={cur} />
      </Card>
    </div>
  );
}
