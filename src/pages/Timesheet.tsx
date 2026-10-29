import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { Page } from '../components/ui';
import { useProfiles, useTable } from '../lib/hooks';
import { upsert } from '../lib/store';
import { addDays, hourOf, nowHM, shortDate, today } from '../lib/time';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00–22:00

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

  return (
    <Page title="Timesheet" sub={`${day === d ? 'Today' : shortDate(day)}${who !== me.id ? ` · ${staff.find((p) => p.id === who)?.full_name ?? ''}` : ''}`}>
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
          const auto = logs.filter((l) => l.created_by === who && today(new Date(l.created_at)) === day && hourOf(l.created_at) === h);
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
    </Page>
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
