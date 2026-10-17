import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { formatMoney, formatNumber, parseAmount, toMinor } from '../domain/money';
import { useLocale } from '../i18n';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const btnStyles: Record<BtnVariant, string> = {
  primary: 'bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800 disabled:bg-teal-600/50',
  secondary:
    'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600 dark:hover:bg-slate-700',
  ghost: 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'px-2.5 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
        btnStyles[variant],
        className,
      )}
    />
  );
}

export const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 sm:text-sm';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, 'pr-8', props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...props} className={cx(inputCls, props.className)} />;
}

export function Field({ label, hint, children, className }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-xl dark:bg-slate-900 sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="close">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">{footer}</div>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex cursor-pointer items-start justify-between gap-3 py-1.5', disabled && 'opacity-60')}>
      <span>
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-600')}
      >
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function Chip({ active, onClick, children, className, title }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition',
        active
          ? 'bg-teal-600 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition',
            value === o.value ? 'bg-white font-medium text-teal-700 shadow-sm dark:bg-slate-700 dark:text-teal-300' : 'text-slate-600 dark:text-slate-400',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PALETTE = ['bg-teal-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-orange-500', 'bg-fuchsia-500', 'bg-lime-600'];

export function Avatar({ name, id, size = 'md', kind }: { name: string; id: string; size?: 'sm' | 'md'; kind?: string }) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = kind === 'pot' ? '💰' : name.trim().split(/\s+/).map((w) => w[0]).slice(-2).join('').toUpperCase();
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        kind === 'pot' ? 'bg-yellow-400' : PALETTE[h % PALETTE.length],
        size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-9 w-9 text-sm',
      )}
    >
      {initials || '?'}
    </span>
  );
}

export function Money({ minor, currency, className, signed }: { minor: number; currency: string; className?: string; signed?: boolean }) {
  const locale = useLocale();
  const s = formatMoney(Math.abs(minor), currency, locale);
  return (
    <span className={cx('tabular-nums', className)}>
      {signed ? (minor > 0 ? '+' : minor < 0 ? '−' : '') : minor < 0 ? '−' : ''}
      {s}
    </span>
  );
}

/** Text input that understands "150k", "1.2tr", "120+35*2" and emits minor units. */
export function AmountInput({
  value,
  currency,
  onChange,
  placeholder,
  className,
  autoFocus,
  disabled,
}: {
  value: number;
  currency: string;
  onChange: (minor: number) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const locale = useLocale();
  const fmt = (m: number) => (m ? formatNumber(m, currency, locale) : '');
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (!focused.current || value !== lastEmitted.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, currency, locale]);
  const parsed = parseAmount(text, currency);
  const isExpr = /[+\-*/()]|k|tr|m\b/i.test(text.replace(/^-/, ''));
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        value={text}
        placeholder={placeholder ?? '0'}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText(fmt(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseAmount(e.target.value, currency);
          const m = v === null ? 0 : toMinor(v, currency);
          lastEmitted.current = m;
          onChange(m);
        }}
        className={cx(inputCls, 'tabular-nums', className)}
      />
      {isExpr && parsed !== null && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-teal-600 dark:text-teal-400">
          = {formatNumber(toMinor(parsed, currency), currency, locale)}
        </span>
      )}
    </div>
  );
}

/* ---- toast ---- */
let toastMsg: { id: number; text: string } | null = null;
const toastListeners = new Set<() => void>();
export function toast(text: string) {
  toastMsg = { id: Date.now(), text };
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    if (toastMsg && Date.now() - toastMsg.id >= 2400) {
      toastMsg = null;
      toastListeners.forEach((l) => l());
    }
  }, 2500);
}
export function Toaster() {
  const msg = useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toastMsg,
  );
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
      <div className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">{msg.text}</div>
    </div>
  );
}

export function Empty({ icon, title, hint, action }: { icon: string; title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 text-5xl">{icon}</div>
      <p className="font-medium text-slate-800 dark:text-slate-200">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
