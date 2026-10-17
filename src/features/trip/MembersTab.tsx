import { faBuildingColumns, faCalendarDays, faChevronRight, faHouseUser, faPiggyBank, faPlus, faUserGroup } from '@fortawesome/free-solid-svg-icons';
import { useState } from 'react';
import { MemberPicker } from '../../components/MemberPicker';
import { Icon } from '../../components/icons';
import { Avatar, Badge, Button, Card, Field, Input, Segmented, Select, Separator, Sheet, toast } from '../../components/ui';
import { memberInUse, newMember, uid } from '../../domain/trip';
import type { Group, Household, Member, Trip } from '../../domain/types';
import { useT } from '../../i18n';
import { removeFrom, updateTrip, upsert } from '../../services/db';
import { BANKS, bankName } from '../../services/vietqr';

export function MembersTab({ trip }: { trip: Trip }) {
  const t = useT();
  const ro = trip.locked;
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);
  const [group, setGroup] = useState<{ kind: 'group' | 'household'; value: Group | Household } | null>(null);

  const add = async () => {
    const names = name
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.length) return;
    await updateTrip(trip.id, (d) => names.forEach((n) => d.members.push(newMember(n))));
    setName('');
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
      <Card
        title={t('mem.members')}
        description={`${trip.members.length}`}
        action={
          !ro && (
            <Button size="sm" variant="outline" icon={faPiggyBank} onClick={() => updateTrip(trip.id, (d) => d.members.push(newMember(t('mem.kind_pot'), 'pot')))}>
              {t('mem.kind_pot')}
            </Button>
          )
        }
      >
        {!ro && (
          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('trips.members_ph')} />
            <Button type="submit" icon={faPlus}>
              <span className="hidden sm:inline">{t('add')}</span>
            </Button>
          </form>
        )}
        {trip.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('mem.none')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {trip.members.map((m) => (
              <li key={m.id}>
                <button disabled={ro} onClick={() => setEditing(m)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50">
                  <Avatar name={m.name} kind={m.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {m.name}
                      {m.kind === 'guest' && <Badge variant="outline">{t('mem.kind_guest')}</Badge>}
                      {m.kind === 'pot' && <Badge variant="outline">{t('mem.kind_pot')}</Badge>}
                    </p>
                    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {m.kind === 'guest' && m.hostId && <span>→ {trip.members.find((x) => x.id === m.hostId)?.name}</span>}
                      {(m.joinDate || m.leaveDate) && (
                        <span className="inline-flex items-center gap-1">
                          <Icon icon={faCalendarDays} className="text-[10px]" />
                          {m.joinDate ?? '…'} – {m.leaveDate ?? '…'}
                        </span>
                      )}
                      {m.bank && (
                        <span className="inline-flex items-center gap-1">
                          <Icon icon={faBuildingColumns} className="text-[10px]" />
                          {bankName(m.bank.bin)}
                        </span>
                      )}
                    </p>
                  </div>
                  {!ro && <Icon icon={faChevronRight} className="text-xs text-muted-foreground" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t('mem.pot_hint')}</p>
      </Card>

      <div className="grid gap-6">
        <GroupList
          trip={trip}
          icon={faUserGroup}
          title={t('mem.groups')}
          hint={t('mem.groups_hint')}
          items={trip.groups}
          addLabel={t('mem.add_group')}
          onEdit={(g) => setGroup({ kind: 'group', value: g })}
          onAdd={() => setGroup({ kind: 'group', value: { id: uid(), name: '', memberIds: [], updatedAt: 0 } })}
        />
        <GroupList
          trip={trip}
          icon={faHouseUser}
          title={t('mem.households')}
          hint={t('mem.households_hint')}
          items={trip.households}
          addLabel={t('mem.add_household')}
          onEdit={(g) => setGroup({ kind: 'household', value: g })}
          onAdd={() => setGroup({ kind: 'household', value: { id: uid(), name: '', memberIds: [], updatedAt: 0 } })}
        />
      </div>

      {editing && <MemberSheet trip={trip} member={editing} onClose={() => setEditing(null)} />}
      {group && <GroupSheet trip={trip} kind={group.kind} value={group.value} onClose={() => setGroup(null)} />}
    </div>
  );
}

function GroupList({
  trip,
  icon,
  title,
  hint,
  items,
  addLabel,
  onEdit,
  onAdd,
}: {
  trip: Trip;
  icon: typeof faUserGroup;
  title: string;
  hint: string;
  items: (Group | Household)[];
  addLabel: string;
  onEdit: (g: Group | Household) => void;
  onAdd: () => void;
}) {
  const ro = trip.locked;
  return (
    <Card
      title={title}
      description={hint}
      action={
        !ro && (
          <Button size="icon-sm" variant="outline" onClick={onAdd} aria-label={addLabel} title={addLabel}>
            <Icon icon={faPlus} className="text-xs" />
          </Button>
        )
      }
    >
      {items.length === 0 ? (
        <Button variant="ghost" size="sm" icon={faPlus} disabled={ro} onClick={onAdd} className="-ml-2 text-muted-foreground">
          {addLabel}
        </Button>
      ) : (
        <div className="grid gap-2">
          {items.map((g) => (
            <button key={g.id} disabled={ro} onClick={() => onEdit(g)} className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50">
              <Icon icon={icon} className="text-xs text-muted-foreground" />
              <span className="text-sm font-medium">{g.name}</span>
              <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
                {g.memberIds
                  .map((id) => trip.members.find((m) => m.id === id)?.name)
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function MemberSheet({ trip, member, onClose }: { trip: Trip; member: Member; onClose: () => void }) {
  const t = useT();
  const [m, setM] = useState<Member>(member);
  const [customBin, setCustomBin] = useState(!!m.bank?.bin && !BANKS.some((b) => b.bin === m.bank?.bin));
  const set = (p: Partial<Member>) => setM((x) => ({ ...x, ...p }));
  const bank = m.bank ?? { bin: '', account: '' };
  const setBank = (p: Partial<typeof bank>) => set({ bank: { ...bank, ...p } });

  const save = async () => {
    const clean: Member = {
      ...m,
      name: m.name.trim() || member.name,
      hostId: m.kind === 'guest' ? m.hostId : undefined,
      bank: m.bank?.account && m.bank.bin ? m.bank : undefined,
    };
    await updateTrip(trip.id, (d) => {
      upsert(d.members, clean);
      if (clean.kind === 'pot') d.expenses.forEach((e) => (e.split.entries = e.split.entries.filter((s) => s.memberId !== clean.id)));
    });
    onClose();
  };
  const del = async () => {
    if (memberInUse(trip, m.id)) return toast(t('mem.in_use'));
    if (!confirm(t('confirm_delete'))) return;
    await updateTrip(trip.id, (d) => {
      removeFrom(d, d.members, m.id);
      d.groups.forEach((g) => (g.memberIds = g.memberIds.filter((x) => x !== m.id)));
      d.households.forEach((g) => (g.memberIds = g.memberIds.filter((x) => x !== m.id)));
    });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('mem.edit')}
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-negative hover:text-negative" onClick={del}>
            {t('delete')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={save}>{t('save')}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label={t('mem.name_ph')}>
          <Input value={m.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={t('mem.kind')} hint={m.kind === 'pot' ? t('mem.pot_hint') : m.kind === 'guest' ? t('mem.guest_hint') : undefined}>
          <Segmented
            value={m.kind}
            onChange={(kind) => set({ kind })}
            options={[
              { value: 'person', label: t('mem.kind_person') },
              { value: 'guest', label: t('mem.kind_guest') },
              { value: 'pot', label: t('mem.kind_pot') },
            ]}
          />
        </Field>
        {m.kind === 'guest' && (
          <Field label={t('mem.host')}>
            <Select value={m.hostId ?? ''} onChange={(e) => set({ hostId: e.target.value || undefined })}>
              <option value="">—</option>
              {trip.members
                .filter((x) => x.id !== m.id && x.kind === 'person')
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        {m.kind !== 'pot' && (
          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('mem.join')}>
                <Input type="date" value={m.joinDate ?? ''} onChange={(e) => set({ joinDate: e.target.value || undefined })} />
              </Field>
              <Field label={t('mem.leave')}>
                <Input type="date" value={m.leaveDate ?? ''} onChange={(e) => set({ leaveDate: e.target.value || undefined })} />
              </Field>
            </div>
            <p className="text-[0.8rem] text-muted-foreground">{t('mem.dates_hint')}</p>
          </div>
        )}
        <Separator />
        <p className="flex items-center gap-2 text-sm font-medium">
          <Icon icon={faBuildingColumns} className="text-xs text-muted-foreground" />
          {t('mem.bank')}
        </p>
        <Field label={t('mem.bank_bin')}>
          <Select
            value={customBin ? '__other' : bank.bin}
            onChange={(e) => {
              if (e.target.value === '__other') {
                setCustomBin(true);
                setBank({ bin: '' });
              } else {
                setCustomBin(false);
                setBank({ bin: e.target.value });
              }
            }}
          >
            <option value="">—</option>
            {BANKS.map((b) => (
              <option key={b.bin} value={b.bin}>
                {b.name}
              </option>
            ))}
            <option value="__other">{t('mem.bank_other')}</option>
          </Select>
        </Field>
        {customBin && <Input value={bank.bin} onChange={(e) => setBank({ bin: e.target.value.trim() })} placeholder="970xxx" />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('mem.bank_account')}>
            <Input inputMode="numeric" value={bank.account} onChange={(e) => setBank({ account: e.target.value.replace(/\s/g, '') })} />
          </Field>
          <Field label={t('mem.bank_holder')}>
            <Input value={bank.holder ?? ''} onChange={(e) => setBank({ holder: e.target.value.toUpperCase() })} placeholder="NGUYEN VAN A" />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

function GroupSheet({ trip, kind, value, onClose }: { trip: Trip; kind: 'group' | 'household'; value: Group | Household; onClose: () => void }) {
  const t = useT();
  const [g, setG] = useState(value);
  const isNew = !(kind === 'group' ? trip.groups : trip.households).some((x) => x.id === g.id);
  const save = async () => {
    await updateTrip(trip.id, (d) => {
      const clean = { ...g, name: g.name.trim() || '—' };
      if (kind === 'group') upsert(d.groups, clean);
      else {
        // A person belongs to at most one household.
        d.households.forEach((h) => h.id !== clean.id && (h.memberIds = h.memberIds.filter((x) => !clean.memberIds.includes(x))));
        upsert(d.households, clean);
      }
    });
    onClose();
  };
  const del = async () => {
    await updateTrip(trip.id, (d) => (kind === 'group' ? removeFrom(d, d.groups, g.id) : removeFrom(d, d.households, g.id)));
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={kind === 'group' ? t('mem.groups') : t('mem.households')}
      description={kind === 'group' ? t('mem.groups_hint') : t('mem.households_hint')}
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" className="mr-auto text-negative hover:text-negative" onClick={del}>
              {t('delete')}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={save}>{t('save')}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Input autoFocus value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder={kind === 'group' ? t('mem.group_name_ph') : t('mem.household_name_ph')} />
        <MemberPicker trip={trip} selected={g.memberIds} onChange={(ids) => setG({ ...g, memberIds: ids })} />
      </div>
    </Sheet>
  );
}
