import { useState } from 'react';
import { useAuth } from '../auth';
import { Empty, Page, PhotoPicker, StoredImage, toast } from '../components/ui';
import { useProfiles, useTable } from '../lib/hooks';
import { insert, queueUpload, update } from '../lib/store';
import { shortDate, timeOf, today } from '../lib/time';

export default function Incidents() {
  const { me, isMgmt } = useAuth();
  const { name } = useProfiles();
  const incidents = useTable('incidents');
  const kennels = useTable('kennels').filter((k) => k.active);
  const [desc, setDesc] = useState('');
  const [where, setWhere] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);

  const report = () => {
    const photo_path = photo ? queueUpload('photos', photo, 'incidents') : null;
    insert('incidents', { reported_by: me.id, created_at: new Date().toISOString(), location: where, description: desc.trim(), photo_path });
    setDesc(''); setWhere(''); setPhoto(null);
    toast(navigator.onLine ? 'Reported — management alerted' : 'Saved — management will be alerted when you have signal');
  };

  return (
    <Page title="Incidents" back="Back">
      <section className="card" style={{ borderColor: '#F3B9B9' }}>
        <h2 className="h" style={{ color: 'var(--red)' }}>Report an incident</h2>
        <label className="field"><span>What happened?</span><textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Minor bite on hand while moving Rex" /></label>
        <label className="field">
          <span>Where?</span>
          <select value={where} onChange={(e) => setWhere(e.target.value)}>
            <option value="">Not in a kennel / other</option>
            {kennels.map((k) => <option key={k.id} value={`Kennel ${k.code}`}>Kennel {k.code}</option>)}
            <option value="Yard">Yard</option>
            <option value="Vet room">Vet room</option>
            <option value="Off site">Off site</option>
          </select>
        </label>
        <PhotoPicker value={photo} onChange={setPhoto} />
        <button className="btn" style={{ background: 'var(--red-strong)' }} disabled={!desc.trim()} onClick={report}>Send to management now</button>
        {!navigator.onLine && <span className="warn">You're offline. It will send as soon as the phone has signal.</span>}
      </section>

      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Last 30 days</h2>
        {!incidents.length && <Empty>No incidents.</Empty>}
        {incidents.map((i) => (
          <div key={i.id} className="row" style={{ flexDirection: 'column', gap: 6 }}>
            <div className="grow">
              <span className="t15">{i.description}</span>
              <span className="t13">{shortDate(today(new Date(i.created_at)))} {timeOf(i.created_at)} · {i.location || 'No location'} · {name(i.reported_by)}</span>
              {i.acknowledged_at ? <span className="ok">Seen by {name(i.acknowledged_by)}</span> : <span className="bad">Not yet acknowledged</span>}
            </div>
            <StoredImage bucket="photos" path={i.photo_path} />
            {isMgmt && !i.acknowledged_at && (
              <button className="btn sm" onClick={() => update('incidents', { id: i.id }, { acknowledged_by: me.id, acknowledged_at: new Date().toISOString() })}>Acknowledge</button>
            )}
          </div>
        ))}
      </section>
    </Page>
  );
}
