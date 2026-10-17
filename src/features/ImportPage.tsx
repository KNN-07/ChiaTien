import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Page, TopBar } from '../components/layout';
import { faCodeMerge, faFloppyDisk, faLinkSlash, faPlus, faRotate } from '@fortawesome/free-solid-svg-icons';
import { TripIcon } from '../components/icons';
import { Alert, Button, Card, Empty, Money, Separator } from '../components/ui';
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
      <Page wide={false}>
        <TopBar title={t('import.title')} back="/" />
        <Empty icon={faLinkSlash} title={t('import.invalid')} />
      </Page>
    );

  const total = computeBalances(incoming).totalSpent;
  const go = async (trip: Trip) => {
    setBusy(true);
    await saveTrip(trip);
    nav(`/trip/${trip.id}`, { replace: true });
  };

  return (
    <Page wide={false}>
      <TopBar title={t('import.title')} back="/" />
      <Card>
        <div className="flex items-center gap-4">
          <TripIcon icon={incoming.emoji} className="h-12 w-12 text-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold tracking-tight">{incoming.name}</p>
            <p className="text-sm text-muted-foreground">
              {t('trips.members_count', { n: incoming.members.length })} · {t('trips.expenses_count', { n: incoming.expenses.length })}
            </p>
          </div>
          <Money minor={total} currency={incoming.baseCurrency} className="text-lg font-semibold" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{incoming.members.map((m) => m.name).join(', ')}</p>
        <Separator className="my-4" />
        {local ? (
          <div className="grid gap-3">
            <Alert variant="warning">{t('import.exists')}</Alert>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} icon={faCodeMerge} onClick={() => go(keepLocalImages(local, mergeTrips(local, incoming)))}>
                {t('import.merge')}
              </Button>
              <Button variant="outline" disabled={busy} icon={faRotate} onClick={() => go(keepLocalImages(local, incoming))}>
                {t('import.replace')}
              </Button>
              <Button variant="outline" disabled={busy} icon={faPlus} onClick={() => go({ ...incoming, id: uid(), tombstones: {} })}>
                {t('import.as_new')}
              </Button>
            </div>
          </div>
        ) : (
          local === null && (
            <Button disabled={busy} icon={faFloppyDisk} onClick={() => go(incoming)}>
              {t('import.save')}
            </Button>
          )
        )}
      </Card>
    </Page>
  );
}
