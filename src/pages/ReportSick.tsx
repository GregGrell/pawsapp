import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Icon, Page, PhotoPicker } from '../components/ui';
import { useTable } from '../lib/hooks';
import { insert, queueUpload } from '../lib/store';
import { addDays, longDate, today } from '../lib/time';

export default function ReportSick() {
  const { me } = useAuth();
  const sick = useTable('sick_reports');
  const d = today();
  const yesterday = sick.find((x) => x.user_id === me.id && x.sick_on === addDays(d, -1));
  const already = sick.find((x) => x.user_id === me.id && x.sick_on === d);
  const autoDay = yesterday ? yesterday.consecutive_day + 1 : 1;
  const [second, setSecond] = useState(autoDay > 1);
  const [cert, setCert] = useState<Blob | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const day = second ? Math.max(autoDay, 2) : 1;
  const canSend = !second || !!cert;

  if (already || sent)
    return (
      <Page title="Report sick" back="Leave">
        <section className="card blue" style={{ alignItems: 'center', textAlign: 'center', padding: '24px 16px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: 'var(--blue-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={28} color="var(--blue)" width={2.4} />
          </div>
          <strong style={{ fontSize: 18 }}>Sent to management</strong>
          <span className="sub">You're marked off sick today. Get well soon.</span>
          <Link to="/" className="btn link" style={{ color: 'var(--blue)' }}>Back to Today</Link>
        </section>
      </Page>
    );

  return (
    <Page title="Report sick" back="Leave">
      <section className="card">
        <div className="field">
          <span className="h">Date</span>
          <span style={{ fontSize: 17, fontWeight: 600 }}>Today · {longDate(d)}</span>
        </div>
        <div className="field">
          <span className="h">Which day of sickness is this?</span>
          <div className="grid2">
            <button className="seg" aria-pressed={!second} onClick={() => setSecond(false)}>First day</button>
            <button className="seg" aria-pressed={second} onClick={() => setSecond(true)}>2nd day or more</button>
          </div>
          {yesterday && <span className="note">You were off sick yesterday too, so this is day {autoDay}.</span>}
        </div>
        {!second ? (
          <div className="banner blue" style={{ fontSize: 14, lineHeight: 1.45 }}>No certificate needed for the first day. If you're still off tomorrow, you'll be asked to upload one.</div>
        ) : (
          <div className="field">
            <span className="h">Sick certificate · required</span>
            <PhotoPicker value={cert} onChange={setCert} label="Take photo or upload PDF" accept="image/*,application/pdf" required />
            <span className="note">Only management can see certificates.</span>
          </div>
        )}
        <label className="field"><span>Note for management · optional</span><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Expect to be back Saturday" /></label>
        <button
          className="btn"
          disabled={!canSend}
          onClick={() => {
            const certificate_path = cert ? queueUpload('certificates', cert, me.id) : null;
            insert('sick_reports', { user_id: me.id, sick_on: d, consecutive_day: day, certificate_path, note: note.trim(), created_at: new Date().toISOString() });
            setSent(true);
          }}
        >
          {canSend ? 'Send to management' : 'Upload certificate to send'}
        </button>
      </section>
    </Page>
  );
}
