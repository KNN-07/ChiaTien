import { faUserGroup } from '@fortawesome/free-solid-svg-icons';
import { defaultParticipants } from '../domain/trip';
import type { ID, Trip } from '../domain/types';
import { useT } from '../i18n';
import { Icon } from './icons';
import { Avatar, Button, Chip, cn } from './ui';

/** Multi-select of members with quick presets: all, present that day, sub-groups. */
export function MemberPicker({
  trip,
  selected,
  onChange,
  date,
  includePot = false,
  compact = false,
}: {
  trip: Trip;
  selected: ID[];
  onChange: (ids: ID[]) => void;
  date?: string;
  includePot?: boolean;
  compact?: boolean;
}) {
  const t = useT();
  const members = trip.members.filter((m) => includePot || m.kind !== 'pot');
  const sel = new Set(selected);
  const toggle = (id: ID) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Keep trip order for stable display.
    onChange(members.map((m) => m.id).filter((x) => next.has(x)));
  };
  const same = (ids: ID[]) => ids.length === selected.length && ids.every((x) => sel.has(x));
  const all = members.map((m) => m.id);
  const present = date ? defaultParticipants(trip, date) : all;
  const preset = (active: boolean) => cn('h-7 px-2.5 text-xs', active && 'bg-accent text-accent-foreground');
  return (
    <div className="grid gap-2.5">
      {!compact && (
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" className={preset(same(all))} onClick={() => onChange(all)}>
            {t('all')}
          </Button>
          {date && present.length !== all.length && (
            <Button size="sm" variant="ghost" className={preset(same(present))} onClick={() => onChange(present)}>
              {t('exp.present_today')}
            </Button>
          )}
          {trip.groups.map((g) => (
            <Button key={g.id} size="sm" variant="ghost" className={preset(same(g.memberIds))} onClick={() => onChange(g.memberIds)}>
              <Icon icon={faUserGroup} className="text-[10px]" />
              {g.name}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className={preset(false)} onClick={() => onChange([])}>
            {t('none')}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <Chip key={m.id} active={sel.has(m.id)} onClick={() => toggle(m.id)} className={compact ? 'h-7 px-2 text-xs' : 'pl-1.5'}>
            {!compact && <Avatar name={m.name} size="sm" kind={m.kind} className={sel.has(m.id) ? 'border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground' : ''} />}
            {m.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}
