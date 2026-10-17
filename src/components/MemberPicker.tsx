import { defaultParticipants } from '../domain/trip';
import type { ID, Trip } from '../domain/types';
import { useT } from '../i18n';
import { Avatar, Chip } from './ui';

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
  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Chip className="!px-2.5 !py-1 !text-xs" active={same(all)} onClick={() => onChange(all)}>
            {t('all')}
          </Chip>
          {date && present.length !== all.length && (
            <Chip className="!px-2.5 !py-1 !text-xs" active={same(present)} onClick={() => onChange(present)}>
              {t('exp.present_today')}
            </Chip>
          )}
          {trip.groups.map((g) => (
            <Chip key={g.id} className="!px-2.5 !py-1 !text-xs" active={same(g.memberIds)} onClick={() => onChange(g.memberIds)}>
              👥 {g.name}
            </Chip>
          ))}
          <Chip className="!px-2.5 !py-1 !text-xs" onClick={() => onChange([])}>
            {t('none')}
          </Chip>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <Chip key={m.id} active={sel.has(m.id)} onClick={() => toggle(m.id)} className={compact ? '!px-2 !py-1 !text-xs' : '!pl-1'}>
            {!compact && <Avatar name={m.name} id={m.id} size="sm" kind={m.kind} />}
            {m.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}
