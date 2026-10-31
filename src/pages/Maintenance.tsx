import { useState } from 'react';
import { useAuth } from '../auth';
import { Empty, Page, Pill, PhotoPicker, StoredImage, toast } from '../components/ui';
import { useProfiles, useTable } from '../lib/hooks';
import { insert, queueUpload, update, type Row } from '../lib/store';
import { shortDate, timeOf, today } from '../lib/time';

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  open: { label: 'Open', bg: 'var(--amber-tint)', fg: 'var(--amber)' },
  in_progress: { label: 'In progress', bg: 'var(--blue-wash)', fg: 'var(--blue-dark)' },
  fixed: { label: 'Fixed', bg: 'var(--line-2)', fg: 'var(--ink-2)' },
};

export default function Maintenance() {
  const issues = useTable('maintenance_issues');
  const [show, setShow] = useState<'open' | 'fixed'>('open');
  const open = issues.filter((i) => i.status !== 'fixed').sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.created_at.localeCompare(a.created_at));
  const fixed = issues.filter((i) => i.status === 'fixed').sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  const list = show === 'open' ? open : fixed;

  return (
    <Page title="Maintenance" back="Back">
      <ReportForm />
      <div className="pills">
        <Pill on={show === 'open'} onClick={() => setShow('open')}>Outstanding · {open.length}</Pill>
        <Pill on={show === 'fixed'} onClick={() => setShow('fixed')}>Fixed · {fixed.length}</Pill>
      </div>
      <section className="card tight">
        {!list.length && <Empty>{show === 'open' ? 'Nothing outstanding.' : 'Nothing fixed yet.'}</Empty>}
        {list.map((i) => <Issue key={i.id} i={i} />)}
      </section>
    </Page>
  );
}

function ReportForm() {
  const { me } = useAuth();
  const kennels = useTable('kennels').filter((k) => k.active);
  const [desc, setDesc] = useState('');
  const [where, setWhere] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const send = () => {
    const photo_path = photo ? queueUpload('photos', photo, 'maintenance') : null;
    insert('maintenance_issues', { reported_by: me.id, created_at: new Date().toISOString(), location: where, description: desc.trim(), urgent, photo_path, status: 'open', fix_note: '' });
    setDesc(''); setWhere(''); setUrgent(false); setPhoto(null);
    toast(urgent ? 'Reported — management alerted' : 'Reported');
  };
  return (
    <section className="card">
      <h2 className="h">Report a problem</h2>
      <PhotoPicker value={photo} onChange={setPhoto} label="Photo of the problem" />
      <label className="field"><span>What's wrong?</span><textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Latch on gate broken, door won't lock" /></label>
      <label className="field">
        <span>Where?</span>
        <select value={where} onChange={(e) => setWhere(e.target.value)}>
          <option value="">Choose…</option>
          {kennels.map((k) => <option key={k.id} value={`Kennel ${k.code}`}>Kennel {k.code}</option>)}
          {['Cattery', 'Yard', 'Vet room', 'Kitchen / food store', 'Laundry', 'Office', 'Main gate', 'Water / plumbing', 'Electrics / AC', 'Vehicle', 'Other'].map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>
      <div className="grid2">
        <button type="button" className="seg" aria-pressed={!urgent} onClick={() => setUrgent(false)}>Can wait</button>
        <button type="button" className="seg" aria-pressed={urgent} onClick={() => setUrgent(true)} style={urgent ? { borderColor: 'var(--red-strong)', background: 'var(--red-tint)', color: 'var(--red)' } : undefined}>Urgent</button>
      </div>
      {urgent && <span className="note">Urgent means an animal or person could get hurt or escape. Management gets an alert straight away.</span>}
      <button className="btn" disabled={!desc.trim()} onClick={send}>{desc.trim() ? 'Send report' : "Describe what's wrong"}</button>
    </section>
  );
}

function Issue({ i }: { i: Row }) {
  const { me } = useAuth();
  const { name } = useProfiles();
  const [fixing, setFixing] = useState(false);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const st = STATUS[i.status];
  const day = today(new Date(i.created_at));
  const markFixed = () => {
    const fix_photo_path = photo ? queueUpload('photos', photo, 'maintenance') : null;
    update('maintenance_issues', { id: i.id }, { status: 'fixed', fix_note: note.trim(), fix_photo_path, updated_by: me.id, updated_at: new Date().toISOString() });
    setFixing(false);
    toast('Marked fixed');
  };
  return (
    <div className="row" style={{ flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {i.urgent && i.status !== 'fixed' && <span className="chip" style={{ background: 'var(--red-strong)', color: '#fff' }}>Urgent</span>}
        <span className="chip" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
      </div>
      <div className="grow">
        <span className="t15">{i.description}</span>
        <span className="t13">{i.location || 'No location'} · {name(i.reported_by)} · {day === today() ? 'today' : shortDate(day)} {timeOf(i.created_at)}</span>
        {i.status === 'in_progress' && <span className="ok">{name(i.updated_by)} is on it</span>}
      </div>
      <StoredImage bucket="photos" path={i.photo_path} />
      {i.status === 'fixed' && (
        <div style={{ borderRadius: 10, background: 'var(--soft)', border: '1px solid var(--line)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="ok">Fixed by {name(i.updated_by)} · {i.updated_at ? shortDate(today(new Date(i.updated_at))) : ''}</span>
          {i.fix_note && <span className="t14">{i.fix_note}</span>}
          <StoredImage bucket="photos" path={i.fix_photo_path} />
        </div>
      )}
      {i.status !== 'fixed' && !fixing && (
        <div className="btns" style={{ width: '100%' }}>
          {i.status === 'open' && (
            <button className="btn ghost sm" onClick={() => update('maintenance_issues', { id: i.id }, { status: 'in_progress', updated_by: me.id, updated_at: new Date().toISOString() })}>I'm on it</button>
          )}
          <button className="btn sm" onClick={() => setFixing(true)}>Mark fixed</button>
        </div>
      )}
      {fixing && (
        <div className="panel" style={{ width: '100%' }}>
          <PhotoPicker value={photo} onChange={setPhoto} label="Photo of the fix" />
          <label className="field"><span>What was done? · optional</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Replaced latch, tested" /></label>
          <button className="btn" onClick={markFixed}>Mark fixed</button>
          <button className="btn link" onClick={() => setFixing(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
