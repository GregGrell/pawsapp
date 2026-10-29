import { useState } from 'react';
import { useAuth } from '../auth';
import { OUTCOME_LABEL } from '../components/CloseOut';
import { Empty, Page, toast } from '../components/ui';
import { useProfiles, useStore, useTable } from '../lib/hooks';
import { buildReport, reportLines } from '../lib/report';
import { insert } from '../lib/store';
import { addDays, longDate, shortDate, timeOf, today } from '../lib/time';

export default function EodCheck() {
  const { me } = useAuth();
  const s = useStore();
  const { name } = useProfiles();
  const checks = useTable('eod_checklist_items');
  const signoffs = useTable('eod_signoffs');
  const d = today();
  const [day, setDay] = useState(d);
  const signed = signoffs.find((x) => x.work_on === day);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const report = buildReport(s.tables, day, name);
  const allTicked = checks.every((c) => ticked[c.id]);
  const canSign = allTicked || notes.trim().length > 0;

  const sign = () => {
    insert('eod_signoffs', {
      work_on: day, signed_by: me.id, signed_at: new Date().toISOString(),
      checked: checks.filter((c) => ticked[c.id]).map((c) => c.label), notes: notes.trim(), report,
    });
    toast('Signed off — report sent to management');
  };

  return (
    <Page title="End-of-day check" sub={longDate(day)} back="Back">
      <div className="pills">
        {Array.from({ length: 5 }, (_, i) => addDays(d, -i)).map((x) => {
          const done = signoffs.some((so) => so.work_on === x);
          return (
            <button key={x} className="pill" aria-pressed={x === day} onClick={() => setDay(x)}>
              {x === d ? 'Today' : shortDate(x)} {done ? '✓' : ''}
            </button>
          );
        })}
      </div>

      {signed ? (
        <section className="card blue">
          <strong style={{ color: 'var(--blue-dark)' }}>Signed off by {name(signed.signed_by)} at {timeOf(signed.signed_at)}</strong>
          {signed.checked?.length > 0 && <span className="t14">Checked: {signed.checked.join(' · ')}</span>}
          {signed.notes && <span className="t14">Notes: {signed.notes}</span>}
        </section>
      ) : (
        <section className="card">
          <h2 className="h">Checklist</h2>
          <div className="listbox" style={{ maxHeight: 'none' }}>
            {checks.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={!!ticked[c.id]} onChange={() => setTicked({ ...ticked, [c.id]: !ticked[c.id] })} />
                {c.label}
              </label>
            ))}
          </div>
          <label className="field">
            <span>Notes for management{allTicked ? ' · optional' : ' · needed if anything is unticked'}</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Fan in C3 not working, moved Mochi to C6" />
          </label>
          <button className="btn dark" disabled={!canSign} onClick={sign}>{canSign ? 'Sign off and send report' : 'Tick everything or add a note'}</button>
        </section>
      )}

      <section className="card">
        <h2 className="h">Report</h2>
        <div style={{ borderRadius: 12, background: 'var(--soft)', border: '1px solid var(--line)', padding: '4px 12px' }}>
          {reportLines(report).map(([k, v]) => (
            <div key={k} className="head" style={{ minHeight: 40, borderBottom: '1px solid var(--line-2)' }}>
              <span className="t14">{k}</span><span style={{ fontSize: 14, fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
        {report.openAppts.length > 0 && <span className="warn">Not closed out: {report.openAppts.join(', ')}</span>}
      </section>

      {report.outcomes.length > 0 && (
        <section className="card tight">
          <h2 className="h" style={{ paddingBottom: 6 }}>Appointments</h2>
          {report.outcomes.map((o, i) => (
            <div key={i} className="row"><div className="grow"><span className="t15">{o.title}</span><span className="t13">{OUTCOME_LABEL[o.outcome]}{o.note ? ` · ${o.note}` : ''}</span></div></div>
          ))}
        </section>
      )}

      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Kennel log</h2>
        {!report.log.length && <Empty>Nothing logged.</Empty>}
        {report.log.map((l, i) => (
          <div key={i} className="row">
            <span className="time">{l.time}</span>
            <div className="grow"><span className="t14">{l.text}</span><span className="t13">{l.who}</span></div>
          </div>
        ))}
      </section>
    </Page>
  );
}
