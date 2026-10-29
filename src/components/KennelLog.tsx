import { useMemo, useState } from 'react';
import { useAuth } from '../auth';
import { useProfiles, useTable } from '../lib/hooks';
import { insert, type Row } from '../lib/store';
import { timeOf, today } from '../lib/time';
import { Icon, toast } from './ui';

type Action = 'fed' | 'exercised' | 'cleaned' | 'meds';
type Species = 'dog' | 'cat';
const TITLE: Record<Action, string> = { fed: 'Fed', exercised: 'Exercised', cleaned: 'Cleaned', meds: 'Meds given' };
const PLURAL: Record<Species, string> = { dog: 'dogs', cat: 'cats' };

export default function KennelLog() {
  const { me } = useAuth();
  const animals = useTable('animals');
  const kennels = useTable('kennels');
  const meds = useTable('medications');
  const logs = useTable('kennel_logs');
  const { name } = useProfiles();

  const [action, setAction] = useState<Action | null>(null);
  const [species, setSpecies] = useState<Species | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [animalId, setAnimalId] = useState<string | null>(null);

  const reset = () => {
    setAction(null);
    setSpecies(null);
    setSel({});
    setAnimalId(null);
  };

  const kennelCode = (id?: string) => kennels.find((k) => k.id === id)?.code ?? '';

  const options: { key: string; label: string; sub: string }[] = useMemo(() => {
    if (!action || !species) return [];
    if (action === 'exercised') return animals.filter((a) => a.species === species).map((a) => ({ key: a.name, label: a.name, sub: kennelCode(a.kennel_id) }));
    if (action === 'cleaned') return kennels.filter((k) => k.species === species && k.active).map((k) => ({ key: k.code, label: k.code, sub: '' }));
    if (action === 'meds' && animalId) return meds.filter((m) => m.animal_id === animalId).map((m) => ({ key: m.name, label: m.name, sub: m.instructions }));
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, species, animals, kennels, meds, animalId]);

  const medAnimals = useMemo(() => {
    if (action !== 'meds' || !species) return [];
    const ids = new Set(meds.map((m) => m.animal_id));
    return animals.filter((a) => a.species === species && ids.has(a.id));
  }, [action, species, animals, meds]);

  const picked = options.filter((o) => sel[o.key]).map((o) => o.key);
  const allOn = options.length > 0 && picked.length === options.length;

  const save = (a: Action, sp: Species, items: string[], animal?: Row) => {
    let summary = `${TITLE[a]} — ${PLURAL[sp]}`;
    if (a === 'exercised') summary = `Exercised — ${allOn ? `all ${PLURAL[sp]} (${items.length})` : items.join(', ')}`;
    if (a === 'cleaned') summary = `Cleaned — ${items.join(', ')}`;
    if (a === 'meds') summary = `Meds — ${animal?.name}: ${items.join(', ')}`;
    insert('kennel_logs', { created_by: me.id, created_at: new Date().toISOString(), action: a, species: sp, items, animal_id: animal?.id ?? null, summary });
    toast('Logged — added to your timesheet');
    reset();
  };

  const pickSpecies = (sp: Species) => {
    if (action === 'fed') return save('fed', sp, []);
    setSpecies(sp);
  };

  const todays = logs.filter((l) => today(new Date(l.created_at)) === today()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const animalName = animals.find((a) => a.id === animalId)?.name;

  let saveLabel = 'Tick at least one';
  if (picked.length) {
    if (action === 'exercised') saveLabel = `Save · ${picked.length} exercised`;
    if (action === 'cleaned') saveLabel = `Save · ${picked.length} kennels cleaned`;
    if (action === 'meds') saveLabel = `Save · ${picked.length} given to ${animalName}`;
  } else if (action === 'meds' && !animalId) saveLabel = 'Choose an animal';

  return (
    <section className="card">
      <div className="head">
        <h2 className="h">Kennel log</h2>
        <span className="t13">Goes in end-of-day report</span>
      </div>

      {!action && (
        <div className="grid2">
          {(Object.keys(TITLE) as Action[]).map((a) => (
            <button key={a} className="tile" onClick={() => setAction(a)}>
              <Icon name="plus" size={18} color="var(--blue)" width={2.2} /> {TITLE[a]}
            </button>
          ))}
        </div>
      )}

      {action && !species && (
        <div className="panel">
          <strong style={{ fontSize: 16 }}>{TITLE[action]} — dogs or cats?</strong>
          <div className="grid2">
            <button className="tile" style={{ background: '#fff' }} onClick={() => pickSpecies('dog')}>Dogs</button>
            <button className="tile" style={{ background: '#fff' }} onClick={() => pickSpecies('cat')}>Cats</button>
          </div>
          <button className="btn link" onClick={reset}>Cancel</button>
        </div>
      )}

      {action && species && action !== 'fed' && (
        <div className="panel">
          <div className="head">
            <strong style={{ fontSize: 16 }}>
              {TITLE[action]} · {action === 'cleaned' ? `${PLURAL[species]} kennels` : PLURAL[species]}
            </strong>
            {action !== 'meds' && options.length > 0 && (
              <button className="btn link sm" style={{ color: 'var(--blue)' }} onClick={() => setSel(allOn ? {} : Object.fromEntries(options.map((o) => [o.key, true])))}>
                {allOn ? 'Clear all' : 'Select all'}
              </button>
            )}
          </div>

          {action === 'meds' && (
            <>
              <span className="t14" style={{ fontWeight: 600 }}>Which animal?</span>
              {medAnimals.length ? (
                <div className="pills">
                  {medAnimals.map((a) => (
                    <button key={a.id} className="pill" aria-pressed={animalId === a.id} onClick={() => { setAnimalId(a.id); setSel({}); }}>{a.name}</button>
                  ))}
                </div>
              ) : (
                <p className="t14">No {PLURAL[species]} are on medication at the moment.</p>
              )}
            </>
          )}

          {action === 'cleaned' ? (
            options.length ? (
              <div className="grid4">
                {options.map((o) => (
                  <label key={o.key} className={`ktile ${sel[o.key] ? 'on' : ''}`}>
                    <input type="checkbox" checked={!!sel[o.key]} onChange={() => setSel({ ...sel, [o.key]: !sel[o.key] })} />
                    {o.label}
                  </label>
                ))}
              </div>
            ) : (
              <p className="t14">No kennels set up yet. Management can add them under More → Kennels.</p>
            )
          ) : (
            options.length > 0 && (
              <div className="listbox">
                {options.map((o) => (
                  <label key={o.key} className="check">
                    <input type="checkbox" checked={!!sel[o.key]} onChange={() => setSel({ ...sel, [o.key]: !sel[o.key] })} />
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      {o.label}
                      {action === 'meds' && o.sub && <span className="t13" style={{ fontWeight: 500 }}>{o.sub}</span>}
                    </span>
                    {action === 'exercised' && <span className="t13" style={{ fontWeight: 500 }}>{o.sub}</span>}
                  </label>
                ))}
              </div>
            )
          )}
          {action === 'exercised' && !options.length && <p className="t14">No {PLURAL[species]} listed yet. Management can add them under More → Kennels.</p>}

          <button className="btn" disabled={!picked.length} onClick={() => save(action, species, picked, animals.find((a) => a.id === animalId))}>{saveLabel}</button>
          <button className="btn link" onClick={reset}>Cancel</button>
        </div>
      )}

      <div>
        <span className="t13" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>Logged today</span>
        {todays.length === 0 && <p className="empty">Nothing yet.</p>}
        {todays.map((l) => (
          <div key={l.id} className="row">
            <span className="time">{timeOf(l.created_at)}</span>
            <div className="grow">
              <span className="t14">{l.summary}</span>
              <span className="t13">{name(l.created_by)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
