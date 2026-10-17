import { faCalendarDays, faFileImport, faGear, faLock, faPlus, faSuitcaseRolling, faUsers, faWallet, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, TripIcon } from '../components/icons';
import { IconLink, Page, TopBar } from '../components/layout';
import { Badge, Button, Empty, Field, Input, Money, Select, Sheet, toast } from '../components/ui';
import { computeBalances } from '../domain/balances';
import { COMMON_CURRENCIES, newMember, newTrip, uid } from '../domain/trip';
import { useLocale, useT } from '../i18n';
import { db, saveTrip, useTrips } from '../services/db';
import { parseTrip } from '../services/share';

export function TripsPage() {
  const t = useT();
  const locale = useLocale();
  const trips = useTrips();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sidebar "+" links here with ?new=1.
  useEffect(() => {
    if (params.get('new')) {
      setOpen(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      const list = Array.isArray(data) ? data : Array.isArray(data?.trips) ? data.trips : [data];
      const parsed = list.map(parseTrip);
      for (const tr of parsed) {
        const existing = await db.trips.get(tr.id);
        await saveTrip(existing ? { ...tr, id: uid() } : tr);
      }
      toast(t('settings.imported', { n: parsed.length }));
    } catch {
      toast(t('import.invalid'));
    }
  };

  const fmtDate = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '');

  return (
    <Page>
      <TopBar
        mobileOnly
        title={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Icon icon={faWallet} className="text-xs" />
            </span>
            {t('app.name')}
          </span>
        }
        right={
          <>
            <IconLink mobileOnly to="/assistant" icon={faWandMagicSparkles} label={t('ai.open')} />
            <IconLink mobileOnly to="/settings" icon={faGear} label={t('settings.title')} />
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:pt-8">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold tracking-tight lg:text-3xl">{t('trips.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('app.tagline')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={faFileImport} onClick={() => fileRef.current?.click()}>
            <span className="hidden sm:inline">{t('trips.import_file')}</span>
          </Button>
          <Button icon={faPlus} onClick={() => setOpen(true)}>
            {t('trips.new')}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {trips === undefined ? null : trips.length === 0 ? (
        <Empty
          icon={faSuitcaseRolling}
          title={t('trips.empty')}
          hint={t('trips.empty_hint')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button icon={faPlus} onClick={() => setOpen(true)}>
                {t('trips.new')}
              </Button>
              <Button variant="outline" icon={faWandMagicSparkles} onClick={() => nav('/assistant')}>
                {t('ai.open')}
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {trips.map((tr) => {
            const r = computeBalances(tr);
            const people = tr.members.filter((m) => m.kind !== 'pot');
            return (
              <Link
                key={tr.id}
                to={`/trip/${tr.id}`}
                className="group flex flex-col rounded-xl border bg-card p-5 text-card-foreground shadow-sm transition-colors hover:border-foreground/20 hover:bg-muted/30"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <TripIcon icon={tr.emoji} />
                  {tr.locked && (
                    <Badge variant="outline">
                      <Icon icon={faLock} className="text-[9px]" /> {t('trips.locked')}
                    </Badge>
                  )}
                </div>
                <p className="truncate font-semibold leading-tight">{tr.name}</p>
                <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Icon icon={faUsers} className="text-[10px]" />
                    {people.length}
                  </span>
                  {(tr.startDate || tr.endDate) && (
                    <span className="inline-flex items-center gap-1">
                      <Icon icon={faCalendarDays} className="text-[10px]" />
                      {fmtDate(tr.startDate)}
                      {tr.endDate && ` – ${fmtDate(tr.endDate)}`}
                    </span>
                  )}
                  <span>{t('trips.expenses_count', { n: tr.expenses.length })}</span>
                </p>
                <div className="mt-4 flex items-end justify-between border-t pt-4">
                  <span className="text-xs text-muted-foreground">{t('exp.total_spent')}</span>
                  <Money minor={r.totalSpent} currency={tr.baseCurrency} className="text-lg font-semibold tracking-tight" />
                </div>
              </Link>
            );
          })}
          <button
            onClick={() => setOpen(true)}
            className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Icon icon={faPlus} />
            {t('trips.new')}
          </button>
        </div>
      )}

      <NewTripSheet open={open} onClose={() => setOpen(false)} onCreated={(id) => nav(`/trip/${id}`)} />
    </Page>
  );
}

function NewTripSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [cur, setCur] = useState('VND');
  const [people, setPeople] = useState('');
  const create = async () => {
    const trip = newTrip(name.trim() || t('trips.new'), cur);
    people
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((n) => trip.members.push(newMember(n)));
    await saveTrip(trip);
    setName('');
    setPeople('');
    onClose();
    onCreated(trip.id);
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('trips.new')}
      description={t('trips.empty_hint')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={create}>{t('trips.create')}</Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Field label={t('ts.name')}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('trips.name_ph')} />
        </Field>
        <Field label={t('trips.base_currency')}>
          <Select value={cur} onChange={(e) => setCur(e.target.value)}>
            {COMMON_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('mem.members')}>
          <Input value={people} onChange={(e) => setPeople(e.target.value)} placeholder={t('trips.members_ph')} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}
