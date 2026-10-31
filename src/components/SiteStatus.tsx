import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { catStyle, hm, itemsOn, useProfiles, useTable } from '../lib/hooks';
import { latestFor, reasonText } from '../lib/presence';
import { insert } from '../lib/store';
import { nowHM, shortDate, timeOf, today } from '../lib/time';
import { Icon, toast } from './ui';

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Everyone's own on-site card: arrive / leave with a reason. */
export function SiteStatus() {
  const { me } = useAuth();
  const events = useTable('site_presence');
  const items = useTable('calendar_items');
  const last = latestFor(events, me.id);
  const d = today();
  const [leaving, setLeaving] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [leftAt, setLeftAt] = useState('17:00');

  const arrive = () => {
    insert('site_presence', { user_id: me.id, event: 'in', at: new Date().toISOString(), reason: '', added_by: me.id, created_at: new Date().toISOString() });
    toast('Signed in on site');
  };

  // Still signed in from an earlier day
  if (last?.event === 'in' && today(new Date(last.at)) < d) {
    const day = today(new Date(last.at));
    const minOut = timeOf(last.at);
    const ok = leftAt > minOut;
    return (
      <section className="card" style={{ borderColor: 'var(--amber-line)', background: 'var(--amber-tint)' }}>
        <strong className="warn" style={{ fontSize: 15 }}>You didn't sign out on {shortDate(day)}</strong>
        <span className="t14">You signed in at {minOut}. What time did you leave?</span>
        <div className="btns">
          <input className="input" type="time" value={leftAt} min={minOut} onChange={(e) => setLeftAt(e.target.value)} aria-label="Time you left" />
          <button className="btn" disabled={!ok} onClick={() => {
            insert('site_presence', { user_id: me.id, event: 'out', at: new Date(`${day}T${leftAt}:00+03:00`).toISOString(), reason_kind: 'end_of_day', reason: 'added next day', added_by: me.id, created_at: new Date().toISOString() });
            toast('Saved');
          }}>Save</button>
        </div>
        {!ok && <span className="bad">Must be after {minOut}.</span>}
      </section>
    );
  }

  const onSite = last?.event === 'in';

  if (!onSite)
    return (
      <section className="card" style={{ borderColor: 'var(--line)' }}>
        <div className="head">
          <div className="grow">
            <span className="h">On site</span>
            <span className="t15">{last && today(new Date(last.at)) === d ? `Off site since ${timeOf(last.at)} · ${reasonText(last)}` : "You're not signed in"}</span>
          </div>
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, background: '#9AA5A0' }} />
        </div>
        <button className="btn full" style={{ minHeight: 56, fontSize: 17 }} onClick={arrive}>
          <Icon name="home" size={20} color="#fff" width={2.2} /> {last && today(new Date(last.at)) === d ? "I'm back on site" : 'Arrive on site'}
        </button>
      </section>
    );

  // On site: offer leave with reasons; appointments due within the hour come first
  const now = toMin(nowHM());
  const upcoming = itemsOn(items, d).filter((i) => i.kind === 'appointment' && i.at_time && toMin(hm(i.at_time)) >= now - 30 && toMin(hm(i.at_time)) <= now + 60);
  const fixed: [string, string][] = [['end_of_day', 'Finished for the day'], ['break', 'Break'], ['errand', 'Errand / supplies run'], ['other', 'Other']];
  const chosenAppt = upcoming.find((u) => `appt:${u.id}` === choice);
  const canLeave = !!choice && (choice !== 'other' || other.trim().length > 0);

  const leave = () => {
    const base = { user_id: me.id, event: 'out', at: new Date().toISOString(), added_by: me.id, created_at: new Date().toISOString() };
    if (chosenAppt) insert('site_presence', { ...base, reason_kind: 'appointment', reason: `${hm(chosenAppt.at_time)} ${catStyle(chosenAppt).label} — ${chosenAppt.title}`, item_id: chosenAppt.id });
    else insert('site_presence', { ...base, reason_kind: choice, reason: choice === 'other' ? other.trim() : '' });
    setLeaving(false); setChoice(null); setOther('');
    toast('Signed out of site');
  };

  return (
    <section className="card" style={{ borderColor: '#9BD1AE', background: '#F1FAF4' }}>
      <div className="head">
        <div className="grow">
          <span className="h" style={{ color: '#166534' }}>On site</span>
          <span className="t15">Since {timeOf(last!.at)}</span>
        </div>
        <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, background: '#16A34A' }} />
      </div>
      {!leaving && <button className="btn ghost full" onClick={() => setLeaving(true)}>Leave site</button>}
      {leaving && (
        <div className="panel" style={{ background: '#fff', border: '1px solid var(--line)' }}>
          <strong style={{ fontSize: 15 }}>Why are you leaving?</strong>
          {upcoming.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcoming.map((u) => {
                const c = catStyle(u);
                const on = choice === `appt:${u.id}`;
                return (
                  <button key={u.id} type="button" aria-pressed={on} onClick={() => setChoice(`appt:${u.id}`)}
                    style={{ minHeight: 52, borderRadius: 12, border: `2px solid ${on ? 'var(--blue)' : 'var(--field)'}`, background: on ? 'var(--blue-wash)' : '#fff', padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', cursor: 'pointer' }}>
                    <span className="chip" style={{ background: c.bg, color: c.fg }}>{c.label}</span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{hm(u.at_time)} {u.title}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="pills">
            {fixed.map(([k, l]) => (
              <button key={k} type="button" className="pill" aria-pressed={choice === k} onClick={() => setChoice(k)}>{l}</button>
            ))}
          </div>
          {choice === 'other' && <input className="input" placeholder="Where are you going?" value={other} onChange={(e) => setOther(e.target.value)} />}
          <button className="btn" disabled={!canLeave} onClick={leave}>{canLeave ? 'Sign out of site' : 'Choose a reason'}</button>
          <button className="btn link" onClick={() => { setLeaving(false); setChoice(null); }}>Cancel</button>
        </div>
      )}
    </section>
  );
}

/** Management: who is on site right now. */
export function TeamStatus() {
  const { list, name } = useProfiles();
  const events = useTable('site_presence');
  const leave = useTable('leave_requests');
  const sick = useTable('sick_reports');
  const d = today();
  const people = list.filter((p) => p.active && (p.role === 'staff' || events.some((e) => e.user_id === p.id && today(new Date(e.at)) === d)));
  if (!people.length) return null;

  const rows = people.map((p) => {
    const last = latestFor(events, p.id);
    const lastToday = last && today(new Date(last.at)) === d;
    const isSick = sick.some((s) => s.user_id === p.id && s.sick_on === d);
    const onLeave = leave.some((l) => l.user_id === p.id && l.status === 'approved' && l.start_on <= d && l.end_on >= d);
    let state: 'on' | 'off' | 'none' = 'none';
    let text = 'Not in yet today';
    if (last?.event === 'in' && (lastToday || today(new Date(last.at)) < d)) {
      state = 'on';
      text = lastToday ? `On site since ${timeOf(last.at)}` : `Still signed in from ${shortDate(today(new Date(last.at)))}`;
    } else if (lastToday && last?.event === 'out') {
      state = 'off';
      text = `${reasonText(last)} · left ${timeOf(last.at)}`;
    } else if (isSick) { state = 'off'; text = 'Off sick'; }
    else if (onLeave) { state = 'off'; text = 'On leave'; }
    return { p, state, text };
  }).sort((a, b) => ({ on: 0, off: 1, none: 2 }[a.state] - { on: 0, off: 1, none: 2 }[b.state]));

  const count = rows.filter((r) => r.state === 'on').length;
  return (
    <section className="card tight" aria-label="Team on site">
      <div className="head" style={{ paddingBottom: 6 }}>
        <h2 className="h">Team · {count} on site</h2>
        <Link to="/site-report" style={{ fontWeight: 600, fontSize: 14 }}>Weekly report</Link>
      </div>
      {rows.map(({ p, state, text }) => (
        <div key={p.id} className="row" style={{ alignItems: 'center' }}>
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, flexShrink: 0, background: state === 'on' ? '#16A34A' : state === 'off' ? 'var(--amber)' : '#C9D2CE' }} />
          <div className="grow">
            <span className="t15">{name(p.id)}</span>
            <span className="t13" style={state === 'off' ? { color: 'var(--amber)', fontWeight: 600 } : undefined}>
              <span className="sr-only">{state === 'on' ? 'On site. ' : state === 'off' ? 'Off site. ' : ''}</span>{text}
            </span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, background: state === 'on' ? '#E6F4EA' : state === 'off' ? 'var(--amber-tint)' : 'var(--line-2)', color: state === 'on' ? '#166534' : state === 'off' ? 'var(--amber)' : 'var(--muted)' }}>
            {state === 'on' ? 'ON' : 'OFF'}
          </span>
        </div>
      ))}
    </section>
  );
}

