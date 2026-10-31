import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useProfiles, useTable } from '../lib/hooks';
import { update, type Row } from '../lib/store';
import { shortDate, timeOf, today } from '../lib/time';
import { toast } from './ui';

export function useOpenMoves() {
  return useTable('animal_movements')
    .filter((m) => m.kind === 'temporary' && !m.returned_at)
    .sort((a, b) => a.out_at.localeCompare(b.out_at));
}

export function returnAnimal(m: Row, meId: string) {
  update('animal_movements', { id: m.id }, { returned_at: new Date().toISOString(), returned_by: meId });
  toast(`${m.animal_name} is back`);
}

/** Top-of-Today card: animals temporarily signed out and not back yet. */
export default function AnimalsOut() {
  const { me } = useAuth();
  const { name } = useProfiles();
  const open = useOpenMoves();
  if (!open.length) return null;
  const d = today();
  return (
    <section className="card tight" aria-label="Animals out" style={{ borderColor: '#B9D4F3', background: '#F3F8FE' }}>
      <div className="head" style={{ paddingBottom: 6 }}>
        <h2 className="h" style={{ color: '#1E4E8C' }}>Animals out · {open.length}</h2>
        <Link to="/animal-out" style={{ fontWeight: 600, fontSize: 14 }}>Sign out</Link>
      </div>
      {open.map((m) => {
        const day = today(new Date(m.out_at));
        return (
          <div key={m.id} className="row" style={{ alignItems: 'center' }}>
            <div className="grow">
              <span className="t15">{m.animal_name}</span>
              <span className="t13">{m.reason} · {name(m.out_by) || 'Volunteer'} · {day === d ? `since ${timeOf(m.out_at)}` : `since ${shortDate(day)} ${timeOf(m.out_at)}`}</span>
              {day < d && <span className="warn">Out overnight</span>}
            </div>
            <button className="btn outline sm" onClick={() => returnAnimal(m, me.id)}>Back</button>
          </div>
        );
      })}
    </section>
  );
}
