import type { Row, Tables } from './store';
import { itemsOn, hm } from './hooks';
import { today, timeOf } from './time';

export type DayReport = {
  day: string;
  feeds: number;
  exercised: number;
  cleaned: number;
  doses: number;
  tasksDone: number;
  tasksTotal: number;
  apptsDue: number;
  apptsClosed: number;
  openAppts: string[];
  incidents: number;
  maintenanceOpen: number;
  visitors: number;
  spent: number;
  log: { time: string; who: string; text: string }[];
  outcomes: { title: string; outcome: string; note: string }[];
};

const inDay = (iso: string, day: string) => today(new Date(iso)) === day;

export function buildReport(t: Tables, day: string, nameOf: (id?: string) => string): DayReport {
  const logs = (t.kennel_logs ?? []).filter((l) => inDay(l.created_at, day)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const items = itemsOn(t.calendar_items ?? [], day);
  const tasks = items.filter((i) => i.kind === 'task');
  const appts = items.filter((i) => i.kind === 'appointment');
  const comps = (t.task_completions ?? []).filter((c) => c.occurs_on === day && c.status === 'done');
  const outs = (t.appointment_outcomes ?? []).filter((o) => o.occurs_on === day);
  const nowHm = timeOf(new Date().toISOString());
  const due = appts.filter((a) => a.at_time && (day < today() || hm(a.at_time) <= nowHm));
  const sum = (a: string) => logs.filter((l) => l.action === a).reduce((n, l) => n + (a === 'fed' ? 1 : (l.items?.length ?? 0)), 0);
  return {
    day,
    feeds: sum('fed'),
    exercised: sum('exercised'),
    cleaned: sum('cleaned'),
    doses: sum('meds'),
    tasksDone: tasks.filter((x) => comps.some((c) => c.item_id === x.id)).length,
    tasksTotal: tasks.length,
    apptsDue: due.length,
    apptsClosed: due.filter((a) => outs.some((o) => o.item_id === a.id)).length,
    openAppts: due.filter((a) => !outs.some((o) => o.item_id === a.id)).map((a) => a.title),
    incidents: (t.incidents ?? []).filter((i) => inDay(i.created_at, day)).length,
    maintenanceOpen: (t.maintenance_issues ?? []).filter((m) => m.status !== 'fixed').length,
    visitors: (t.visitors ?? []).filter((v) => inDay(v.signed_in_at, day)).reduce((n, v) => n + 1 + (v.guests ?? 0), 0),
    spent: (t.petty_cash_spends ?? []).filter((s) => s.spent_on === day).reduce((n, s) => n + Number(s.amount), 0),
    log: logs.map((l) => ({ time: timeOf(l.created_at), who: nameOf(l.created_by), text: l.summary })),
    outcomes: outs.map((o) => {
      const it = (t.calendar_items ?? []).find((i: Row) => i.id === o.item_id);
      return { title: it?.title ?? 'Appointment', outcome: o.outcome, note: o.note };
    }),
  };
}

export function reportLines(r: DayReport) {
  return [
    ['Feeds logged', String(r.feeds)],
    ['Animals exercised', String(r.exercised)],
    ['Kennels cleaned', String(r.cleaned)],
    ['Medication doses given', String(r.doses)],
    ['Tasks done', `${r.tasksDone} of ${r.tasksTotal}`],
    ['Appointments closed out', r.apptsDue ? `${r.apptsClosed} of ${r.apptsDue} due` : 'None due'],
    ['Incidents', String(r.incidents)],
    ['Maintenance outstanding', String(r.maintenanceOpen)],
  ] as [string, string][];
}
