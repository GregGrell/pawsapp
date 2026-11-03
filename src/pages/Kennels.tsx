import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Empty, Icon, Page, toast } from '../components/ui';
import { useTable } from '../lib/hooks';
import { insert, update, type Row } from '../lib/store';
import { shortDate, timeOf, today } from '../lib/time';
import { supabase } from '../lib/supabase';
import { refresh } from '../lib/store';

type Sp = 'dog' | 'cat';

export default function Kennels() {
  const { isMgmt } = useAuth();
  const [sp, setSp] = useState<Sp>('dog');
  const kennels = useTable('kennels').filter((k) => k.active);
  const animals = useTable('animals').filter((a) => a.in_shelter);
  if (!isMgmt) return <Page title="Kennels" back="More"><Empty>Only management can change kennels and animals.</Empty></Page>;
  return (
    <Page title="Kennels & animals" back="More">
      <div role="tablist" className="grid2" style={{ padding: 4, borderRadius: 14, background: 'var(--line)', gap: 4 }}>
        {(['dog', 'cat'] as Sp[]).map((s) => (
          <button key={s} role="tab" aria-selected={sp === s} onClick={() => setSp(s)}
            style={{ minHeight: 44, borderRadius: 10, border: 0, background: sp === s ? '#fff' : 'transparent', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            {s === 'dog' ? 'Dogs' : 'Cats'} · {animals.filter((a) => a.species === s).length}
          </button>
        ))}
      </div>
      <ShelterluvPanel />
      <KennelList sp={sp} kennels={kennels.filter((k) => k.species === sp)} />
      <AnimalList sp={sp} animals={animals.filter((a) => a.species === sp)} kennels={kennels.filter((k) => k.species === sp)} />
      <p className="note">Changes reach everyone's kennel log straight away. Medication, vaccinations and everything else are on each animal's record.</p>
    </Page>
  );
}

function KennelList({ sp, kennels }: { sp: Sp; kennels: Row[] }) {
  const settings = useTable('app_settings');
  const prefixes = settings.find((s) => s.key === 'kennel_prefix')?.value ?? { dog: 'D', cat: 'C' };
  const prefix: string = prefixes[sp] ?? (sp === 'dog' ? 'D' : 'C');
  const max = kennels.reduce((m, k) => Math.max(m, parseInt(String(k.code).replace(/\D/g, ''), 10) || 0), 0);
  const next = `${prefix}${max + 1}`;
  return (
    <section className="card tight">
      <div className="head" style={{ paddingBottom: 8 }}>
        <h2 className="h">Kennels</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="t13">Prefix</span>
          <input className="input" aria-label="Kennel number prefix" maxLength={3} defaultValue={prefix} key={prefix}
            style={{ width: 60, textAlign: 'center', fontWeight: 800 }}
            onBlur={(e) => {
              const v = e.target.value.trim().toUpperCase();
              if (v && v !== prefix) update('app_settings', { key: 'kennel_prefix' }, { value: { ...prefixes, [sp]: v } });
            }} />
        </label>
      </div>
      {!kennels.length && <Empty>No kennels yet.</Empty>}
      <div className="grid4" style={{ paddingTop: 4 }}>
        {kennels.map((k) => <KennelTile key={k.id} k={k} />)}
      </div>
      <button className="btn outline" style={{ marginTop: 12, borderStyle: 'dashed' }}
        onClick={() => { insert('kennels', { species: sp, code: next, sort: max + 1, active: true }); toast(`Kennel ${next} added`); }}>
        + Add kennel {next}
      </button>
    </section>
  );
}

function KennelTile({ k }: { k: Row }) {
  const [v, setV] = useState(k.code);
  useEffect(() => setV(k.code), [k.code]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input className="input" aria-label={`Kennel ${k.code} name`} value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => v.trim() && v.trim() !== k.code && update('kennels', { id: k.id }, { code: v.trim().toUpperCase() })}
        style={{ textAlign: 'center', fontWeight: 800, padding: 0 }} />
      <button className="btn link sm" style={{ minHeight: 32, color: 'var(--red)', fontSize: 12 }}
        onClick={() => confirm(`Remove kennel ${k.code}?`) && update('kennels', { id: k.id }, { active: false })}>Remove</button>
    </div>
  );
}

function AnimalList({ sp, animals, kennels }: { sp: Sp; animals: Row[]; kennels: Row[] }) {
  const [adding, setAdding] = useState('');
  return (
    <section className="card tight">
      <h2 className="h" style={{ paddingBottom: 8 }}>{sp === 'dog' ? 'Dogs' : 'Cats'} in the shelter</h2>
      <div style={{ display: 'flex', gap: 8, paddingBottom: 8 }}>
        <input className="input" placeholder={`Add a ${sp} by name`} value={adding} onChange={(e) => setAdding(e.target.value)} />
        <button className="btn" disabled={!adding.trim()} onClick={() => {
          const a = insert('animals', { name: adding.trim(), species: sp, status: 'shelter', in_shelter: true, source: 'manual', breed: '', colour: '', sex: 'unknown', microchip: '', notes: '', intake_on: today(), status_since: today(), updated_at: new Date().toISOString() });
          insert('animal_locations', { animal_id: a.id, status: 'shelter', kennel_id: null, with_name: '', with_contact: '', country: '', from_on: today(), note: 'Record started', created_at: new Date().toISOString() });
          setAdding('');
        }}>
          <Icon name="plus" size={18} color="#fff" width={2.4} />
        </button>
      </div>
      {!animals.length && <Empty>No {sp}s listed yet.</Empty>}
      {animals.map((a) => (
        <div key={a.id} className="row" style={{ flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}>
            <span className="t15" style={{ flex: 1 }}>{a.name}{a.source === 'shelterluv' ? <span className="t13"> · Shelterluv</span> : null}</span>
            <select className="input" style={{ width: 96 }} aria-label={`${a.name}'s kennel`} value={a.kennel_id ?? ''} onChange={(e) => {
              const kennel_id = e.target.value || null;
              insert('animal_locations', { animal_id: a.id, status: 'shelter', kennel_id, with_name: '', with_contact: '', country: '', from_on: today(), note: 'Kennel change', created_at: new Date().toISOString() });
              update('animals', { id: a.id }, { kennel_id });
            }}>
              <option value="">—</option>
              {kennels.map((k) => <option key={k.id} value={k.id}>{k.code}</option>)}
            </select>
            <Link className="btn ghost sm" to={`/records/${a.id}`}>Record</Link>
          </div>
        </div>
      ))}
    </section>
  );
}

function ShelterluvPanel() {
  const settings = useTable('app_settings');
  const last = settings.find((x) => x.key === 'shelterluv_last_sync')?.value;
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('shelterluv-sync', { body: {} });
    if (error) toast('Sync failed — check your signal');
    else if (!data?.ok) toast(data?.error ?? 'Sync failed');
    else toast(`Synced: ${data.added} added, ${data.updated} updated, ${data.left} left`);
    await refresh(['animals', 'app_settings']).catch(() => {});
    setBusy(false);
  };
  const when = last?.at ? `${shortDate(today(new Date(last.at)))} ${timeOf(last.at)}` : null;
  return (
    <section className="card">
      <div className="head">
        <h2 className="h">Shelterluv</h2>
        <button className="btn sm" disabled={busy || !navigator.onLine} onClick={sync}>{busy ? 'Syncing…' : 'Sync now'}</button>
      </div>
      {!last && <span className="t14">Not synced yet. Animals in custody sync automatically every night at 05:00.</span>}
      {last && !last.ok && <span className="bad">Last sync failed ({when}): {last.error}</span>}
      {last?.ok && (
        <>
          <span className="t14">Last synced {when} · {last.inCustody} in custody · {last.added} added, {last.updated} updated, {last.left} left the shelter</span>
          {last.unmatchedLocations?.length > 0 && (
            <span className="warn">Shelterluv locations with no matching kennel here: {last.unmatchedLocations.join(', ')}. Name kennels to match (e.g. "D1") and they'll link automatically.</span>
          )}
        </>
      )}
    </section>
  );
}
