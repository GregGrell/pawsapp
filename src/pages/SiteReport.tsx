import { useState } from 'react';
import { useAuth } from '../auth';
import { Empty, Icon, Page, toast } from '../components/ui';
import { useProfiles, useTable } from '../lib/hooks';
import { dayStart, hhmm, msByDay, reasonText, sessions } from '../lib/presence';
import { addDays, dayLabel, shortDate, timeOf, today, weekday } from '../lib/time';

export default function SiteReport() {
  const { isMgmt } = useAuth();
  const { list } = useProfiles();
  const events = useTable('site_presence');
  const ooh = useTable('out_of_hours');
  const d = today();
  const thisWeek = addDays(d, -weekday(d));
  const [week, setWeek] = useState(thisWeek);
  const [open, setOpen] = useState<string | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const from = dayStart(week);
  const to = dayStart(addDays(week, 7));

  if (!isMgmt) return <Page title="Time worked" back="Back"><Empty>Only management can see this report.</Empty></Page>;

  const people = list.filter((p) => p.active || events.some((e) => e.user_id === p.id));
  const rows = people
    .map((p) => {
      const ss = sessions(events, p.id).filter((s) => s.end > from && s.start < to);
      const byDay = msByDay(ss);
      const total = days.reduce((n, x) => n + (byDay[x] ?? 0), 0);
      const homeByDay = msByDay(ss.filter((x) => x.remote));
      const home = days.reduce((n, x) => n + (homeByDay[x] ?? 0), 0);
      const trips = events
        .filter((e) => e.user_id === p.id && e.event === 'out' && Date.parse(e.at) >= from && Date.parse(e.at) < to)
        .sort((a, b) => a.at.localeCompare(b.at));
      const tilList = ooh.filter((o) => o.user_id === p.id && o.status === 'counted' && o.work_on >= week && o.work_on < addDays(week, 7));
      const til = tilList.reduce((n, o) => n + o.til_minutes, 0);
      return { p, ss, byDay, homeByDay, total, home, trips, tilList, til, missing: ss.filter((s) => s.missingOut).length };
    })
    .filter((r) => r.total > 0 || r.til > 0 || r.p.role === 'staff')
    .sort((a, b) => b.total - a.total);

  const exportCsv = () => {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Name', 'Date', 'Where', 'In', 'Out', 'Hours', 'Note'].map(esc).join(',')];
    for (const r of rows)
      for (const s of r.ss) {
        const day = today(new Date(s.start));
        lines.push([r.p.full_name, day, s.remote ? 'Home' : 'On site', timeOf(new Date(s.start).toISOString()), s.open ? 'still signed in' : timeOf(new Date(s.end).toISOString()), (Math.round(((s.end - s.start) / 3600000) * 100) / 100).toFixed(2), s.missingOut ? 'No sign-out recorded (counted to 22:00)' : ''].map(esc).join(','));
      }
    for (const r of rows) for (const o of r.tilList) lines.push([r.p.full_name, o.work_on, 'Out of hours', o.start_time.slice(0, 5), o.end_time.slice(0, 5), (o.til_minutes / 60).toFixed(2), `Out of hours (TIL): ${o.reason}`].map(esc).join(','));
    const h2 = (ms: number) => (Math.round((ms / 3600000) * 100) / 100).toFixed(2);
    for (const r of rows) lines.push([r.p.full_name, 'WEEK TOTAL', 'On site', '', '', h2(r.total - r.home), ''].map(esc).join(','));
    for (const r of rows) if (r.home) lines.push([r.p.full_name, 'WEEK TOTAL', 'Home', '', '', h2(r.home), ''].map(esc).join(','));
    for (const r of rows) lines.push([r.p.full_name, 'WEEK TIL ACCRUED', '', '', '', (r.til / 60).toFixed(2), ''].map(esc).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
    a.download = `time-on-site_${week}.csv`;
    a.click();
    toast('Report downloaded');
  };

  return (
    <Page title="Time on site" sub={`Week of ${shortDate(week)}`} back="Back">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn ghost sm" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}><Icon name="back" /></button>
        <span className="t15" style={{ flex: 1, textAlign: 'center' }}>{shortDate(week)} – {shortDate(addDays(week, 6))}</span>
        <button className="btn ghost sm" aria-label="Next week" disabled={week >= thisWeek} onClick={() => setWeek(addDays(week, 7))}><Icon name="chevron" /></button>
      </div>

      {!rows.length && <section className="card"><Empty>No sign-ins this week.</Empty></section>}

      {rows.map((r) => (
        <section key={r.p.id} className="card tight">
          <div className="head">
            <span className="t15">{r.p.full_name}</span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{hhmm(r.total)}</span>
          </div>
          {r.home > 0 && <span className="t13">{hhmm(r.total - r.home)} on site · <span style={{ color: 'var(--blue-dark)', fontWeight: 700 }}>{hhmm(r.home)} from home</span></span>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, padding: '8px 0' }}>
            {days.map((x) => {
              const { dow } = dayLabel(x);
              const ms = r.byDay[x] ?? 0;
              const h = ms / 3600000;
              return (
                <div key={x} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div aria-hidden="true" style={{ height: 48, width: '70%', display: 'flex', alignItems: 'flex-end', background: 'var(--line-2)', borderRadius: 4 }}>
                    <div style={{ width: '100%', height: `${Math.min(100, (h / 12) * 100)}%`, borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ flex: (r.homeByDay[x] ?? 0) / (ms || 1), background: '#7FB3D5' }} />
                      <div style={{ flex: 1 - (r.homeByDay[x] ?? 0) / (ms || 1), background: 'var(--blue)' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{dow.slice(0, 2)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{ms ? (Math.round(h * 10) / 10).toString() : '–'}</span>
                </div>
              );
            })}
          </div>
          {r.til > 0 && (
            <span className="t14"><b>+{hhmm(r.til * 60000)} TIL</b> out of hours · {r.tilList.map((o) => `${shortDate(o.work_on).slice(0, 3)} ${o.start_time.slice(0, 5)}–${o.end_time.slice(0, 5)} ${o.reason}`).join(' · ')}</span>
          )}
          {r.missing > 0 && <span className="warn">{r.missing} day{r.missing > 1 ? 's' : ''} with no sign-out — counted to 22:00</span>}
          {r.trips.length > 0 && (
            <button className="btn link sm" style={{ alignSelf: 'flex-start', padding: 0, color: 'var(--blue)' }} onClick={() => setOpen(open === r.p.id ? null : r.p.id)}>
              {open === r.p.id ? 'Hide' : 'Show'} sign-outs ({r.trips.length})
            </button>
          )}
          {open === r.p.id && r.trips.map((t) => (
            <div key={t.id} className="row">
              <span className="time" style={{ width: 86 }}>{shortDate(today(new Date(t.at))).slice(0, 6)} {timeOf(t.at)}</span>
              <span className="t14 grow">{reasonText(t)}</span>
            </div>
          ))}
        </section>
      ))}

      {rows.length > 0 && (
        <button className="btn" onClick={exportCsv}><Icon name="download" size={18} color="#fff" width={2.2} /> Download CSV</button>
      )}
      <p className="note">Hours count from signing in to signing out. Time worked from home shows in the lighter blue and is listed separately in the CSV. Time away (appointments, breaks, errands) isn't counted. Bars are scaled to a 12-hour day.</p>
    </Page>
  );
}
