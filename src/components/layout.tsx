import { faArrowLeft, faGear, faPlus, faSuitcaseRolling, faWallet, faWandMagicSparkles, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { useTrips } from '../services/db';
import { cn } from './cn';
import { Icon, TripIcon } from './icons';
import { buttonVariants } from './ui';

/** Desktop: fixed sidebar + content. Mobile: content only (pages render their own top bar). */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:pl-64">
      <Sidebar />
      {children}
    </div>
  );
}

function Sidebar() {
  const t = useT();
  const trips = useTrips();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const item = (active: boolean) =>
    cn(
      'flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors',
      active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
    );
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-muted/30 lg:flex">
      <Link to="/" className="flex h-14 items-center gap-2 border-b px-5 font-semibold tracking-tight">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon icon={faWallet} className="text-xs" />
        </span>
        {t('app.name')}
      </Link>
      <nav className="grid gap-1 p-3">
        <NavLink to="/" end className={({ isActive }) => item(isActive)}>
          <Icon icon={faSuitcaseRolling} className="text-xs" />
          {t('trips.title')}
        </NavLink>
        <NavLink to="/assistant" className={({ isActive }) => item(isActive)}>
          <Icon icon={faWandMagicSparkles} className="text-xs" />
          {t('ai.title')}
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => item(isActive)}>
          <Icon icon={faGear} className="text-xs" />
          {t('settings.title')}
        </NavLink>
      </nav>
      <div className="flex items-center justify-between px-6 pb-1 pt-3">
        <span className="text-xs font-medium text-muted-foreground">{t('trips.title')}</span>
        <button onClick={() => nav('/?new=1')} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} aria-label={t('trips.new')} title={t('trips.new')}>
          <Icon icon={faPlus} className="text-xs" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="grid gap-0.5">
          {trips?.map((tr) => {
            const active = pathname.startsWith(`/trip/${tr.id}`);
            return (
              <Link key={tr.id} to={`/trip/${tr.id}`} className={item(active)}>
                <TripIcon icon={tr.emoji} className="h-6 w-6 rounded text-[10px]" />
                <span className="truncate">{tr.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

export function Page({ children, className, wide = true }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn('mx-auto min-h-dvh w-full px-4 pb-28 lg:px-8 lg:pb-12', wide ? 'max-w-6xl' : 'max-w-3xl', className)}>{children}</div>;
}

export function TopBar({
  title,
  back,
  right,
  subtitle,
  mobileOnly,
}: {
  title: ReactNode;
  back?: string | true;
  right?: ReactNode;
  subtitle?: ReactNode;
  /** Hide on desktop where the sidebar already provides branding/navigation. */
  mobileOnly?: boolean;
}) {
  const nav = useNavigate();
  return (
    <header
      className={cn(
        'sticky top-0 z-30 -mx-4 mb-5 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:-mx-8 lg:px-8',
        mobileOnly && 'lg:hidden',
      )}
    >
      {back && (
        <button onClick={() => (back === true ? nav(-1) : nav(back))} className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), '-ml-2')} aria-label="Back">
          <Icon icon={faArrowLeft} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-1">{right}</div>}
    </header>
  );
}

/** Header icon link; `mobileOnly` hides it on desktop where the sidebar has the same link. */
export function IconLink({ to, icon, label, mobileOnly }: { to: string; icon: IconDefinition; label: string; mobileOnly?: boolean }) {
  return (
    <Link to={to} aria-label={label} title={label} className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), mobileOnly && 'lg:hidden')}>
      <Icon icon={icon} />
    </Link>
  );
}

/** Bottom action bar: full width on mobile, offset by the sidebar on desktop. */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 backdrop-blur lg:left-64 lg:px-8', className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </div>
  );
}
