import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconLink, Page, TopBar } from '../components/layout';
import { Button, Card, Empty, Field, Input, Select, Sheet, toast } from '../components/ui';
import { computeBalances } from '../domain/balances';
import { COMMON_CURRENCIES, newMember, newTrip, uid } from '../domain/trip';
import { useT } from '../i18n';
import { db, saveTrip, useTrips } from '../services/db';
import { parseTrip } from '../services/share';
import { Money } from '../components/ui';

export function TripsPage() {
  const t = useT();
  const trips = useTrips();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  return (
    <Page>
      <TopBar
        title={<span>💸 {t('app.name')}</span>}
        subtitle={t('app.tagline')}
        right={
          <IconLink to="/settings" label={t('settings.title')}>
            ⚙️
          </IconLink>
        }
      />
      {trips === undefined ? null : trips.length === 0 ? (
        <Empty
          icon="🧳"
          title={t('trips.empty')}
          hint={t('trips.empty_hint')}
          action={
            <Button variant="primary" onClick={() => setOpen(true)}>
              + {t('trips.new')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {trips.map((tr) => {
            const r = computeBalances(tr);
            return (
              <Link key={tr.id} to={`/trip/${tr.id}`} className="block">
                <Card className="transition hover:ring-teal-400">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{tr.emoji || '🏝️'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {tr.name} {tr.locked && <span className="ml-1 text-xs text-slate-500">🔒 {t('trips.locked')}</span>}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t('trips.members_count', { n: tr.members.filter((m) => m.kind !== 'pot').length })} · {t('trips.expenses_count', { n: tr.expenses.length })}
                      </p>
                    </div>
                    <Money minor={r.totalSpent} currency={tr.baseCurrency} className="font-semibold text-teal-700 dark:text-teal-400" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {trips && trips.length > 0 && (
          <Button variant="primary" onClick={() => setOpen(true)}>
            + {t('trips.new')}
          </Button>
        )}
        <Button onClick={() => fileRef.current?.click()}>📥 {t('trips.import_file')}</Button>
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
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" onClick={create}>
            {t('trips.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
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
      </div>
    </Sheet>
  );
}
