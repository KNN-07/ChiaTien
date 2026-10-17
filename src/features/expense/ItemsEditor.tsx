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

  // qty × unit price = line total, kept in sync whichever field is edited.
  const setQty = (it: Item, raw: string) => {
    const qty = raw === '' ? undefined : Math.max(0, parseFloat(raw.replace(',', '.')) || 0);
    if (qty && it.unitPrice) setItem(it.id, { qty, amount: Math.round(qty * it.unitPrice) });
    else if (qty && it.amount) setItem(it.id, { qty, unitPrice: Math.round(it.amount / qty) });
    else setItem(it.id, { qty });
  };
  const setUnit = (it: Item, unitPrice: number) => setItem(it.id, { unitPrice: unitPrice || undefined, amount: Math.round((it.qty || 1) * unitPrice) });
  const setTotal = (it: Item, amount: number) => setItem(it.id, { amount, unitPrice: it.qty ? Math.round(amount / it.qty) : undefined });

  const numbers = (it: Item) => (
    <>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={it.qty ?? ''}
        onChange={(e) => setQty(it, e.target.value)}
        placeholder="1"
        aria-label={t('exp.qty')}
        className="text-center tabular-nums"
      />
      <AmountInput value={it.unitPrice ?? 0} currency={cur} onChange={(v) => setUnit(it, v)} placeholder={t('exp.unit_price')} />
      <AmountInput value={it.amount} currency={cur} onChange={(v) => setTotal(it, v)} placeholder={t('exp.line_total')} className="font-medium" />
    </>
  );

  return (
    <div className="grid gap-4">
      <ul className="divide-y rounded-lg border">
        <li className="hidden grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_8rem_8rem_2.25rem] gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
          <span className="text-center">#</span>
          <span>{t('exp.item_name')}</span>
          <span className="text-center">{t('exp.qty')}</span>
          <span>{t('exp.unit_price')}</span>
          <span>{t('exp.line_total')}</span>
          <span />
        </li>
        {items.map((it, idx) => (
          <li key={it.id} className="grid gap-2.5 p-3">
            <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_2.25rem] items-center gap-2 sm:grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_8rem_8rem_2.25rem]">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-muted text-xs font-semibold tabular-nums text-muted-foreground">{idx + 1}</span>
              <Input value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} placeholder={`${t('exp.item_name')} ${idx + 1}`} />
              <div className="hidden sm:contents">{numbers(it)}</div>
              <Button variant="ghost" size="icon" aria-label={t('delete')} onClick={() => setItems(items.filter((x) => x.id !== it.id))}>
                <Icon icon={faXmark} className="text-muted-foreground" />
              </Button>
            </div>
            <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 pl-9 sm:hidden">{numbers(it)}</div>
            <div className="flex flex-wrap items-center gap-1.5 sm:pl-9">
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
