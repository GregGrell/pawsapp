import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { SyncBadge } from '../App';
import KennelLog from '../components/KennelLog';
import TaskList from '../components/TaskList';
import CloseOut, { OUTCOME_COLOR, OUTCOME_LABEL } from '../components/CloseOut';
import { Empty, Icon, PhotoPicker, StoredImage, toast } from '../components/ui';
import { catStyle, hm, itemsOn, openCloseOuts, useProfiles, useStore, useTable } from '../lib/hooks';
import { buildReport, reportLines } from '../lib/report';
import { insert, queueUpload, update } from '../lib/store';
import { longDate, minusMinutes, nowHM, shortDate, timeOf, today } from '../lib/time';

export default function Today() {
  const { me, isMgmt } = useAuth();
  const s = useStore();
  const { name } = useProfiles();
  const d = today();
  const now = nowHM();
  const items = useTable('calendar_items');
  const outcomes = useTable('appointment_outcomes');
  const incidents = useTable('incidents');
  const animals = useTable('animals');
  const vaccines = useTable('vaccines_due');
  const leave = useTable('leave_requests');
  const sick = useTable('sick_reports');
  const visitors = useTable('visitors');
  const signoffs = useTable('eod_signoffs');
  const ts = useTable('timesheet_entries');
  const [closing, setClosing] = useState<string | null>(null);

  const appts = itemsOn(items, d).filter((i) => i.kind === 'appointment');
  const pendingClose = openCloseOuts(items, outcomes);
  const upcoming = appts.find((a) => a.at_time && hm(a.at_time) > now && minusMinutes(hm(a.at_time), 60) <= now);
  const openIncidents = incidents.filter((i) => !i.acknowledged_at);
  const offToday = leave.filter((l) => l.status === 'approved' && l.start_on <= d && l.end_on >= d);
  const sickToday = sick.filter((x) => x.sick_on === d);
  const onSite = visitors.filter((v) => !v.signed_out_at && today(new Date(v.signed_in_at)) === d);
  const signed = signoffs.find((x) => x.work_on === d);
  const report = buildReport(s.tables, d, name);
  const myHours = ts.filter((t) => t.user_id === me.id && t.work_on === d && t.body.trim()).length;

  return (
    <>
      <header className="top">
        <div className="top-row">
          <div className="brand">
            <img src="./heart.png" alt="" />
            <span><span className="p">PAWS</span><span className="a">app</span></span>
          </div>
          <SyncBadge />
        </div>
        <div className="top-row" style={{ alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h1 className="title">Today</h1>
            <span className="sub">{longDate(d)}</span>
          </div>
          <span className="sync">{me.full_name.split(' ')[0]} · {isMgmt ? 'Management' : 'Staff'}</span>
        </div>
      </header>

      <main className="main">
        {isMgmt &&
          openIncidents.map((i) => (
            <section key={i.id} className="banner red" aria-label="Incident alert">
              <Icon name="alert" size={24} color="#fff" width={2} />
              <div className="grow">
                <strong style={{ fontSize: 15 }}>Incident · {timeOf(i.created_at)} {today(new Date(i.created_at)) !== d ? shortDate(today(new Date(i.created_at))) : ''}</strong>
                <span style={{ fontSize: 14 }}>{i.description}{i.location ? ` — ${i.location}` : ''} · {name(i.reported_by)}</span>
              </div>
              <Link to="/incidents" className="btn sm" style={{ background: '#fff', color: 'var(--red-strong)' }}>View</Link>
            </section>
          ))}

        {!isMgmt && (
          <Link to="/incidents" className="btn danger full" style={{ minHeight: 48 }}>
            <Icon name="alert" size={18} color="var(--red-strong)" width={2} /> Report an incident
          </Link>
        )}

        {upcoming && (
          <section className="banner purple" aria-label="Upcoming reminder">
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--vet-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="clock" size={20} color="#fff" />
            </div>
            <div className="grow">
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--vet-fg)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Within the hour · {catStyle(upcoming).label}</span>
              <span className="t15">{hm(upcoming.at_time)} {upcoming.title}</span>
            </div>
          </section>
        )}

        {pendingClose.length > 0 && (
          <section className="banner amber">
            <div className="grow">
              <strong className="warn" style={{ fontSize: 15 }}>{pendingClose.length} appointment{pendingClose.length > 1 ? 's' : ''} need{pendingClose.length > 1 ? '' : 's'} closing out</strong>
              <span className="t13">{pendingClose.slice(0, 3).map((p) => p.item.title).join(', ')}</span>
            </div>
            <Link to="/calendar" className="btn outline sm">Close out</Link>
          </section>
        )}

        <Requests />

        <section className="card tight">
          <div className="head" style={{ paddingBottom: 6 }}>
            <h2 className="h">Today's schedule</h2>
            <div style={{ display: 'flex', gap: 14 }}>
              <Link to="/calendar?add=1" style={{ fontWeight: 700, fontSize: 14 }}>+ Add</Link>
              <Link to="/calendar" style={{ fontWeight: 600, fontSize: 14 }}>Calendar</Link>
            </div>
          </div>
          {appts.length === 0 && <Empty>No appointments today.</Empty>}
          {appts.map((a) => {
            const c = catStyle(a);
            const out = outcomes.find((o) => o.item_id === a.id && o.occurs_on === d);
            const due = a.at_time && hm(a.at_time) <= now && !out;
            return (
              <div key={a.id} className="row" style={{ opacity: out ? 0.75 : 1 }}>
                <span className="time">{hm(a.at_time) || '—'}</span>
                <div className="grow">
                  <span className="chip" style={{ background: c.bg, color: c.fg }}>{c.label}</span>
                  <span className="t15">{a.title}</span>
                  {a.notes && <span className="t13">{a.notes}</span>}
                  {out && <span style={{ fontSize: 13, fontWeight: 700, color: OUTCOME_COLOR[out.outcome] }}>{OUTCOME_LABEL[out.outcome]}{out.note ? ` · ${out.note}` : ''}</span>}
                  {due && closing !== a.id && (
                    <div className="head">
                      <span className="warn">Needs close-out</span>
                      <button className="btn outline sm" onClick={() => setClosing(a.id)}>Close out</button>
                    </div>
                  )}
                  {closing === a.id && <CloseOut item={a} day={d} onDone={() => setClosing(null)} />}
                </div>
              </div>
            );
          })}
        </section>

        {vaccines.length > 0 && (
          <section className="card tight">
            <div className="head" style={{ paddingBottom: 6 }}>
              <h2 className="h">Vaccines due</h2>
              <span className="t13">Next 14 days</span>
            </div>
            {vaccines.map((v) => (
              <div key={v.id} className="row" style={{ alignItems: 'center' }}>
                <div className="grow">
                  <span className="t15">{animals.find((a) => a.id === v.animal_id)?.name ?? 'Animal'}</span>
                  <span className="t13">{v.vaccine}</span>
                </div>
                <span className="chip" style={v.due_on <= d ? { background: 'var(--red-tint)', color: 'var(--red)' } : { color: 'var(--ink-2)' }}>{v.due_on === d ? 'Today' : shortDate(v.due_on)}</span>
              </div>
            ))}
          </section>
        )}

        <KennelLog />

        <section className="card tight">
          <div className="head" style={{ paddingBottom: 6 }}>
            <h2 className="h">Tasks</h2>
            <Link to="/tasks" style={{ fontWeight: 600, fontSize: 14 }}>All tasks</Link>
          </div>
          <TaskList limit={6} />
        </section>

        <section className="card">
          <div className="head">
            <h2 className="h">My timesheet</h2>
            <Link to="/timesheet" style={{ fontWeight: 600, fontSize: 14 }}>Open</Link>
          </div>
          <span className="t14">{myHours ? `${myHours} hour${myHours > 1 ? 's' : ''} filled in today. Kennel log entries are added automatically.` : 'Nothing written yet today. Kennel log entries are added automatically.'}</span>
        </section>

        <section className="card tight">
          <div className="head" style={{ paddingBottom: 6 }}>
            <h2 className="h">Off today</h2>
            <Link to="/leave" style={{ fontWeight: 600, fontSize: 14 }}>Leave</Link>
          </div>
          {offToday.length + sickToday.length === 0 && <Empty>Everyone's in today.</Empty>}
          {offToday.map((l) => (
            <div key={l.id} className="row" style={{ alignItems: 'center' }}>
              <span className="t15 grow">{name(l.user_id)}</span>
              <span className="t13">{l.kind === 'annual' ? 'Annual leave' : l.kind === 'day_off' ? 'Day off' : 'Leave'}</span>
            </div>
          ))}
          {sickToday.map((x) => (
            <div key={x.id} className="row" style={{ alignItems: 'center' }}>
              <span className="t15 grow">{name(x.user_id)}</span>
              <span className="t13">{isMgmt ? `Sick · day ${x.consecutive_day}${x.certificate_path ? ' · certificate' : ''}` : 'Off'}</span>
            </div>
          ))}
        </section>

        <section className="card tight">
          <div className="head" style={{ paddingBottom: 6 }}>
            <h2 className="h">On site now</h2>
            <Link to="/visitors" style={{ fontWeight: 600, fontSize: 14 }}>Visitors</Link>
          </div>
          {onSite.length === 0 && <Empty>No visitors signed in.</Empty>}
          {onSite.map((v) => (
            <div key={v.id} className="row" style={{ alignItems: 'center' }}>
              <span className="t14 grow">{v.name}{v.guests ? ` + ${v.guests}` : ''}{v.kind === 'volunteer' ? ' (volunteer)' : ''}</span>
              <span className="t13">in {timeOf(v.signed_in_at)}</span>
            </div>
          ))}
        </section>

        <section className="card" style={signed ? { background: 'var(--blue-wash)', borderColor: 'var(--blue-line)' } : { borderColor: 'var(--amber-line)' }}>
          <h2 className="h">End-of-day check</h2>
          <span className="t15" style={{ color: signed ? 'var(--blue-dark)' : 'var(--amber)' }}>
            {signed ? `Signed off by ${name(signed.signed_by)} at ${timeOf(signed.signed_at)} — report sent to management.` : 'Not signed off yet'}
          </span>
          <div style={{ borderRadius: 12, background: 'var(--soft)', border: '1px solid var(--line)', padding: '4px 12px' }}>
            {reportLines(report).map(([k, v]) => (
              <div key={k} className="head" style={{ minHeight: 40, borderBottom: '1px solid var(--line-2)' }}>
                <span className="t14">{k}</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
          {!signed && <span className="note">Any staff member can complete it. Signing off sends this report, with every kennel log entry, to management. Management is alerted at 20:00 if it isn't signed off.</span>}
          <Link to="/eod" className={`btn ${signed ? 'ghost' : 'dark'} full`}>{signed ? 'View report' : 'Start end-of-day check'}</Link>
        </section>

        <footer className="foot">
          <img src="./logo.png" alt="PAWS Rescue Qatar" />
          <span className="t13">Staff hub · PAWS Rescue Qatar</span>
        </footer>
      </main>
    </>
  );
}

function Requests() {
  const { me, isMgmt } = useAuth();
  const { name } = useProfiles();
  const requests = useTable('requests');
  const replies = useTable('request_replies');
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const open = requests.filter((r) => !r.done).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const initials = (id: string) => name(id).split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  if (!open.length && !isMgmt) return null;
  return (
    <section className="card">
      <div className="head">
        <h2 className="h">From management</h2>
        {isMgmt && !composing && <button className="btn sm" onClick={() => setComposing(true)}>+ New request</button>}
      </div>
      {composing && (
        <div className="panel">
          <label className="field">
            <span>Request for the team</span>
            <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Please send updated photos of the cats ready for adoption" />
          </label>
          <button
            className="btn"
            disabled={!body.trim()}
            onClick={() => {
              insert('requests', { from_user: me.id, body: body.trim(), created_at: new Date().toISOString(), done: false });
              setBody('');
              setComposing(false);
              toast('Posted to the daily tab');
            }}
          >
            Post request
          </button>
          <button className="btn link" onClick={() => setComposing(false)}>Cancel</button>
        </div>
      )}
      {!open.length && !composing && <Empty>No open requests.</Empty>}
      {open.map((r) => (
        <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--ink)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(r.from_user)}</div>
            <div className="grow">
              <span className="t13"><strong style={{ color: 'var(--ink)' }}>{name(r.from_user)}</strong> · {shortDate(today(new Date(r.created_at)))} {timeOf(r.created_at)}</span>
              <p style={{ fontSize: 15, lineHeight: 1.45 }}>{r.body}</p>
            </div>
          </div>
          {replies.filter((x) => x.request_id === r.id).map((x) => (
            <div key={x.id} style={{ marginLeft: 46, borderRadius: 10, background: 'var(--soft)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="t13"><strong style={{ color: 'var(--ink)' }}>{name(x.user_id)}</strong> · {timeOf(x.created_at)}</span>
              {x.body && <span className="t14">{x.body}</span>}
              <StoredImage bucket="photos" path={x.photo_path} />
            </div>
          ))}
          {replyTo === r.id ? (
            <div className="panel">
              <label className="field"><span>Reply</span><textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} /></label>
              <PhotoPicker value={photo} onChange={setPhoto} />
              <button
                className="btn"
                disabled={!reply.trim() && !photo}
                onClick={() => {
                  const photo_path = photo ? queueUpload('photos', photo, 'replies') : null;
                  insert('request_replies', { request_id: r.id, user_id: me.id, body: reply.trim(), photo_path, created_at: new Date().toISOString() });
                  setReply('');
                  setPhoto(null);
                  setReplyTo(null);
                }}
              >
                Send reply
              </button>
              <button className="btn link" onClick={() => setReplyTo(null)}>Cancel</button>
            </div>
          ) : (
            <div className="btns">
              <button className="btn ghost sm" onClick={() => setReplyTo(r.id)}>Reply</button>
              <button className="btn soft sm" onClick={() => update('requests', { id: r.id }, { done: true, done_by: me.id, done_at: new Date().toISOString() })}>Mark done</button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
