import { useState } from 'react';
import { useAuth } from '../auth';
import { Empty, Page, toast } from '../components/ui';
import { KIND_LABEL } from '../lib/animals';
import { useTable } from '../lib/hooks';
import { insert, update, type Row } from '../lib/store';

/** Management: what treatments exist and how often each repeats. */
export default function TreatmentTypes() {
  const { isMgmt } = useAuth();
  const types = useTable('treatment_types').filter((t) => t.active).sort((a, b) => a.sort - b.sort);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('vaccine');
  const [species, setSpecies] = useState('both');
  const [days, setDays] = useState('');
  if (!isMgmt) return <Page title="Treatment schedule" back="More"><Empty>Only management can change the schedule.</Empty></Page>;
  return (
    <Page title="Treatment schedule" sub="How often each treatment repeats" back="More">
      <section className="card tight">
        {!types.length && <Empty>No treatments set up.</Empty>}
        {types.map((t) => <TypeRow key={t.id} t={t} />)}
      </section>
      <section className="card">
        <h2 className="h">Add a treatment</h2>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kennel cough" /></label>
        <div className="grid2">
          <label className="field"><span>Type</span><select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field"><span>For</span><select value={species} onChange={(e) => setSpecies(e.target.value)}><option value="both">Dogs & cats</option><option value="dog">Dogs</option><option value="cat">Cats</option></select></label>
        </div>
        <label className="field"><span>Repeat every (days) · blank = doesn't repeat</span><input type="number" inputMode="numeric" min="1" value={days} onChange={(e) => setDays(e.target.value)} /></label>
        <button className="btn" disabled={!name.trim()} onClick={() => {
          insert('treatment_types', { name: name.trim(), kind, species, interval_days: parseInt(days, 10) || null, active: true, sort: (types.at(-1)?.sort ?? 0) + 1 });
          setName(''); setDays(''); toast('Added');
        }}>Add</button>
      </section>
      <p className="note">The starting intervals are common defaults, not vet advice. Check them with your vet, especially vaccine boosters, which vary by product. Changing an interval only affects treatments logged from now on.</p>
    </Page>
  );
}

function TypeRow({ t }: { t: Row }) {
  const [days, setDays] = useState(t.interval_days ? String(t.interval_days) : '');
  const sp = t.species === 'both' ? 'Dogs & cats' : t.species === 'dog' ? 'Dogs' : 'Cats';
  return (
    <div className="row" style={{ alignItems: 'center' }}>
      <div className="grow">
        <span className="t15">{t.name}</span>
        <span className="t13">{KIND_LABEL[t.kind]} · {sp}</span>
      </div>
      <input className="input" type="number" inputMode="numeric" min="1" aria-label={`${t.name} repeat days`} placeholder="—" style={{ width: 76, textAlign: 'center' }}
        value={days} onChange={(e) => setDays(e.target.value)}
        onBlur={() => { const v = parseInt(days, 10) || null; if (v !== t.interval_days) { update('treatment_types', { id: t.id }, { interval_days: v }); toast('Saved'); } }} />
      <span className="t13" style={{ width: 30 }}>days</span>
      <button className="btn link sm" style={{ color: 'var(--red)' }} onClick={() => confirm(`Remove ${t.name} from the schedule? Past records stay.`) && update('treatment_types', { id: t.id }, { active: false })}>Remove</button>
    </div>
  );
}
