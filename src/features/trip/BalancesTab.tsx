import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Card, cx, Money } from '../../components/ui';
import { computeBalances, transferInBase } from '../../domain/balances';
import { categoryEmoji, memberName } from '../../domain/trip';
import type { Trip } from '../../domain/types';
import { useT, type DictKey } from '../../i18n';

export function BalancesTab({ trip }: { trip: Trip }) {
  const t = useT();
  const r = useMemo(() => computeBalances(trip), [trip]);
  const [open, setOpen] = useState<string | null>(null);
  const cur = trip.baseCurrency;
  const maxAbs = Math.max(1, ...[...r.members.values()].map((b) => Math.abs(b.net)));

  return (
    <div className="space-y-3">
      <p className="px-1 text-xs text-slate-500 dark:text-slate-400">{t('bal.hint')}</p>
      {r.missing.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">⚠️ {t('bal.missing_rate', { n: r.missing.length })}</p>
      )}
      {trip.members.map((m) => {
        const b = r.members.get(m.id)!;
        const isOpen = open === m.id;
        const transfers = b.sent - b.received;
        return (
          <Card key={m.id} className="!p-0">
            <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(isOpen ? null : m.id)}>
              <Avatar name={m.name} id={m.id} kind={m.kind} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.name}</p>
                <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className={cx('h-1.5 rounded-full', b.net >= 0 ? 'bg-emerald-500' : 'bg-rose-500')}
                    style={{ width: `${(Math.abs(b.net) / maxAbs) * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <Money
                  minor={b.net}
                  currency={cur}
                  signed
                  className={cx('font-bold', b.net > 0 ? 'text-emerald-600' : b.net < 0 ? 'text-rose-600' : 'text-slate-500')}
                />
                <p className="text-xs text-slate-500">{b.net > 0 ? t('bal.gets') : b.net < 0 ? t('bal.owes') : t('bal.even')}</p>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm dark:border-slate-700">
                <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <Stat label={t('bal.paid')} minor={b.paid} cur={cur} />
                  <Stat label={t('bal.consumed')} minor={b.consumed} cur={cur} />
                  <Stat label={t('bal.transfers')} minor={transfers} cur={cur} signed />
                </div>
                <ul className="space-y-1">
                  {r.expenses
                    .filter((eb) => eb.paid.has(m.id) || eb.shares.has(m.id))
                    .sort((a, b2) => a.expense.date.localeCompare(b2.expense.date))
                    .map((eb) => (
                      <li key={eb.expense.id}>
                        <Link to={`/trip/${trip.id}/expense/${eb.expense.id}`} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                          <span>{eb.expense.kind === 'income' ? '💰' : categoryEmoji(eb.expense.category)}</span>
                          <span className="min-w-0 flex-1 truncate">{eb.expense.title || t(`cat.${eb.expense.category}` as DictKey)}</span>
                          {eb.paid.has(m.id) && (
                            <span className="text-xs text-emerald-600">
                              ↑<Money minor={eb.paid.get(m.id)!} currency={cur} />
                            </span>
                          )}
                          {eb.shares.has(m.id) && (
                            <span className="text-xs text-rose-600">
                              ↓<Money minor={eb.shares.get(m.id)!} currency={cur} />
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  {trip.transfers
                    .filter((x) => x.from === m.id || x.to === m.id)
                    .map((x) => {
                      const v = transferInBase(trip, x) ?? 0;
                      return (
                        <li key={x.id} className="flex items-center gap-2 px-1 py-1">
                          <span>🔁</span>
                          <span className="min-w-0 flex-1 truncate">
                            {memberName(trip, x.from)} → {memberName(trip, x.to)}
                          </span>
                          <Money minor={x.from === m.id ? v : -v} currency={cur} signed className="text-xs" />
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Stat({ label, minor, cur, signed }: { label: string; minor: number; cur: string; signed?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/50">
      <p className="text-xs text-slate-500">{label}</p>
      <Money minor={minor} currency={cur} signed={signed} className="text-sm font-semibold" />
    </div>
  );
}
