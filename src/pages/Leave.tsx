import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Empty, Icon, Page, StoredImage, toast } from '../components/ui';
import { useProfiles, useTable } from '../lib/hooks';
import { insert, update } from '../lib/store';
import { addDays, dayLabel, shortDate, today } from '../lib/time';

const KIND: Record<string, string> = { day_off: 'Day off', annual: 'Annual leave', other: 'Other leave' };
const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: 'var(--amber-tint)', fg: 'var(--amber)', label: 'Pending' },
  approved: { bg: 'var(--blue-wash)', fg: 'var(--blue-dark)', label: 'Approved' },
  declined: { bg: 'var(--red-tint)', fg: 'var(--red)', label: 'Declined' },
};
const range = (a: string, b: string) => (a === b ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

export default function Leave() {
  const { me, isMgmt } = useAuth();
  const { name } = useProfiles();
  const leave = useTable('leave_requests');
  const sick = useTable('sick_reports');
  const [form, setForm] = useState(false);
  const d = today();
  const mine = leave.filter((l) => l.user_id === me.id).sort((a, b) => b.start_on.localeCompare(a.start_on));
  const pending = leave.filter((l) => l.status === 'pending');
  const upcoming = leave.filter((l) => l.status !== 'declined' && l.end_on >= d && l.start_on <= addDays(d, 30)).sort((a, b) => a.start_on.localeCompare(b.start_on));

  return (
    <Page title="Leave" back="More">
      <div className="grid2">
        <button className="btn" style={{ minHeight: 72, flexDirection: 'column', gap: 4 }} onClick={() => setForm(!form)}>
          <Icon name="calendar" size={22} color="#fff" /> Request leave
        </button>
        <Link to="/sick" className="btn danger" style={{ minHeight: 72, flexDirection: 'column', gap: 4, color: 'var(--red)', borderColor: 'var(--red)' }}>
          <Icon name="heart" size={22} color="var(--red)" /> Report sick
        </Link>
      </div>

      {form && <RequestForm onDone={() => setForm(false)} />}

      {isMgmt && (
        <section className="card tight">
          <h2 className="h" style={{ paddingBottom: 6 }}>To approve</h2>
          {!pending.length && <Empty>Nothing waiting.</Empty>}
          {pending.map((l) => {
            const clash = leave.filter((o) => o.id !== l.id && o.status === 'approved' && o.start_on <= l.end_on && o.end_on >= l.start_on);
            return (
              <div key={l.id} className="row" style={{ flexDirection: 'column', gap: 8 }}>
                <div className="grow">
                  <span className="t15">{name(l.user_id)} · {KIND[l.kind]}</span>
                  <span className="t13">{range(l.start_on, l.end_on)} · {daysBetween(l.start_on, l.end_on)} day{daysBetween(l.start_on, l.end_on) > 1 ? 's' : ''}</span>
                  {l.note && <span className="t14">{l.note}</span>}
                  {clash.length > 0 && <span className="warn">Overlaps: {clash.map((c) => name(c.user_id)).join(', ')} already off</span>}
                </div>
                <div className="btns" style={{ width: '100%' }}>
                  <button className="btn ghost sm" style={{ color: 'var(--red)' }} onClick={() => { update('leave_requests', { id: l.id }, { status: 'declined', decided_by: me.id, decided_at: new Date().toISOString() }); toast('Declined'); }}>Decline</button>
                  <button className="btn sm" onClick={() => { update('leave_requests', { id: l.id }, { status: 'approved', decided_by: me.id, decided_at: new Date().toISOString() }); toast('Approved'); }}>Approve</button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {isMgmt && (
        <section className="card tight">
          <h2 className="h" style={{ paddingBottom: 6 }}>Sick leave records</h2>
          {!sick.length && <Empty>No sick days in the last 90 days.</Empty>}
          {sick.slice(0, 30).map((x) => (
            <div key={x.id} className="row" style={{ flexDirection: 'column' }}>
              <div className="grow">
                <span className="t15">{name(x.user_id)} · {shortDate(x.sick_on)}</span>
                <span className="t13">Day {x.consecutive_day}{x.certificate_path ? ' · certificate uploaded' : x.consecutive_day === 1 ? ' · no certificate needed' : ''}</span>
                {x.note && <span className="t14">{x.note}</span>}
              </div>
              {x.certificate_path && <StoredImage bucket="certificates" path={x.certificate_path} />}
            </div>
          ))}
        </section>
      )}

      {!isMgmt && (
        <section className="card tight">
          <h2 className="h" style={{ paddingBottom: 6 }}>My requests</h2>
          {!mine.length && <Empty>No requests yet.</Empty>}
          {mine.slice(0, 20).map((l) => {
            const st = STATUS_STYLE[l.status];
            return (
              <div key={l.id} className="row" style={{ alignItems: 'center' }}>
                <div className="grow">
                  <span className="t15">{KIND[l.kind]}</span>
                  <span className="t13">{range(l.start_on, l.end_on)}</span>
                </div>
                <span className="chip" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
              </div>
            );
          })}
        </section>
      )}

      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Team leave · next 30 days</h2>
        {!upcoming.length && <Empty>Nobody has leave booked.</Empty>}
        {upcoming.map((l) => {
          const { dow, num } = dayLabel(l.start_on);
          return (
            <div key={l.id} className="row" style={{ alignItems: 'center' }}>
              <div style={{ width: 48, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="t13" style={{ fontWeight: 700, fontSize: 12 }}>{dow}</span>
                <b style={{ fontSize: 20 }}>{num}</b>
              </div>
              <div className="grow">
                <span className="t15">{name(l.user_id)}</span>
                <span className="t13">{KIND[l.kind]}{l.end_on !== l.start_on ? ` to ${shortDate(l.end_on)}` : ''} · {STATUS_STYLE[l.status].label.toLowerCase()}</span>
              </div>
            </div>
          );
        })}
      </section>
    </Page>
  );
}

function RequestForm({ onDone }: { onDone: () => void }) {
  const { me } = useAuth();
  const { name } = useProfiles();
  const leave = useTable('leave_requests');
  const d = today();
  const [kind, setKind] = useState('day_off');
  const [from, setFrom] = useState(addDays(d, 1));
  const [to, setTo] = useState(addDays(d, 1));
  const [note, setNote] = useState('');
  const end = to < from ? from : to;
  const clash = leave.filter((o) => o.user_id !== me.id && o.status === 'approved' && o.start_on <= end && o.end_on >= from);
  return (
    <section className="card blue">
      <h2 className="h">Request leave</h2>
      <div className="pills">
        {Object.entries(KIND).map(([k, l]) => <button key={k} className="pill" aria-pressed={kind === k} onClick={() => setKind(k)}>{l.replace(' leave', '')}</button>)}
      </div>
      <div className="grid2">
        <label className="field"><span>From</span><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></label>
        <label className="field"><span>To</span><input type="date" value={end} min={from} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <label className="field"><span>Note · optional</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything management should know" /></label>
      {clash.length > 0 && <span className="warn">{clash.map((c) => name(c.user_id)).join(', ')} already off during these dates.</span>}
      <button
        className="btn"
        onClick={() => {
          insert('leave_requests', { user_id: me.id, kind, start_on: from, end_on: end, note: note.trim(), status: 'pending', created_at: new Date().toISOString() });
          toast('Sent to management');
          onDone();
        }}
      >
        Send to management
      </button>
    </section>
  );
}
