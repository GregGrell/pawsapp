import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { careDue, type Due } from '../lib/animals';
import { useTable } from '../lib/hooks';
import { insert } from '../lib/store';
import { addDays, shortDate, today } from '../lib/time';
import { toast } from './ui';

/** Today: vaccinations, worming, flea & tick due this week or overdue, with a one-tap Done. */
export default function CareDue() {
  const animals = useTable('animals');
  const treatments = useTable('treatments');
  const types = useTable('treatment_types');
  const [all, setAll] = useState(false);
  const due = useMemo(() => careDue(animals, treatments, types, 7), [animals, treatments, types]);
  if (!due.length) return null;
  const shown = all ? due : due.slice(0, 6);
  return (
    <section className="card tight" aria-label="Care due">
      <div className="head" style={{ paddingBottom: 6 }}>
        <h2 className="h">Care due · {due.length}</h2>
        <Link to="/records" style={{ fontWeight: 600, fontSize: 14 }}>Records</Link>
      </div>
      {shown.map((d) => <DueRow key={`${d.animal.id}-${d.type?.id ?? d.name}`} d={d} />)}
      {due.length > 6 && <button className="btn link sm" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${due.length}`}</button>}
    </section>
  );
}

function DueRow({ d }: { d: Due }) {
  const { me } = useAuth();
  const day = today();
  const done = () => {
    const next = d.type?.interval_days ? addDays(day, d.type.interval_days) : null;
    insert('treatments', {
      animal_id: d.animal.id, type_id: d.type?.id ?? null, kind: d.kind, name: d.name, given_on: day, next_due_on: next,
      product: d.last?.product ?? '', batch: '', vet: '', result: '', notes: '', certificate_path: null, created_by: me.id, created_at: new Date().toISOString(),
    });
    toast(`${d.animal.name} · ${d.name} done${next ? ` · next due ${shortDate(next)}` : ''}`);
  };
  return (
    <div className="row" style={{ alignItems: 'center' }}>
      <Link to={`/records/${d.animal.id}`} className="grow" style={{ textDecoration: 'none', color: 'inherit' }}>
        <span className="t15">{d.animal.name} · {d.name}</span>
        <span className="t13" style={d.overdue ? { color: 'var(--red)', fontWeight: 700 } : undefined}>
          {d.overdue ? `Overdue since ${shortDate(d.due)}` : d.due === day ? 'Due today' : `Due ${shortDate(d.due)}`}
          {d.animal.status !== 'shelter' ? ` · ${d.animal.status === 'foster' ? 'at foster' : 'on trial'}` : ''}
        </span>
      </Link>
      <button className="btn sm" style={{ flex: '0 0 auto' }} onClick={done}>Done</button>
    </div>
  );
}
