import { MemberPicker } from '../../components/MemberPicker';
import { AmountInput, Button, Chip, Field, Input, Money, Segmented } from '../../components/ui';
import { itemsTotal } from '../../domain/split';
import { uid } from '../../domain/trip';
import type { Expense, Extras, Item, Trip } from '../../domain/types';
import { useT } from '../../i18n';

export const emptyExtras = (): Extras => ({ tax: 0, service: 0, tip: 0, discount: 0, mode: 'proportional' });

export function computedBillTotal(e: Pick<Expense, 'items' | 'extras'>): number {
  const x = e.extras ?? emptyExtras();
  return itemsTotal(e.items) + x.tax + x.service + x.tip - x.discount;
}

export function newItem(): Item {
  return { id: uid(), name: '', amount: 0, split: { mode: 'equal', entries: [] } };
}

export function ItemsEditor({
  trip,
  draft,
  onChange,
}: {
  trip: Trip;
  draft: Expense;
  onChange: (patch: Pick<Expense, 'items' | 'extras'>) => void;
}) {
  const t = useT();
  const items = draft.items ?? [];
  const extras = draft.extras ?? emptyExtras();
  const cur = draft.currency;
  const everyone = trip.members.filter((m) => m.kind !== 'pot').map((m) => m.id);

  const setItems = (next: Item[]) => onChange({ items: next, extras });
  const setItem = (id: string, patch: Partial<Item>) => setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const setExtras = (patch: Partial<Extras>) => onChange({ items, extras: { ...extras, ...patch } });

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((it, idx) => (
          <li key={it.id} className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-900/50">
            <div className="flex gap-2">
              <Input
                value={it.name}
                onChange={(e) => setItem(it.id, { name: e.target.value })}
                placeholder={`${t('exp.item_name')} ${idx + 1}`}
                className="flex-1"
              />
              <div className="w-32">
                <AmountInput value={it.amount} currency={cur} onChange={(amount) => setItem(it.id, { amount })} />
              </div>
              <button
                className="px-1 text-slate-400 hover:text-rose-600"
                aria-label={t('delete')}
                onClick={() => setItems(items.filter((x) => x.id !== it.id))}
              >
                ✕
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip
                className="!px-2 !py-1 !text-xs"
                active={it.split.entries.length === everyone.length}
                onClick={() => setItem(it.id, { split: { mode: 'equal', entries: everyone.map((id) => ({ memberId: id, value: 1 })) } })}
              >
                {t('exp.item_everyone')}
              </Chip>
              <MemberPicker
                compact
                trip={trip}
                selected={it.split.entries.map((e) => e.memberId)}
                onChange={(ids) => setItem(it.id, { split: { mode: 'equal', entries: ids.map((id) => ({ memberId: id, value: 1 })) } })}
              />
              {it.split.entries.length === 0 && <span className="text-xs text-amber-600">{t('exp.item_unassigned')}</span>}
            </div>
          </li>
        ))}
      </ul>
      <Button size="sm" onClick={() => setItems([...items, newItem()])}>
        + {t('exp.add_item')}
      </Button>

      <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700" open={extras.tax + extras.service + extras.tip + extras.discount > 0}>
        <summary className="cursor-pointer text-sm font-medium">{t('exp.extras')}</summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label={t('exp.tax')}>
            <AmountInput value={extras.tax} currency={cur} onChange={(tax) => setExtras({ tax })} />
          </Field>
          <Field label={t('exp.service')}>
            <AmountInput value={extras.service} currency={cur} onChange={(service) => setExtras({ service })} />
          </Field>
          <Field label={t('exp.tip')}>
            <AmountInput value={extras.tip} currency={cur} onChange={(tip) => setExtras({ tip })} />
          </Field>
          <Field label={t('exp.discount')}>
            <AmountInput value={extras.discount} currency={cur} onChange={(discount) => setExtras({ discount })} />
          </Field>
        </div>
        <div className="mt-3">
          <Segmented
            value={extras.mode}
            onChange={(mode) => setExtras({ mode })}
            options={[
              { value: 'proportional', label: t('exp.extras_prop') },
              { value: 'equal', label: t('exp.extras_equal') },
            ]}
          />
        </div>
      </details>
      <p className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
        <span>{t('exp.items_sum')}</span>
        <Money minor={computedBillTotal(draft)} currency={cur} className="font-semibold" />
      </p>
    </div>
  );
}
