import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Empty, Icon, Page, Pill, toast } from '../components/ui';
import { STATUS, STATUS_ORDER, ageText, ageYears, careDue } from '../lib/animals';
import { useTable } from '../lib/hooks';
import { insert, signedUrl, type Row } from '../lib/store';
import { today } from '../lib/time';

type StatusFilter = 'care' | 'shelter' | 'foster' | 'trial' | 'past' | 'all';
const AGES: [string, string, number, number][] = [
  ['any', 'Any age', 0, 99],
  ['u1', 'Under 1', 0, 1],
  ['1-3', '1–3 yrs', 1, 3],
  ['3-7', '3–7 yrs', 3, 7],
  ['7+', '7+ yrs', 7, 99],
];

const FILTER_KEY = 'paws-records-filter';

export default function Records() {
  const animals = useTable('animals');
  const kennels = useTable('kennels');
  const treatments = useTable('treatments');
  const types = useTable('treatment_types');
  const nav = useNavigate();
  const saved = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(FILTER_KEY) || '{}');
    } catch {
      return {};
    }
  })();
  const [q, setQ] = useState<string>(saved.q ?? '');
  const [sp, setSp] = useState<'all' | 'dog' | 'cat'>(saved.sp ?? 'all');
  const [st, setSt] = useState<StatusFilter>(saved.st ?? 'care');
  const [age, setAge] = useState<string>(saved.age ?? 'any');
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify({ q, sp, st, age }));
    } catch {
      /* private mode */
    }
  }, [q, sp, st, age]);

  const dueBy = useMemo(() => {
    const m = new Map<string, { n: number; overdue: boolean }>();
    for (const d of careDue(animals, treatments, types, 14)) {
      const cur = m.get(d.animal.id) ?? { n: 0, overdue: false };
      m.set(d.animal.id, { n: cur.n + 1, overdue: cur.overdue || d.overdue });
    }
    return m;
  }, [animals, treatments, types]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\s/g, '');
    const [, , lo, hi] = AGES.find((a) => a[0] === age) ?? AGES[0];
    return animals
      .filter((a) => sp === 'all' || a.species === sp)
      .filter((a) => {
        const inCare = STATUS[a.status]?.inCare;
        if (st === 'care') return inCare;
        if (st === 'past') return !inCare;
        if (st === 'all') return true;
        return a.status === st;
      })
      .filter((a) => {
        if (age === 'any') return true;
        const y = ageYears(a.dob);
        return y != null && y >= lo && y < hi;
      })
      .filter((a) => {
        if (!term) return true;
        return (
          a.name.toLowerCase().includes(term) ||
          (a.colour ?? '').toLowerCase().includes(term) ||
          (a.breed ?? '').toLowerCase().includes(term) ||
          (digits.length >= 3 && (a.microchip ?? '').includes(digits))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [animals, q, sp, st, age]);

  const kennel = (id?: string) => kennels.find((k) => k.id === id)?.code;
  const counts = { dog: animals.filter((a) => a.species === 'dog' && STATUS[a.status]?.inCare).length, cat: animals.filter((a) => a.species === 'cat' && STATUS[a.status]?.inCare).length };

  return (
    <Page title="Animal records" sub={`${counts.dog} dogs · ${counts.cat} cats in our care · ${animals.length} records`}
      right={
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn ghost sm" to="/flight-lists">Flight lists</Link>
          <button className="btn sm" onClick={() => setAdding(!adding)}><Icon name="plus" size={16} color="#fff" width={2.4} /> Add</button>
        </div>
      }>
      {adding && <AddAnimal onDone={(id) => { setAdding(false); if (id) nav(`/records/${id}`); }} />}

      <section className="card">
        <input className="input" type="search" placeholder="Search name, microchip, colour or breed" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search animals" />
        <div className="pills">
          {(['all', 'dog', 'cat'] as const).map((s) => <Pill key={s} on={sp === s} onClick={() => setSp(s)}>{s === 'all' ? 'Dogs & cats' : s === 'dog' ? 'Dogs' : 'Cats'}</Pill>)}
        </div>
        <div className="pills">
          {([['care', 'In our care'], ['shelter', 'Shelter'], ['foster', 'Foster'], ['trial', 'Trial'], ['past', 'Past animals'], ['all', 'All']] as [StatusFilter, string][]).map(([k, l]) => (
            <Pill key={k} on={st === k} onClick={() => setSt(k)}>{l}</Pill>
          ))}
        </div>
        <select className="input" value={age} onChange={(e) => setAge(e.target.value)} aria-label="Age">
          {AGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </section>

      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>{list.length} {list.length === 1 ? 'animal' : 'animals'}</h2>
        {!list.length && <Empty>{animals.length ? 'No animals match.' : 'No animal records yet. Tap Add to start one.'}</Empty>}
        {list.map((a) => {
          const due = dueBy.get(a.id);
          const s = STATUS[a.status] ?? STATUS.other;
          return (
            <Link key={a.id} to={`/records/${a.id}`} className="row" style={{ alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
              <Avatar a={a} />
              <div className="grow">
                <span className="t15">{a.name}{a.status === 'shelter' && kennel(a.kennel_id) ? <span className="t13"> · {kennel(a.kennel_id)}</span> : null}</span>
                <span className="t13">{[a.species === 'dog' ? 'Dog' : 'Cat', a.breed, a.colour, ageText(a)].filter(Boolean).join(' · ')}</span>
                {a.microchip && <span className="t13" style={{ fontVariantNumeric: 'tabular-nums' }}>Chip {a.microchip}</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span className="chip" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
                {due && <span className="chip" style={due.overdue ? { background: 'var(--red-tint)', color: 'var(--red)' } : { background: 'var(--amber-tint)', color: 'var(--amber)' }}>{due.overdue ? 'Overdue' : `${due.n} due`}</span>}
              </div>
            </Link>
          );
        })}
      </section>
    </Page>
  );
}

export function Avatar({ a, size = 48 }: { a: Row; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (a.photo_path) signedUrl('photos', a.photo_path).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [a.photo_path]);
  const style = { width: size, height: size, borderRadius: size / 2, flexShrink: 0, objectFit: 'cover' as const, background: 'var(--blue-wash)' };
  if (url) return <img src={url} alt="" style={style} />;
  return (
    <span aria-hidden="true" style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--blue)', fontSize: size * 0.4 }}>
      {a.name?.[0]?.toUpperCase() ?? '?'}
    </span>
  );
}

function AddAnimal({ onDone }: { onDone: (id?: string) => void }) {
  const { me } = useAuth();
  const animals = useTable('animals');
  const kennels = useTable('kennels').filter((k) => k.active);
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<'dog' | 'cat'>('dog');
  const [status, setStatus] = useState('shelter');
  const [kennelId, setKennelId] = useState('');
  const [since, setSince] = useState(today());
  const [withName, setWithName] = useState('');
  const [chip, setChip] = useState('');
  const chipClean = chip.replace(/\s/g, '');
  const dup = chipClean && animals.find((a) => a.microchip === chipClean);

  const save = () => {
    const a = insert('animals', {
      name: name.trim(), species, status, in_shelter: status === 'shelter', kennel_id: status === 'shelter' ? kennelId || null : null,
      microchip: chipClean, intake_on: status === 'shelter' ? since : null, status_since: since, source: 'manual',
      breed: '', colour: '', sex: 'unknown', notes: '', created_by: me.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    insert('animal_locations', {
      animal_id: a.id, status, kennel_id: status === 'shelter' ? kennelId || null : null, with_name: withName.trim(), with_contact: '', country: '',
      from_on: since, note: 'Record started', created_by: me.id, created_at: new Date().toISOString(),
    });
    toast(`${name.trim()} added`);
    onDone(a.id);
  };

  return (
    <section className="card">
      <h2 className="h">New animal record</h2>
      <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="grid2">
        <button type="button" className="seg" aria-pressed={species === 'dog'} onClick={() => { setSpecies('dog'); setKennelId(''); }}>Dog</button>
        <button type="button" className="seg" aria-pressed={species === 'cat'} onClick={() => { setSpecies('cat'); setKennelId(''); }}>Cat</button>
      </div>
      <label className="field">
        <span>Where is it now?</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
        </select>
      </label>
      {status === 'shelter' && (
        <label className="field">
          <span>Kennel · optional</span>
          <select value={kennelId} onChange={(e) => setKennelId(e.target.value)}>
            <option value="">—</option>
            {kennels.filter((k) => k.species === species).map((k) => <option key={k.id} value={k.id}>{k.code}</option>)}
          </select>
        </label>
      )}
      {['foster', 'trial', 'adopted', 'transferred', 'returned'].includes(status) && (
        <label className="field"><span>With · optional</span><input value={withName} onChange={(e) => setWithName(e.target.value)} placeholder="Foster or adopter's name" /></label>
      )}
      <label className="field">
        <span>{status === 'shelter' ? 'Came in on' : `${STATUS[status].label} since`}</span>
        <input type="date" value={since} max={today()} onChange={(e) => setSince(e.target.value)} />
      </label>
      <label className="field"><span>Microchip · optional</span><input inputMode="numeric" value={chip} onChange={(e) => setChip(e.target.value)} /></label>
      {dup && <span className="bad">That microchip is already on {dup.name}'s record.</span>}
      <span className="note">You can add breed, colour, date of birth, treatments and photos on the next screen.</span>
      <div className="btns">
        <button className="btn ghost" onClick={() => onDone()}>Cancel</button>
        <button className="btn" disabled={!name.trim() || !!dup} onClick={save}>Create record</button>
      </div>
    </section>
  );
}
