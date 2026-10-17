import { useSearchParams, useParams } from 'react-router-dom';
import { IconLink, Page, TopBar } from '../../components/layout';
import { cx, Empty } from '../../components/ui';
import { useT, type DictKey } from '../../i18n';
import { useTrip } from '../../services/db';
import { BalancesTab } from './BalancesTab';
import { ExpensesTab } from './ExpensesTab';
import { MembersTab } from './MembersTab';
import { SettleTab } from './SettleTab';
import { StatsTab } from './StatsTab';
import { TripSettingsTab } from './TripSettingsTab';

const TABS: { id: string; label: DictKey; icon: string }[] = [
  { id: 'expenses', label: 'tab.expenses', icon: '🧾' },
  { id: 'balances', label: 'tab.balances', icon: '⚖️' },
  { id: 'settle', label: 'tab.settle', icon: '💸' },
  { id: 'stats', label: 'tab.stats', icon: '📊' },
  { id: 'members', label: 'tab.members', icon: '👥' },
  { id: 'settings', label: 'tab.settings', icon: '⚙️' },
];

export function TripPage() {
  const t = useT();
  const { tripId } = useParams();
  const trip = useTrip(tripId);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'expenses';

  if (trip === undefined) return null;
  if (trip === null)
    return (
      <Page>
        <TopBar title={t('not_found')} back="/" />
        <Empty icon="🤷" title={t('not_found')} />
      </Page>
    );

  return (
    <Page>
      <TopBar
        back="/"
        title={
          <span>
            {trip.emoji} {trip.name}
          </span>
        }
        subtitle={trip.locked ? `🔒 ${t('trips.locked')}` : undefined}
        right={
          <>
            <IconLink to={`/assistant?trip=${trip.id}`} label={t('ai.open')}>
              ✨
            </IconLink>
            <IconLink to="/settings" label={t('settings.title')}>
              ⚙️
            </IconLink>
          </>
        }
      />
      <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setParams({ tab: x.id }, { replace: true })}
            className={cx(
              'shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition',
              tab === x.id
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
            )}
          >
            {x.icon} {t(x.label)}
          </button>
        ))}
      </nav>
      {trip.locked && tab !== 'settings' && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{t('ts.locked_banner')}</p>
      )}
      {tab === 'expenses' && <ExpensesTab trip={trip} />}
      {tab === 'balances' && <BalancesTab trip={trip} />}
      {tab === 'settle' && <SettleTab trip={trip} />}
      {tab === 'stats' && <StatsTab trip={trip} />}
      {tab === 'members' && <MembersTab trip={trip} />}
      {tab === 'settings' && <TripSettingsTab trip={trip} />}
    </Page>
  );
}
