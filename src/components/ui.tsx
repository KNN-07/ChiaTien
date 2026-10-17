import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  faChevronDown,
  faCircleCheck,
  faCircleExclamation,
  faCircleInfo,
  faImage,
  faPiggyBank,
  faTriangleExclamation,
  faXmark,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { formatMoney, formatNumber, parseAmount, toMinor } from '../domain/money';
import { useLocale } from '../i18n';
import { cn } from './cn';
import { Icon } from './icons';

export { cn };
/** @deprecated alias kept for older call sites */
export const cx = cn;

/* ---------------- Button ---------------- */

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        primary: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        danger: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        md: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { icon?: IconDefinition };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, icon, children, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props}>
    {icon && <Icon icon={icon} />}
    {children}
  </button>
));
Button.displayName = 'Button';

/* ---------------- Form controls ---------------- */

export const inputCls =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} {...props} className={cn(inputCls, className)} />
));
Input.displayName = 'Input';

/** Native select styled like shadcn's trigger (native pickers are nicer on phones). */
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative', className)}>
      <select {...props} className={cn(inputCls, 'appearance-none pr-8')} />
      <Icon icon={faChevronDown} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground" />
    </div>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...props} className={cn(inputCls, 'h-auto min-h-[60px] py-2', className)} />;
}

export function Label({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cn('text-sm font-medium leading-none', className)} />;
}

export function Field({ label, hint, children, className }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('grid gap-2', className)}>
      {label && <Label>{label}</Label>}
      {children}
      {hint && <span className="text-[0.8rem] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/* ---------------- Card ---------------- */

export function Card({
  children,
  className,
  title,
  description,
  action,
  contentClassName,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  contentClassName?: string;
}) {
  const hasHeader = title || description || action;
  return (
    <section className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 p-4 pb-0 sm:p-5 sm:pb-0">
          <div className="grid gap-1">
            {title && <h3 className="font-semibold leading-none tracking-tight">{title}</h3>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      {children !== undefined && <div className={cn('p-4 sm:p-5', hasHeader && 'pt-4 sm:pt-4', contentClassName)}>{children}</div>}
    </section>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn('h-px w-full shrink-0 bg-border', className)} />;
}

/* ---------------- Dialog / sheet ---------------- */

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 flex max-h-[92dvh] w-full flex-col border bg-background shadow-lg duration-200',
            'inset-x-0 bottom-0 rounded-t-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95',
          )}
        >
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted sm:hidden" />
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4">
            <div className="grid gap-1.5">
              <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring" aria-label="Close">
              <Icon icon={faXmark} />
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-5 py-3">{children}</div>
          {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t px-5 pt-3 sm:pb-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ---------------- Switch ---------------- */

export function Switch({ checked, onChange, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span className={cn('pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-3', disabled && 'opacity-60')}>
      <div className="grid gap-1">
        <span className="text-sm font-medium leading-none">{label}</span>
        {hint && <span className="text-[0.8rem] text-muted-foreground">{hint}</span>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/* ---------------- Chips, tabs, badges ---------------- */

export function Chip({ active, onClick, children, className, title }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode; icon?: IconDefinition }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('inline-flex h-9 w-full items-center rounded-lg bg-muted p-1 text-muted-foreground', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-7 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            value === o.value ? 'bg-background text-foreground shadow' : 'hover:text-foreground',
          )}
        >
          {o.icon && <Icon icon={o.icon} className="text-xs" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

const badgeVariants = cva('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground shadow',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'text-foreground',
      destructive: 'border-transparent bg-destructive/10 text-negative',
      success: 'border-transparent bg-positive/10 text-positive',
      warning: 'border-transparent bg-warning/15 text-warning-foreground dark:text-warning',
    },
  },
  defaultVariants: { variant: 'secondary' },
});

export function Badge({ className, variant, children }: { className?: string; children: ReactNode } & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}

/* ---------------- Alert ---------------- */

const alertIcons = { default: faCircleInfo, warning: faTriangleExclamation, destructive: faCircleExclamation, success: faCircleCheck };

export function Alert({ variant = 'default', children, className, action }: { variant?: keyof typeof alertIcons; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
        variant === 'warning' && 'border-warning/50 bg-warning/10 text-warning-foreground dark:text-warning',
        variant === 'destructive' && 'border-negative/40 bg-negative/5 text-negative',
        variant === 'success' && 'border-positive/40 bg-positive/5 text-positive',
        className,
      )}
    >
      <Icon icon={alertIcons[variant]} className="mt-0.5" />
      <div className="flex-1 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4">{children}</div>
      {action}
    </div>
  );
}

/* ---------------- Avatar ---------------- */

export function Avatar({ name, size = 'md', kind, className }: { name: string; id?: string; size?: 'sm' | 'md'; kind?: string; className?: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(-2)
    .join('')
    .toUpperCase();
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border bg-muted font-medium text-foreground',
        size === 'sm' ? 'h-5 w-5 text-[9px]' : 'h-9 w-9 text-xs',
        className,
      )}
    >
      {kind === 'pot' ? <Icon icon={faPiggyBank} className={size === 'sm' ? 'text-[9px]' : 'text-sm'} /> : initials || '?'}
    </span>
  );
}

/* ---------------- Money ---------------- */

export function Money({ minor, currency, className, signed }: { minor: number; currency: string; className?: string; signed?: boolean }) {
  const locale = useLocale();
  const s = formatMoney(Math.abs(minor), currency, locale);
  return (
    <span className={cn('tabular-nums', className)}>
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
        className={cn(inputCls, 'tabular-nums', className)}
      />
      {isExpr && parsed !== null && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          = {formatNumber(toMinor(parsed, currency), currency, locale)}
        </span>
      )}
    </div>
  );
}

/* ---------------- Toast ---------------- */

let toastMsg: { id: number; text: string } | null = null;
const toastListeners = new Set<() => void>();
export function toast(text: string) {
  toastMsg = { id: Date.now(), text };
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    if (toastMsg && Date.now() - toastMsg.id >= 2900) {
      toastMsg = null;
      toastListeners.forEach((l) => l());
    }
  }, 3000);
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
      <div key={msg.id} className="max-w-sm rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
        {msg.text}
      </div>
    </div>
  );
}

/* ---------------- Drop overlay ---------------- */

export function DropOverlay({ show, label }: { show: boolean; label: ReactNode }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm animate-in fade-in-0 lg:left-64">
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border-2 border-dashed border-foreground/30 bg-card px-6 py-12 text-center text-sm font-medium shadow-lg">
        <Icon icon={faImage} className="text-2xl text-muted-foreground" />
        {label}
      </div>
    </div>
  );
}

/* ---------------- Empty state ---------------- */

export function Empty({ icon, title, hint, action }: { icon: IconDefinition; title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon icon={icon} className="text-lg text-muted-foreground" />
      </div>
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Small uppercase-free section label used above lists. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h4 className={cn('px-1 text-xs font-medium text-muted-foreground', className)}>{children}</h4>;
}
