import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Page, TopBar } from '../components/layout';
import { Button, Card, Empty, Money } from '../components/ui';
import { computeBalances } from '../domain/balances';
import { keepLocalImages, mergeTrips } from '../domain/merge';
import { uid } from '../domain/trip';
import type { Trip } from '../domain/types';
import { useT } from '../i18n';
import { saveTrip, useTrip } from '../services/db';
import { decodeTrip } from '../services/share';

export function ImportPage() {
  const t = useT();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const incoming = useMemo<Trip | null>(() => {
    try {
      return decodeTrip(params.get('d') ?? '');
    } catch {
      return null;
    }
  }, [params]);
  const local = useTrip(incoming?.id);

  if (!incoming)
    return (
      <Page>
        <TopBar title={t('import.title')} back="/" />
        <Empty icon="🔗" title={t('import.invalid')} />
      </Page>
    );

  const total = computeBalances(incoming).totalSpent;
  const go = async (trip: Trip) => {
    setBusy(true);
    await saveTrip(trip);
    nav(`/trip/${trip.id}`, { replace: true });
  };

  return (
    <Page>
      <TopBar title={t('import.title')} back="/" />
      <Card>
        <div className="flex items-center gap-3">
          <span className="text-4xl">{incoming.emoji ?? '🏝️'}</span>
          <div className="flex-1">
            <p className="font-semibold">
              {t('import.found', { name: incoming.name, m: incoming.members.length, e: incoming.expenses.length })}
            </p>
            <Money minor={total} currency={incoming.baseCurrency} className="text-teal-700 dark:text-teal-400" />
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{incoming.members.map((m) => m.name).join(', ')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {local ? (
            <>
              <p className="w-full text-sm text-amber-700 dark:text-amber-300">{t('import.exists')}</p>
              <Button variant="primary" disabled={busy} onClick={() => go(keepLocalImages(local, mergeTrips(local, incoming)))}>
                🔀 {t('import.merge')}
              </Button>
              <Button disabled={busy} onClick={() => go(keepLocalImages(local, incoming))}>
                ♻️ {t('import.replace')}
              </Button>
              <Button disabled={busy} onClick={() => go({ ...incoming, id: uid(), tombstones: {} })}>
                ➕ {t('import.as_new')}
              </Button>
            </>
          ) : (
            local === null && (
              <Button variant="primary" disabled={busy} onClick={() => go(incoming)}>
                💾 {t('import.save')}
              </Button>
            )
          )}
        </div>
      </Card>
    </Page>
  );
}
