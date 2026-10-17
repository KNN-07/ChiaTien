import { faArrowRightArrowLeft, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CategoryIcon, Icon } from '../../components/icons';
import { Alert, Avatar, Badge, cn, Money } from '../../components/ui';
import { computeBalances, transferInBase } from '../../domain/balances';
import { memberName } from '../../domain/trip';
import type { Trip } from '../../domain/types';
import { useT, type DictKey } from '../../i18n';

export function BalancesTab({ trip }: { trip: Trip }) {
  const t = useT();
  const r = useMemo(() => computeBalances(trip), [trip]);
  const [open, setOpen] = useState<string | null>(null);
  const cur = trip.baseCurrency;
  const maxAbs = Math.max(1, ...[...r.members.values()].map((b) => Math.abs(b.net)));

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t('bal.hint')}</p>
      {r.missing.length > 0 && <Alert variant="warning">{t('bal.missing_rate', { n: r.missing.length })}</Alert>}
      <div className="grid items-start gap-4 md:grid-cols-2">
        {trip.members.map((m) => {
          const b = r.members.get(m.id)!;
          const isOpen = open === m.id;
          const transfers = b.sent - b.received;
          return (
            <section key={m.id} className="rounded-xl border bg-card shadow-sm">
              <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(isOpen ? null : m.id)} aria-expanded={isOpen}>
                <Avatar name={m.name} kind={m.kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', b.net >= 0 ? 'bg-positive' : 'bg-negative')} style={{ width: `${(Math.abs(b.net) / maxAbs) * 100}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <Money minor={b.net} currency={cur} signed className={cn('font-semibold', b.net > 0 ? 'text-positive' : b.net < 0 ? 'text-negative' : 'text-muted-foreground')} />
                  <div className="mt-1">
                    <Badge variant={b.net > 0 ? 'success' : b.net < 0 ? 'destructive' : 'secondary'}>{b.net > 0 ? t('bal.gets') : b.net < 0 ? t('bal.owes') : t('bal.even')}</Badge>
                  </div>
                </div>
                <Icon icon={faChevronDown} className={cn('text-xs text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="border-t px-4 pb-4 pt-3 text-sm">
                  <dl className="mb-3 grid grid-cols-3 gap-2">
                    <Stat label={t('bal.paid')} minor={b.paid} cur={cur} />
                    <Stat label={t('bal.consumed')} minor={b.consumed} cur={cur} />
                    <Stat label={t('bal.transfers')} minor={transfers} cur={cur} signed />
                  </dl>
                  <ul className="grid gap-0.5">
                    {r.expenses
                      .filter((eb) => eb.paid.has(m.id) || eb.shares.has(m.id))
                      .sort((a, b2) => a.expense.date.localeCompare(b2.expense.date))
                      .map((eb) => (
                        <li key={eb.expense.id}>
                          <Link to={`/trip/${trip.id}/expense/${eb.expense.id}`} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-muted/60">
                            <CategoryIcon id={eb.expense.category} income={eb.expense.kind === 'income'} className="h-7 w-7" />
                            <span className="min-w-0 flex-1 truncate">{eb.expense.title || t(`cat.${eb.expense.category}` as DictKey)}</span>
                            {eb.paid.has(m.id) && (
                              <span className="text-xs text-positive">
                                +<Money minor={eb.paid.get(m.id)!} currency={cur} />
                              </span>
                            )}
                            {eb.shares.has(m.id) && (
                              <span className="text-xs text-negative">
                                −<Money minor={eb.shares.get(m.id)!} currency={cur} />
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
                          <li key={x.id} className="flex items-center gap-2.5 px-1.5 py-1.5">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                              <Icon icon={faArrowRightArrowLeft} className="text-xs" />
                            </span>
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
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, minor, cur, signed }: { label: string; minor: number; cur: string; signed?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>
        <Money minor={minor} currency={cur} signed={signed} className="text-sm font-semibold" />
      </dd>
    </div>
  );
}
