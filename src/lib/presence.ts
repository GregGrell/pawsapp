import type { Row } from './store';
import { addDays, today } from './time';

/** Epoch ms for the start of a Qatar day. */
export const dayStart = (day: string) => Date.parse(`${day}T00:00:00+03:00`);

export const REASON_LABEL: Record<string, string> = {
  appointment: 'Appointment',
  end_of_day: 'Finished for the day',
  break: 'Break',
  errand: 'Errand / supplies run',
  other: 'Other',
};

export function latestFor(events: Row[], userId: string): Row | undefined {
  let best: Row | undefined;
  for (const e of events) if (e.user_id === userId && (!best || e.at > best.at)) best = e;
  return best;
}

export function reasonText(e?: Row) {
  if (!e || e.event !== 'out') return '';
  if (e.reason_kind === 'other' || e.reason_kind === 'appointment') return e.reason || REASON_LABEL[e.reason_kind];
  return REASON_LABEL[e.reason_kind] + (e.reason ? ` — ${e.reason}` : '');
}

export type Session = { start: number; end: number; open: boolean; missingOut: boolean };

/** Build on-site sessions for one person from their in/out events. */
export function sessions(events: Row[], userId: string, now = Date.now()): Session[] {
  const list = events.filter((e) => e.user_id === userId).sort((a, b) => a.at.localeCompare(b.at));
  const out: Session[] = [];
  let start: number | null = null;
  for (const e of list) {
    const t = Date.parse(e.at);
    if (e.event === 'in') {
      if (start !== null) {
        // Two "in"s in a row: close the earlier one at the end of its own day (22:00) and flag it.
        const d = today(new Date(start));
        out.push({ start, end: Math.min(t, dayStart(d) + 22 * 3600_000), open: false, missingOut: true });
      }
      start = t;
    } else if (start !== null) {
      out.push({ start, end: t, open: false, missingOut: false });
      start = null;
    }
  }
  if (start !== null) {
    const d = today(new Date(start));
    if (d === today(new Date(now))) out.push({ start, end: now, open: true, missingOut: false });
    else out.push({ start, end: dayStart(d) + 22 * 3600_000, open: false, missingOut: true });
  }
  return out;
}

/** Milliseconds on site per Qatar day, splitting sessions that cross midnight. */
export function msByDay(ss: Session[]) {
  const m: Record<string, number> = {};
  for (const s of ss) {
    let a = s.start;
    while (a < s.end) {
      const d = today(new Date(a));
      const next = Math.min(s.end, dayStart(addDays(d, 1)));
      m[d] = (m[d] ?? 0) + (next - a);
      a = next;
    }
  }
  return m;
}

export const hhmm = (ms: number) => {
  const mins = Math.round(ms / 60000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
};
