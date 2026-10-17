import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cx } from './ui';

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto min-h-screen w-full max-w-2xl px-4 pb-28', className)}>{children}</div>;
}

export function TopBar({ title, back, right, subtitle }: { title: ReactNode; back?: string | true; right?: ReactNode; subtitle?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-3 flex items-center gap-2 bg-slate-50/90 px-4 py-3 backdrop-blur dark:bg-slate-950/90">
      {back && (
        <button
          onClick={() => (back === true ? nav(-1) : nav(back))}
          className="-ml-2 rounded-full p-2 text-xl leading-none text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="back"
        >
          ←
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold text-slate-900 dark:text-slate-50">{title}</h1>
        {subtitle && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

export function IconLink({ to, children, label }: { to: string; children: ReactNode; label: string }) {
  return (
    <Link to={to} aria-label={label} title={label} className="rounded-full p-2 text-xl leading-none hover:bg-slate-200 dark:hover:bg-slate-800">
      {children}
    </Link>
  );
}
