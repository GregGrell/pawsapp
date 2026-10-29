import { useSyncExternalStore, useMemo } from 'react';
import { getState, subscribe, type Row } from './store';
import { addDays, nowHM, today, weekday } from './time';

export function useStore() {
  return useSyncExternalStore(subscribe, getState);
}

export function useTable(name: string): Row[] {
  const s = useStore();
  return s.tables[name] ?? [];
}

export function useProfiles() {
  const list = useTable('profiles');
  return useMemo(() => {
    const byId: Record<string, Row> = {};
    list.forEach((p) => (byId[p.id] = p));
    return { list, byId, name: (id?: string | null) => (id ? byId[id]?.full_name || 'Someone' : '') };
  }, [list]);
}

export const CATEGORIES: { key: string; label: string; bg: string; fg: string }[] = [
  { key: 'visitor', label: 'Visitor', bg: 'var(--visitor-bg)', fg: 'var(--visitor-fg)' },
  { key: 'vet', label: 'Vet', bg: 'var(--vet-bg)', fg: 'var(--vet-fg)' },
  { key: 'airport', label: 'Airport run', bg: 'var(--airport-bg)', fg: 'var(--airport-fg)' },
  { key: 'dropoff', label: 'Drop-off / pick-up', bg: 'var(--dropoff-bg)', fg: 'var(--dropoff-fg)' },
  { key: 'other', label: 'Other', bg: 'var(--other-bg)', fg: 'var(--other-fg)' },
];
export const TASK_STYLE = { label: 'Task', bg: 'var(--task-bg)', fg: 'var(--task-fg)' };

export function catStyle(item: Row) {
  if (item.kind === 'task') return TASK_STYLE;
  return CATEGORIES.find((c) => c.key === item.category) ?? CATEGORIES[4];
}

/** Calendar entries that happen on a given day (one-off, daily, weekly). */
export function occursOn(item: Row, day: string) {
  if (!item.active) return false;
  if (item.repeat === 'none') return item.starts_on === day;
  if (item.starts_on > day) return false;
  if (item.repeat === 'daily') return true;
  if (item.repeat === 'weekly') return weekday(item.starts_on) === weekday(day);
  return false;
}

export function itemsOn(items: Row[], day: string) {
  return items
    .filter((i) => occursOn(i, day))
    .sort((a, b) => (a.at_time ?? '00:00').localeCompare(b.at_time ?? '00:00'));
}

export const hm = (t?: string | null) => (t ? t.slice(0, 5) : '');

/** Appointments whose time has passed and that have no outcome yet (today and the last 7 days). */
export function openCloseOuts(items: Row[], outcomes: Row[]) {
  const d = today();
  const now = nowHM();
  const res: { item: Row; day: string }[] = [];
  for (let i = 7; i >= 0; i--) {
    const day = addDays(d, -i);
    for (const it of items) {
      if (it.kind !== 'appointment' || !it.at_time || !occursOn(it, day)) continue;
      if (it.created_at && today(new Date(it.created_at)) > day) continue;
      if (day === d && hm(it.at_time) > now) continue;
      if (!outcomes.some((o) => o.item_id === it.id && o.occurs_on === day)) res.push({ item: it, day });
    }
  }
  return res;
}

export function money(n: number) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
