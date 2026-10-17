import {
  faChartSimple,
  faGear,
  faLock,
  faMoneyBillTransfer,
  faReceipt,
  faScaleBalanced,
  faUsers,
  faWandMagicSparkles,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { useParams, useSearchParams } from 'react-router-dom';
import { Icon, TripIcon } from '../../components/icons';
import { IconLink, Page, TopBar } from '../../components/layout';
import { Alert, cn, Empty } from '../../components/ui';
import { useT, type DictKey } from '../../i18n';
import { useTrip } from '../../services/db';
import { BalancesTab } from './BalancesTab';
import { ExpensesTab } from './ExpensesTab';
import { MembersTab } from './MembersTab';
import { SettleTab } from './SettleTab';
import { StatsTab } from './StatsTab';
import { TripSettingsTab } from './TripSettingsTab';

const TABS: { id: string; label: DictKey; icon: IconDefinition }[] = [
  { id: 'expenses', label: 'tab.expenses', icon: faReceipt },
  { id: 'balances', label: 'tab.balances', icon: faScaleBalanced },
  { id: 'settle', label: 'tab.settle', icon: faMoneyBillTransfer },
  { id: 'stats', label: 'tab.stats', icon: faChartSimple },
  { id: 'members', label: 'tab.members', icon: faUsers },
  { id: 'settings', label: 'tab.settings', icon: faGear },
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
        <Empty icon={faReceipt} title={t('not_found')} />
      </Page>
    );

  return (
    <Page>
      <TopBar
        back="/"
        title={
          <span className="flex items-center gap-2">
            <TripIcon icon={trip.emoji} className="h-7 w-7 rounded-md text-xs" />
            <span className="truncate">{trip.name}</span>
            {trip.locked && <Icon icon={faLock} className="text-xs text-muted-foreground" />}
          </span>
        }
        right={<IconLink to={`/assistant?trip=${trip.id}`} icon={faWandMagicSparkles} label={t('ai.open')} />}
      />
      <nav role="tablist" className="no-scrollbar -mx-4 mb-6 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <div className="inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground">
          {TABS.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={tab === x.id}
              onClick={() => setParams({ tab: x.id }, { replace: true })}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all',
                tab === x.id ? 'bg-background text-foreground shadow' : 'hover:text-foreground',
              )}
            >
              <Icon icon={x.icon} className="text-xs" />
              {t(x.label)}
            </button>
          ))}
        </div>
      </nav>
      {trip.locked && tab !== 'settings' && (
        <Alert variant="warning" className="mb-4">
          {t('ts.locked_banner')}
        </Alert>
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
