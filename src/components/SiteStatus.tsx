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
  const isVol = me.role === 'volunteer';

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
      {isVol && (
        <button className="btn ghost full" onClick={() => {
          insert('site_presence', { user_id: me.id, event: 'out', at: new Date().toISOString(), reason_kind: 'signed_out', reason: '', added_by: me.id, created_at: new Date().toISOString() });
          toast('Signed out — thank you!');
        }}>Sign out of site</button>
      )}
      {!isVol && !leaving && <button className="btn ghost full" onClick={() => setLeaving(true)}>Leave site</button>}
      {!isVol && leaving && (
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

/** Management: who is on site today — staff, volunteers and QR visitors. Resets at midnight. */
export function TeamStatus() {
  const { list, name } = useProfiles();
  const events = useTable('site_presence');
  const leave = useTable('leave_requests');
  const sick = useTable('sick_reports');
  const visitors = useTable('visitors');
  const d = today();
  const todays = events.filter((e) => today(new Date(e.at)) === d);
  const people = list.filter((p) => p.active && (p.role === 'staff' || todays.some((e) => e.user_id === p.id)));

  type R = { key: string; label: string; sub?: string; state: 'on' | 'off' | 'none'; text: string; vol?: boolean; visitor?: boolean };
  const rows: R[] = people.map((p) => {
    const last = latestFor(todays, p.id);
    const isSick = sick.some((s) => s.user_id === p.id && s.sick_on === d);
    const onLeave = leave.some((l) => l.user_id === p.id && l.status === 'approved' && l.start_on <= d && l.end_on >= d);
    let state: R['state'] = 'none';
    let text = 'Not in yet today';
    if (last?.event === 'in') { state = 'on'; text = `On site since ${timeOf(last.at)}`; }
    else if (last?.event === 'out') { state = 'off'; text = p.role === 'volunteer' ? `Left ${timeOf(last.at)}` : `${reasonText(last)} · left ${timeOf(last.at)}`; }
    else if (isSick) { state = 'off'; text = 'Off sick'; }
    else if (onLeave) { state = 'off'; text = 'On leave'; }
    return { key: p.id, label: name(p.id), sub: p.role === 'volunteer' ? 'Volunteer' : undefined, state, text, vol: p.role === 'volunteer' };
  });
  for (const v of visitors.filter((v) => today(new Date(v.signed_in_at)) === d)) {
    rows.push({
      key: v.id, label: `${v.name}${v.guests ? ` + ${v.guests}` : ''}`, sub: v.kind === 'volunteer' ? 'Visiting volunteer' : 'Visitor', visitor: true,
      state: v.signed_out_at ? 'off' : 'on',
      text: v.signed_out_at ? `In ${timeOf(v.signed_in_at)} · left ${timeOf(v.signed_out_at)}` : `On site since ${timeOf(v.signed_in_at)}`,
    });
  }
  if (!rows.length) return null;
  const order = { on: 0, off: 1, none: 2 };
  rows.sort((a, b) => order[a.state] - order[b.state] || Number(!!a.visitor) - Number(!!b.visitor));

  const onCount = rows.filter((r) => r.state === 'on').reduce((n, r) => n + 1 + (r.visitor ? Number(r.label.match(/\+ (\d+)$/)?.[1] ?? 0) : 0), 0);
  const dot = (r: R) => (r.state === 'on' ? (r.vol || r.visitor ? '#86D7A2' : '#16A34A') : r.state === 'off' ? 'var(--amber)' : '#C9D2CE');
  const badgeBg = (r: R) => (r.state === 'on' ? (r.vol || r.visitor ? '#F0FAF3' : '#E6F4EA') : r.state === 'off' ? 'var(--amber-tint)' : 'var(--line-2)');
  return (
    <section className="card tight" aria-label="On site today">
      <div className="head" style={{ paddingBottom: 6 }}>
        <h2 className="h">On site · {onCount}</h2>
        <Link to="/site-report" style={{ fontWeight: 600, fontSize: 14 }}>Weekly report</Link>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="row" style={{ alignItems: 'center' }}>
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, flexShrink: 0, background: dot(r), border: r.visitor && r.state === 'on' ? '1.5px solid #16A34A' : undefined }} />
          <div className="grow">
            <span className="t15">{r.label}{r.sub && <span className="t13" style={{ fontWeight: 500 }}> · {r.sub}</span>}</span>
            <span className="t13" style={r.state === 'off' && !r.visitor ? { color: 'var(--amber)', fontWeight: 600 } : undefined}>
              <span className="sr-only">{r.state === 'on' ? 'On site. ' : r.state === 'off' ? 'Off site. ' : ''}</span>{r.text}
            </span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, background: badgeBg(r), color: r.state === 'on' ? '#166534' : r.state === 'off' ? 'var(--amber)' : 'var(--muted)' }}>
            {r.state === 'on' ? 'ON' : 'OFF'}
          </span>
        </div>
      ))}
    </section>
  );
}
