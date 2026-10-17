import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { MemberPicker } from '../../components/MemberPicker';
import { Icon } from '../../components/icons';
import { AmountInput, Badge, Button, Chip, Field, Input, Money, Segmented, Separator } from '../../components/ui';
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

export function ItemsEditor({ trip, draft, onChange }: { trip: Trip; draft: Expense; onChange: (patch: Pick<Expense, 'items' | 'extras'>) => void }) {
  const t = useT();
  const items = draft.items ?? [];
  const extras = draft.extras ?? emptyExtras();
  const cur = draft.currency;
  const everyone = trip.members.filter((m) => m.kind !== 'pot').map((m) => m.id);

  const setItems = (next: Item[]) => onChange({ items: next, extras });
  const setItem = (id: string, patch: Partial<Item>) => setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const setExtras = (patch: Partial<Extras>) => onChange({ items, extras: { ...extras, ...patch } });

  return (
    <div className="grid gap-4">
      <ul className="divide-y rounded-lg border">
        {items.map((it, idx) => (
          <li key={it.id} className="grid gap-2.5 p-3">
            <div className="flex gap-2">
              <Input value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} placeholder={`${t('exp.item_name')} ${idx + 1}`} className="flex-1" />
              <div className="w-32 sm:w-40">
                <AmountInput value={it.amount} currency={cur} onChange={(amount) => setItem(it.id, { amount })} />
              </div>
              <Button variant="ghost" size="icon" aria-label={t('delete')} onClick={() => setItems(items.filter((x) => x.id !== it.id))}>
                <Icon icon={faXmark} className="text-muted-foreground" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip
                className="h-7 px-2 text-xs"
                active={everyone.length > 0 && it.split.entries.length === everyone.length}
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
              {it.split.entries.length === 0 && <Badge variant="warning">{t('exp.item_unassigned')}</Badge>}
            </div>
          </li>
        ))}
      </ul>
      <div>
        <Button size="sm" variant="outline" icon={faPlus} onClick={() => setItems([...items, newItem()])}>
          {t('exp.add_item')}
        </Button>
      </div>

      <Separator />
      <p className="text-sm font-medium">{t('exp.extras')}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
      <Segmented
        value={extras.mode}
        onChange={(mode) => setExtras({ mode })}
        options={[
          { value: 'proportional', label: t('exp.extras_prop') },
          { value: 'equal', label: t('exp.extras_equal') },
        ]}
      />
      <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
        <span className="text-muted-foreground">{t('exp.items_sum')}</span>
        <Money minor={computedBillTotal(draft)} currency={cur} className="font-semibold" />
      </div>
    </div>
  );
}
