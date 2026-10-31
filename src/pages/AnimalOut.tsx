import { useMemo, useState } from 'react';
import { useAuth } from '../auth';
import { returnAnimal, useOpenMoves } from '../components/AnimalsOut';
import { Empty, Page, Pill, toast } from '../components/ui';
import { useProfiles, useTable } from '../lib/hooks';
import { insert } from '../lib/store';
import { shortDate, timeOf, today } from '../lib/time';

const DEST: [string, string][] = [['foster', 'Foster'], ['adopter', 'Adopter'], ['transfer', 'Transfer / travel'], ['other', 'Other']];
const QUICK = ['Vet appointment', 'Beach trip', 'Walk', 'Grooming', 'Photo shoot'];

export default function AnimalOut() {
  const { me } = useAuth();
  const { name } = useProfiles();
  const animals = useTable('animals');
  const kennels = useTable('kennels');
  const moves = useTable('animal_movements');
  const open = useOpenMoves();

  const [sp, setSp] = useState<'dog' | 'cat'>('dog');
  const [animalId, setAnimalId] = useState('');
  const [other, setOther] = useState('');
  const [kind, setKind] = useState<'temporary' | 'permanent' | null>(null);
  const [dest, setDest] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);

  const list = useMemo(() => animals.filter((a) => a.species === sp).sort((a, b) => a.name.localeCompare(b.name)), [animals, sp]);
  const outIds = new Set(open.map((m) => m.animal_id).filter(Boolean));
  const chosen = animals.find((a) => a.id === animalId);
  const animalName = animalId === '__other' ? other.trim() : chosen?.name ?? '';
  const ok = !!animalName && !!kind && reason.trim().length > 0 && (kind === 'temporary' || !!dest);
  const kennelOf = (id?: string) => kennels.find((k) => k.id === id)?.code;

  const save = () => {
    insert('animal_movements', {
      animal_id: animalId && animalId !== '__other' ? animalId : null, animal_name: animalName, species: sp,
      kind, destination: kind === 'permanent' ? dest : null, reason: reason.trim(),
      out_by: me.id, out_at: new Date().toISOString(), created_at: new Date().toISOString(),
    });
    toast(kind === 'permanent' ? `${animalName} signed out — the team has been notified` : `${animalName} signed out`);
    setAnimalId(''); setOther(''); setKind(null); setDest(''); setReason(''); setConfirm(false);
  };

  const recentPermanent = moves.filter((m) => m.kind === 'permanent').sort((a, b) => b.out_at.localeCompare(a.out_at)).slice(0, 8);

  return (
    <Page title="Sign out an animal" back="Back">
      <section className="card">
        <div className="grid2">
          <button type="button" className="seg" aria-pressed={sp === 'dog'} onClick={() => { setSp('dog'); setAnimalId(''); }}>Dog</button>
          <button type="button" className="seg" aria-pressed={sp === 'cat'} onClick={() => { setSp('cat'); setAnimalId(''); }}>Cat</button>
        </div>
        <label className="field">
          <span>Which animal?</span>
          <select value={animalId} onChange={(e) => setAnimalId(e.target.value)}>
            <option value="">Choose…</option>
            {list.map((a) => (
              <option key={a.id} value={a.id} disabled={outIds.has(a.id)}>
                {a.name}{kennelOf(a.kennel_id) ? ` · ${kennelOf(a.kennel_id)}` : ''}{outIds.has(a.id) ? ' (already out)' : ''}
              </option>
            ))}
            <option value="__other">Not listed…</option>
          </select>
        </label>
        {animalId === '__other' && <input className="input" placeholder="Animal's name" value={other} onChange={(e) => setOther(e.target.value)} />}

        <div className="field">
          <span>Coming back?</span>
          <div className="grid2">
            <button type="button" className="seg" aria-pressed={kind === 'temporary'} onClick={() => setKind('temporary')}>Temporary</button>
            <button type="button" className="seg" aria-pressed={kind === 'permanent'} onClick={() => setKind('permanent')}
              style={kind === 'permanent' ? { borderColor: '#B45309', background: 'var(--amber-tint)' } : undefined}>Permanent</button>
          </div>
        </div>

        {kind === 'temporary' && (
          <div className="pills">
            {QUICK.map((q) => <Pill key={q} on={reason === q} onClick={() => setReason(q)}>{q}</Pill>)}
          </div>
        )}
        {kind === 'permanent' && (
          <div className="field">
            <span>Going to</span>
            <div className="pills">{DEST.map(([k, l]) => <Pill key={k} on={dest === k} onClick={() => setDest(k)}>{l}</Pill>)}</div>
          </div>
        )}
        {kind && (
          <label className="field">
            <span>Reason · required</span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={kind === 'temporary' ? 'e.g. Vet appointment at Doha Vet Clinic' : 'e.g. Foster with the Smith family, Al Waab'} />
          </label>
        )}

        {!confirm && (
          <button className="btn" disabled={!ok} onClick={() => (kind === 'permanent' ? setConfirm(true) : save())}>
            {ok ? `Sign out ${animalName}` : !animalName ? 'Choose an animal' : !kind ? 'Temporary or permanent?' : kind === 'permanent' && !dest ? 'Where are they going?' : 'Add a reason'}
          </button>
        )}
        {confirm && (
          <div className="banner amber" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <strong className="warn">{animalName} is leaving the shelter permanently</strong>
            <span className="t14">Management and staff will be notified, and {animalName} will come off the shelter list.</span>
            <div className="btns">
              <button className="btn ghost sm" onClick={() => setConfirm(false)}>Go back</button>
              <button className="btn sm" onClick={save}>Confirm</button>
            </div>
          </div>
        )}
      </section>

      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Out now · {open.length}</h2>
        {!open.length && <Empty>No animals temporarily out.</Empty>}
        {open.map((m) => (
          <div key={m.id} className="row" style={{ alignItems: 'center' }}>
            <div className="grow">
              <span className="t15">{m.animal_name}</span>
              <span className="t13">{m.reason} · {name(m.out_by) || 'You'} · {today(new Date(m.out_at)) === today() ? timeOf(m.out_at) : shortDate(today(new Date(m.out_at)))}</span>
            </div>
            <button className="btn outline sm" onClick={() => returnAnimal(m, me.id)}>Back</button>
          </div>
        ))}
      </section>

      {recentPermanent.length > 0 && (
        <section className="card tight">
          <h2 className="h" style={{ paddingBottom: 6 }}>Recently left for good</h2>
          {recentPermanent.map((m) => (
            <div key={m.id} className="row">
              <div className="grow">
                <span className="t15">{m.animal_name} · {DEST.find(([k]) => k === m.destination)?.[1]}</span>
                <span className="t13">{m.reason} · {shortDate(today(new Date(m.out_at)))} · {name(m.out_by) || 'You'}</span>
              </div>
            </div>
          ))}
        </section>
      )}
    </Page>
  );
}
