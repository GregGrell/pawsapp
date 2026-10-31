import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { Empty, Icon, Page, toast } from '../components/ui';
import { useProfiles, useTable } from '../lib/hooks';
import { hhmm } from '../lib/presence';
import { insert, update, upsert, type Row } from '../lib/store';
import { addDays, hourOf, nowHM, shortDate, timeOf, today } from '../lib/time';

export const DAY_START = 7; // 07:00
export const DAY_END = 18; // 18:00
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => i + DAY_START); // 07:00 … 17:00 rows

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Minutes of [start, end) that fall outside the normal 07:00–18:00 day. End before start means it runs past midnight. */
export function tilMinutes(start: string, end: string) {
  const a = toMin(start);
  let b = toMin(end);
  if (b <= a) b += 1440;
  let inside = 0;
  for (const off of [0, 1440]) {
    const lo = Math.max(a, DAY_START * 60 + off);
    const hi = Math.min(b, DAY_END * 60 + off);
    if (hi > lo) inside += hi - lo;
  }
  return b - a - inside;
}

export default function Timesheet() {
  const { me, isMgmt } = useAuth();
  const { list: people } = useProfiles();
  const entries = useTable('timesheet_entries');
  const logs = useTable('kennel_logs');
  const [day, setDay] = useState(today());
  const [who, setWho] = useState(me.id);
  const editable = who === me.id;
  const d = today();
  const nowH = Number(nowHM().slice(0, 2));
  const staff = people.filter((p) => p.active);
  const dayLogs = logs.filter((l) => l.created_by === who && today(new Date(l.created_at)) === day);

  return (
    <Page title="Timesheet" sub={`${day === d ? 'Today' : shortDate(day)}${who !== me.id ? ` · ${staff.find((p) => p.id === who)?.full_name ?? ''}` : ''} · 07:00–18:00`}>
      <div className="pills">
        {[addDays(d, -2), addDays(d, -1), d].map((x) => (
          <button key={x} className="pill" aria-pressed={x === day} onClick={() => setDay(x)}>
            {x === d ? 'Today' : x === addDays(d, -1) ? 'Yesterday' : shortDate(x)}
          </button>
        ))}
      </div>
      {isMgmt && (
        <label className="field">
          <span>Staff member</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            {staff.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}{p.id === me.id ? ' (you)' : ''}</option>
            ))}
          </select>
        </label>
      )}
      <section className="card tight">
        {HOURS.map((h) => {
          const entry = entries.find((e) => e.user_id === who && e.work_on === day && e.hour === h);
          const auto = dayLogs.filter((l) => hourOf(l.created_at) === h);
          return (
            <HourRow
              key={`${day}-${who}-${h}`}
              hour={h}
              value={entry?.body ?? ''}
              auto={auto.map((a) => a.summary)}
              current={day === d && h === nowH}
              editable={editable}
              onSave={(body) => upsert('timesheet_entries', { user_id: me.id, work_on: day, hour: h, body, updated_at: new Date().toISOString() }, 'user_id,work_on,hour')}
            />
          );
        })}
      </section>
      <p className="note">Write what you did in each hour. Kennel log entries appear under the hour automatically. Saves as you go, even offline.</p>

      <OutOfHours who={who} day={day} editable={editable} offHoursLogs={dayLogs.filter((l) => hourOf(l.created_at) < DAY_START || hourOf(l.created_at) >= DAY_END)} />
    </Page>
  );
}

function OutOfHours({ who, day, editable, offHoursLogs }: { who: string; day: string; editable: boolean; offHoursLogs: Row[] }) {
  const { me, isMgmt } = useAuth();
  const { name } = useProfiles();
  const all = useTable('out_of_hours').filter((o) => o.user_id === who);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(day);
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('20:00');
  const [reason, setReason] = useState('');
  useEffect(() => setDate(day), [day]);

  const counted = all.filter((o) => o.status === 'counted');
  const total = counted.reduce((n, o) => n + o.til_minutes, 0);
  const month = counted.filter((o) => o.work_on.slice(0, 7) === today().slice(0, 7)).reduce((n, o) => n + o.til_minutes, 0);
  const recent = [...all].sort((a, b) => (b.work_on + b.start_time).localeCompare(a.work_on + a.start_time)).slice(0, 15);

  const til = start && end && start !== end ? tilMinutes(start, end) : 0;
  const crosses = start && end && toMin(end) <= toMin(start);
  const ok = til > 0 && reason.trim().length > 0 && date <= today();

  const save = () => {
    insert('out_of_hours', { user_id: me.id, work_on: date, start_time: start, end_time: end, reason: reason.trim(), til_minutes: til, status: 'counted', created_at: new Date().toISOString() });
    setOpen(false);
    setReason('');
    toast(`Logged · ${hhmm(til * 60000)} TIL`);
  };

  return (
    <section className="card">
      <div className="head">
        <h2 className="h">Out of hours · TIL</h2>
        <span style={{ fontSize: 15, fontWeight: 800 }}>{hhmm(total * 60000)}</span>
      </div>
      <span className="t13">Time in lieu accrued{who !== me.id ? ` by ${name(who)}` : ''}: {hhmm(month * 60000)} this month · {hhmm(total * 60000)} in total</span>

      {offHoursLogs.length > 0 && (
        <div className="banner amber" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: 12 }}>
          <strong className="warn">Kennel log outside 07:00–18:00 on this day</strong>
          {offHoursLogs.map((l) => <span key={l.id} className="t13">{timeOf(l.created_at)} · {l.summary}</span>)}
          {editable && <span className="t13">Log the time below if you'd like it counted as TIL.</span>}
        </div>
      )}

      {recent.length === 0 && <Empty>No out-of-hours time logged yet.</Empty>}
      {recent.map((o) => (
        <div key={o.id} className="row" style={{ alignItems: 'center', opacity: o.status === 'rejected' ? 0.55 : 1 }}>
          <div className="grow">
            <span className="t15">{shortDate(o.work_on)} · {o.start_time.slice(0, 5)}–{o.end_time.slice(0, 5)}</span>
            <span className="t14">{o.reason}</span>
            {o.status === 'rejected' && <span className="bad">Not counted{o.decided_by ? ` · ${name(o.decided_by)}` : ''}</span>}
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', textDecoration: o.status === 'rejected' ? 'line-through' : 'none' }}>+{hhmm(o.til_minutes * 60000)}</span>
          {isMgmt && (
            <button className="btn link sm" style={{ color: o.status === 'rejected' ? 'var(--blue)' : 'var(--red)' }}
              onClick={() => update('out_of_hours', { id: o.id }, { status: o.status === 'rejected' ? 'counted' : 'rejected', decided_by: me.id })}>
              {o.status === 'rejected' ? 'Restore' : 'Reject'}
            </button>
          )}
        </div>
      ))}

      {editable && !open && (
        <button className="btn outline full" onClick={() => setOpen(true)}>
          <Icon name="plus" size={18} color="var(--blue)" width={2.2} /> Out of hours
        </button>
      )}
      {editable && open && (
        <div className="panel">
          <strong style={{ fontSize: 15 }}>Log out-of-hours work</strong>
          <label className="field"><span>Date</span><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
          <div className="grid2">
            <label className="field"><span>Start</span><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="field"><span>End</span><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          {crosses && <span className="note">Ends after midnight, on the next day.</span>}
          <label className="field">
            <span>Reason · required</span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Airport cargo drop, 2 dogs to UK" />
          </label>
          <span className={til > 0 ? 'ok' : 'warn'}>
            {til > 0
              ? `Counts as ${hhmm(til * 60000)} TIL${til < (toMin(end) - toMin(start) + (crosses ? 1440 : 0)) ? ' (time inside 07:00–18:00 isn\'t counted)' : ''}`
              : 'This time is inside the normal 07:00–18:00 day, so it adds no TIL.'}
          </span>
          <button className="btn" disabled={!ok} onClick={save}>{ok ? `Log ${hhmm(til * 60000)} TIL` : reason.trim() ? 'Choose times outside 07:00–18:00' : 'Add a reason'}</button>
          <button className="btn link" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}
    </section>
  );
}

function HourRow({ hour, value, auto, current, editable, onSave }: { hour: number; value: string; auto: string[]; current: boolean; editable: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const label = `${String(hour).padStart(2, '0')}:00`;
  return (
    <div className="row" style={current ? { background: 'var(--blue-wash)', margin: '0 -16px', padding: '10px 16px' } : undefined}>
      <span className="time">{label}</span>
      <div className="grow">
        {editable ? (
          <textarea
            aria-label={`What you did from ${label}`}
            className="input"
            rows={v ? 2 : 1}
            style={{ minHeight: 44, padding: '10px 12px', resize: 'vertical' }}
            value={v}
            placeholder={current ? 'What are you doing this hour?' : ''}
            onChange={(e) => setV(e.target.value)}
            onBlur={() => v !== value && onSave(v.trim())}
          />
        ) : (
          <span className="t14">{v || '—'}</span>
        )}
        {auto.map((a, i) => (
          <span key={i} className="t13">• {a}</span>
        ))}
      </div>
    </div>
  );
}
