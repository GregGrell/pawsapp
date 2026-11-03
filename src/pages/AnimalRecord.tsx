import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Empty, Page, Pill, PhotoPicker, StoredImage, toast } from '../components/ui';
import { FIELD_LABEL, KIND_LABEL, SEX_LABEL, STATUS, STATUS_ORDER, TABLE_LABEL, ageText, careDue, typesFor } from '../lib/animals';
import { useProfiles, useTable } from '../lib/hooks';
import { insert, queueUpload, remove, update, type Row } from '../lib/store';
import { supabase } from '../lib/supabase';
import { addDays, shortDate, timeOf, today } from '../lib/time';
import { Avatar } from './Records';

type Tab = 'profile' | 'care' | 'meds' | 'medical' | 'where' | 'photos' | 'history';
const TABS: [Tab, string][] = [['profile', 'Profile'], ['care', 'Care'], ['meds', 'Meds'], ['medical', 'Medical'], ['where', 'Where'], ['photos', 'Photos & files'], ['history', 'History']];

const fmt = (d?: string | null) => (d ? shortDate(d) : '—');
const nowIso = () => new Date().toISOString();

export default function AnimalRecord() {
  const { id } = useParams();
  const a = useTable('animals').find((x) => x.id === id);
  const kennels = useTable('kennels');
  const [tab, setTab] = useState<Tab>('profile');
  if (!a) return <Page title="Animal record" back="Back"><Empty>This record isn't on this device yet. Check your signal and try again.</Empty></Page>;
  const s = STATUS[a.status] ?? STATUS.other;
  const kennel = kennels.find((k) => k.id === a.kennel_id)?.code;
  return (
    <Page title={a.name} sub={[a.species === 'dog' ? 'Dog' : 'Cat', a.breed, a.colour, ageText(a)].filter(Boolean).join(' · ')} back="Records">
      <section className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar a={a} size={72} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="chip" style={{ background: s.bg, color: s.fg }}>{s.label}{a.status === 'shelter' && kennel ? ` · ${kennel}` : ''}</span>
          <span className="t13">Since {fmt(a.status_since)}</span>
          <span className="t13" style={{ fontVariantNumeric: 'tabular-nums' }}>{a.microchip ? `Chip ${a.microchip}` : 'No microchip recorded'}</span>
        </div>
      </section>
      <div className="pills" role="tablist">
        {TABS.map(([k, l]) => <Pill key={k} on={tab === k} onClick={() => setTab(k)}>{l}</Pill>)}
      </div>
      {tab === 'profile' && <Profile a={a} />}
      {tab === 'care' && <Care a={a} />}
      {tab === 'meds' && <Meds a={a} />}
      {tab === 'medical' && <Medical a={a} />}
      {tab === 'where' && <Where a={a} />}
      {tab === 'photos' && <Files a={a} />}
      {tab === 'history' && <History a={a} />}
    </Page>
  );
}

// ---------- Profile ----------
function Profile({ a }: { a: Row }) {
  const animals = useTable('animals');
  const blank = () => ({
    name: a.name ?? '', species: a.species, breed: a.breed ?? '', colour: a.colour ?? '', sex: a.sex ?? 'unknown',
    dob: a.dob ?? '', dob_estimated: !!a.dob_estimated, neutered: a.neutered == null ? '' : a.neutered ? 'yes' : 'no',
    microchip: a.microchip ?? '', microchip_on: a.microchip_on ?? '', intake_on: a.intake_on ?? '', notes: a.notes ?? '',
  });
  const [f, setF] = useState(blank);
  useEffect(() => setF(blank()), [a.id, a.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
  const chip = f.microchip.replace(/\s/g, '');
  const dup = chip && animals.find((x) => x.microchip === chip && x.id !== a.id);
  const dirty = JSON.stringify(f) !== JSON.stringify(blank());
  const save = () => {
    update('animals', { id: a.id }, {
      name: f.name.trim(), species: f.species, breed: f.breed.trim(), colour: f.colour.trim(), sex: f.sex,
      dob: f.dob || null, dob_estimated: f.dob_estimated, neutered: f.neutered === '' ? null : f.neutered === 'yes',
      microchip: chip, microchip_on: f.microchip_on || null, intake_on: f.intake_on || null, notes: f.notes.trim(), updated_at: nowIso(),
    });
    toast('Saved');
  };
  return (
    <section className="card">
      <label className="field"><span>Name</span><input value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
      <div className="grid2">
        <label className="field"><span>Species</span><select value={f.species} onChange={(e) => set('species', e.target.value)}><option value="dog">Dog</option><option value="cat">Cat</option></select></label>
        <label className="field"><span>Sex</span><select value={f.sex} onChange={(e) => set('sex', e.target.value)}>{Object.entries(SEX_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <div className="grid2">
        <label className="field"><span>Breed</span><input value={f.breed} onChange={(e) => set('breed', e.target.value)} placeholder="e.g. Saluki cross" /></label>
        <label className="field"><span>Colour</span><input value={f.colour} onChange={(e) => set('colour', e.target.value)} placeholder="e.g. Black & tan" /></label>
      </div>
      <div className="grid2">
        <label className="field"><span>Date of birth</span><input type="date" value={f.dob} max={today()} onChange={(e) => set('dob', e.target.value)} /></label>
        <label className="field"><span>Neutered</span><select value={f.neutered} onChange={(e) => set('neutered', e.target.value)}><option value="">Not known</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
        <input type="checkbox" checked={f.dob_estimated} onChange={(e) => set('dob_estimated', e.target.checked)} style={{ width: 20, height: 20 }} /> Date of birth is an estimate
      </label>
      <div className="grid2">
        <label className="field"><span>Microchip number</span><input inputMode="numeric" value={f.microchip} onChange={(e) => set('microchip', e.target.value)} /></label>
        <label className="field"><span>Chip inserted on</span><input type="date" value={f.microchip_on} max={today()} onChange={(e) => set('microchip_on', e.target.value)} /></label>
      </div>
      {dup && <span className="bad">That microchip is already on {dup.name}'s record.</span>}
      {chip && !/^\d{15}$/.test(chip) && <span className="warn">Most microchips are 15 digits. This one has {chip.length} characters. Worth double-checking.</span>}
      <label className="field"><span>Came into PAWS on</span><input type="date" value={f.intake_on} max={today()} onChange={(e) => set('intake_on', e.target.value)} /></label>
      <label className="field"><span>Notes</span><textarea rows={4} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Temperament, good with kids / cats / dogs, history…" /></label>
      <button className="btn" disabled={!dirty || !f.name.trim() || !!dup} onClick={save}>{dirty ? 'Save changes' : 'No changes'}</button>
    </section>
  );
}

// ---------- Care: vaccinations, worming, flea & tick, RATT ----------
function Care({ a }: { a: Row }) {
  const { name } = useProfiles();
  const allTypes = useTable('treatment_types');
  const types = typesFor(allTypes, a.species);
  const treatments = useTable('treatments').filter((t) => t.animal_id === a.id).sort((x, y) => (y.given_on ?? y.next_due_on).localeCompare(x.given_on ?? x.next_due_on));
  const [adding, setAdding] = useState<{ type?: Row | null; prefill?: Row | null } | null>(null);
  const due = careDue([{ ...a, status: STATUS[a.status]?.inCare ? a.status : 'shelter' }], treatments, allTypes, 36500);
  const latestOf = (t: Row) => treatments.find((x) => x.type_id === t.id && x.given_on);
  const dueOf = (t: Row) => due.find((d) => d.type?.id === t.id);
  const [open, setOpen] = useState<string | null>(null);

  // Export checks
  const rabies = treatments.filter((t) => t.kind === 'vaccine' && /rabies/i.test(t.name) && t.given_on);
  const firstRabies = rabies.length ? rabies.map((t) => t.given_on).sort()[0] : null;
  const ratt = treatments.filter((t) => t.kind === 'ratt' && t.given_on).sort((x, y) => y.given_on.localeCompare(x.given_on))[0];

  return (
    <>
      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Due dates</h2>
        {types.map((t) => {
          const last = latestOf(t);
          const d = dueOf(t);
          const over = d && d.due < today();
          const soon = d && !over && d.due <= addDays(today(), 14);
          return (
            <div key={t.id} className="row" style={{ alignItems: 'center' }}>
              <div className="grow">
                <span className="t15">{t.name}</span>
                <span className="t13">{last ? `Last ${fmt(last.given_on)}${last.product ? ` · ${last.product}` : ''}` : 'No record yet'}</span>
                {d && <span className="t13" style={over ? { color: 'var(--red)', fontWeight: 700 } : soon ? { color: 'var(--amber)', fontWeight: 700 } : undefined}>{over ? 'Overdue since' : 'Due'} {fmt(d.due)}</span>}
              </div>
              <button className={`btn sm ${d && (over || soon) ? '' : 'ghost'}`} style={{ flex: '0 0 auto' }} onClick={() => setAdding({ type: t, prefill: last })}>{d && (over || soon) ? 'Done' : 'Log'}</button>
            </div>
          );
        })}
        <button className="btn outline" style={{ marginTop: 8 }} onClick={() => setAdding({ type: null })}>+ Log another treatment</button>
      </section>

      {adding && <TreatmentForm a={a} type={adding.type ?? null} prefill={adding.prefill ?? null} onDone={() => setAdding(null)} />}

      {(a.microchip_on || firstRabies || ratt) && (
        <section className="card">
          <h2 className="h">Travel checks</h2>
          {a.microchip_on && firstRabies && firstRabies < a.microchip_on && (
            <span className="bad">Rabies vaccine on {fmt(firstRabies)} was given before the microchip went in ({fmt(a.microchip_on)}). Most destinations won't accept that vaccination. It will need repeating after the chip.</span>
          )}
          {!a.microchip_on && firstRabies && <span className="warn">No microchip date recorded. Destinations check the chip went in before the rabies vaccine.</span>}
          {a.microchip_on && firstRabies && firstRabies >= a.microchip_on && <span className="ok">Microchip ({fmt(a.microchip_on)}) is before the first rabies vaccine ({fmt(firstRabies)}).</span>}
          {ratt && (
            <span className="t14">RATT sample taken {fmt(ratt.given_on)}{ratt.result ? ` · result ${ratt.result}` : ''}. The 3-month wait for EU and UK entry ends <b>{fmt(addDays(ratt.given_on, 91))}</b>. Check the rules for each destination.</span>
          )}
        </section>
      )}

      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Treatment record</h2>
        {!treatments.length && <Empty>Nothing logged yet.</Empty>}
        {treatments.map((t) => (
          <div key={t.id} className="row" style={{ flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <div className="grow">
                <span className="t15">{t.name}{t.given_on ? '' : ' · reminder only'}</span>
                <span className="t13">{t.given_on ? `Given ${fmt(t.given_on)}` : ''}{t.next_due_on ? `${t.given_on ? ' · ' : ''}next due ${fmt(t.next_due_on)}` : ''}</span>
                <span className="t13">{[t.product, t.batch && `batch ${t.batch}`, t.vet, t.result && `result ${t.result}`, name(t.created_by)].filter(Boolean).join(' · ')}</span>
                {t.notes && <span className="t13" style={{ fontStyle: 'italic' }}>{t.notes}</span>}
              </div>
              {t.certificate_path && <button className="chip" style={{ background: 'var(--blue-wash)', color: 'var(--blue-dark)', border: 0, cursor: 'pointer', flex: '0 0 auto' }} onClick={() => setOpen(open === t.id ? null : t.id)}>Certificate {open === t.id ? '▴' : '▾'}</button>}
            </div>
            {open === t.id && <StoredImage bucket="photos" path={t.certificate_path} />}
            <ManageButton table="treatments" row={t} label={`${t.name} on ${fmt(t.given_on ?? t.next_due_on)}`} />
          </div>
        ))}
      </section>
    </>
  );
}

function TreatmentForm({ a, type, prefill, onDone }: { a: Row; type: Row | null; prefill: Row | null; onDone: () => void }) {
  const { me } = useAuth();
  const types = typesFor(useTable('treatment_types'), a.species);
  const [typeId, setTypeId] = useState(type?.id ?? '');
  const t = types.find((x) => x.id === typeId) ?? null;
  const [other, setOther] = useState('');
  const [otherKind, setOtherKind] = useState('other');
  const [given, setGiven] = useState(today());
  const [reminderOnly, setReminderOnly] = useState(false);
  const [product, setProduct] = useState(prefill?.product ?? '');
  const [batch, setBatch] = useState('');
  const [vet, setVet] = useState(prefill?.vet ?? '');
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [cert, setCert] = useState<Blob | null>(null);
  const autoDue = t?.interval_days && given ? addDays(given, t.interval_days) : '';
  const [due, setDue] = useState('');
  const [dueTouched, setDueTouched] = useState(false);
  useEffect(() => { if (!dueTouched) setDue(autoDue); }, [autoDue, dueTouched]);
  const kind = t?.kind ?? otherKind;
  const label = t?.name ?? other.trim();
  const ok = label && (reminderOnly ? !!due : !!given);

  const save = () => {
    const certificate_path = cert ? queueUpload('photos', cert, 'animals') : null;
    insert('treatments', {
      animal_id: a.id, type_id: t?.id ?? null, kind, name: label, given_on: reminderOnly ? null : given, next_due_on: due || null,
      product: product.trim(), batch: batch.trim(), vet: vet.trim(), result: result.trim(), notes: notes.trim(), certificate_path,
      created_by: me.id, created_at: nowIso(),
    });
    toast(reminderOnly ? `Reminder set for ${fmt(due)}` : `${label} logged${due ? ` · next due ${fmt(due)}` : ''}`);
    onDone();
  };

  return (
    <section className="card blue">
      <h2 className="h">{t ? t.name : 'Log a treatment'}</h2>
      {!type && (
        <label className="field">
          <span>Treatment</span>
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Other…</option>
            {types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      )}
      {!t && (
        <div className="grid2">
          <label className="field"><span>What</span><input value={other} onChange={(e) => setOther(e.target.value)} placeholder="e.g. Kennel cough" /></label>
          <label className="field"><span>Type</span><select value={otherKind} onChange={(e) => setOtherKind(e.target.value)}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
      )}
      <div className="grid2">
        <button type="button" className="seg" aria-pressed={!reminderOnly} onClick={() => setReminderOnly(false)}>Given</button>
        <button type="button" className="seg" aria-pressed={reminderOnly} onClick={() => setReminderOnly(true)}>Just set a due date</button>
      </div>
      <div className="grid2">
        {!reminderOnly && <label className="field"><span>{kind === 'ratt' ? 'Blood sample date' : 'Given on'}</span><input type="date" value={given} max={today()} onChange={(e) => setGiven(e.target.value)} /></label>}
        <label className="field"><span>Next due{t?.interval_days && !reminderOnly ? ' · auto' : ''}</span><input type="date" value={due} onChange={(e) => { setDue(e.target.value); setDueTouched(true); }} /></label>
      </div>
      {!reminderOnly && (
        <>
          <div className="grid2">
            <label className="field"><span>Product · optional</span><input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. Nobivac Rabies" /></label>
            <label className="field"><span>Batch · optional</span><input value={batch} onChange={(e) => setBatch(e.target.value)} /></label>
          </div>
          <label className="field"><span>Vet / clinic · optional</span><input value={vet} onChange={(e) => setVet(e.target.value)} /></label>
          {kind === 'ratt' && <label className="field"><span>Result · optional</span><input value={result} onChange={(e) => setResult(e.target.value)} placeholder="e.g. 2.5 IU/ml" /></label>}
          <div className="field">
            <span>{kind === 'ratt' ? 'RATT certificate' : 'Certificate / vet record'}</span>
            <PhotoPicker value={cert} onChange={setCert} label="Photo or PDF" accept="image/*,application/pdf" />
          </div>
        </>
      )}
      <label className="field"><span>Notes · optional</span><input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="btns">
        <button className="btn ghost" onClick={onDone}>Cancel</button>
        <button className="btn" disabled={!ok} onClick={save}>Save</button>
      </div>
    </section>
  );
}

/** Management can delete a mistaken entry; it stays in the History tab. */
function ManageButton({ table, row, label }: { table: string; row: Row; label: string }) {
  const { isMgmt } = useAuth();
  if (!isMgmt) return null;
  return (
    <button className="btn link sm" style={{ color: 'var(--red)', alignSelf: 'flex-start', minHeight: 28, padding: 0 }}
      onClick={() => confirm(`Delete "${label}"? It will still show in this animal's History.`) && (remove(table, { id: row.id }), toast('Deleted'))}>
      Delete
    </button>
  );
}

// ---------- Meds ----------
function Meds({ a }: { a: Row }) {
  const { me } = useAuth();
  const { name } = useProfiles();
  const meds = useTable('medications').filter((m) => m.animal_id === a.id);
  const current = meds.filter((m) => m.active && !m.ended_on);
  const past = meds.filter((m) => !(m.active && !m.ended_on)).sort((x, y) => (y.ended_on ?? '').localeCompare(x.ended_on ?? ''));
  const [med, setMed] = useState('');
  const [instr, setInstr] = useState('');
  const [start, setStart] = useState(today());
  return (
    <>
      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Current medication</h2>
        {!current.length && <Empty>None. Anything added here shows in the kennel log's "Meds given" list.</Empty>}
        {current.map((m) => (
          <div key={m.id} className="row" style={{ alignItems: 'center' }}>
            <div className="grow">
              <span className="t15">{m.name}</span>
              <span className="t13">{[m.instructions, m.started_on && `since ${fmt(m.started_on)}`].filter(Boolean).join(' · ')}</span>
            </div>
            <button className="btn ghost sm" style={{ flex: '0 0 auto' }} onClick={() => { update('medications', { id: m.id }, { active: false, ended_on: today() }); toast(`${m.name} stopped`); }}>Stop</button>
          </div>
        ))}
      </section>
      <section className="card">
        <h2 className="h">Add medication</h2>
        <div className="grid2">
          <label className="field"><span>Medicine + strength</span><input value={med} onChange={(e) => setMed(e.target.value)} /></label>
          <label className="field"><span>Dose / when</span><input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="e.g. 1 tablet twice daily" /></label>
        </div>
        <label className="field"><span>Started</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <button className="btn" disabled={!med.trim()} onClick={() => {
          insert('medications', { animal_id: a.id, name: med.trim(), instructions: instr.trim(), active: true, source: 'manual', started_on: start, created_by: me.id, created_at: nowIso() });
          setMed(''); setInstr(''); toast('Medication added');
        }}>Add</button>
      </section>
      {past.length > 0 && (
        <section className="card tight">
          <h2 className="h" style={{ paddingBottom: 6 }}>Past medication</h2>
          {past.map((m) => (
            <div key={m.id} className="row">
              <div className="grow">
                <span className="t15">{m.name}</span>
                <span className="t13">{[m.instructions, `${fmt(m.started_on)} – ${fmt(m.ended_on)}`, name(m.created_by)].filter(Boolean).join(' · ')}</span>
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

// ---------- Medical history ----------
function Medical({ a }: { a: Row }) {
  const { me } = useAuth();
  const { name } = useProfiles();
  const notes = useTable('medical_notes').filter((n) => n.animal_id === a.id).sort((x, y) => y.noted_on.localeCompare(x.noted_on) || y.created_at.localeCompare(x.created_at));
  const [on, setOn] = useState(today());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<Blob | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <section className="card">
        <h2 className="h">Add to medical history</h2>
        <div className="grid2">
          <label className="field"><span>Date</span><input type="date" value={on} max={today()} onChange={(e) => setOn(e.target.value)} /></label>
          <label className="field"><span>What</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Vet check, spay, skin infection" /></label>
        </div>
        <label className="field"><span>Details · optional</span><textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <PhotoPicker value={file} onChange={setFile} label="Vet report, photo or PDF" accept="image/*,application/pdf" />
        <button className="btn" disabled={!title.trim()} onClick={() => {
          const file_path = file ? queueUpload('photos', file, 'animals') : null;
          insert('medical_notes', { animal_id: a.id, noted_on: on, title: title.trim(), body: body.trim(), file_path, created_by: me.id, created_at: nowIso() });
          setTitle(''); setBody(''); setFile(null); toast('Added');
        }}>Add</button>
      </section>
      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Medical history</h2>
        {!notes.length && <Empty>Nothing recorded yet.</Empty>}
        {notes.map((n) => (
          <div key={n.id} className="row" style={{ flexDirection: 'column', gap: 6 }}>
            <div className="grow" style={{ width: '100%' }}>
              <span className="t15">{n.title}</span>
              <span className="t13">{fmt(n.noted_on)} · {name(n.created_by)}</span>
              {n.body && <span className="t14" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</span>}
              {n.file_path && <button className="chip" style={{ background: 'var(--blue-wash)', color: 'var(--blue-dark)', border: 0, cursor: 'pointer' }} onClick={() => setOpen(open === n.id ? null : n.id)}>Attachment {open === n.id ? '▴' : '▾'}</button>}
            </div>
            {open === n.id && <StoredImage bucket="photos" path={n.file_path} />}
            <ManageButton table="medical_notes" row={n} label={n.title} />
          </div>
        ))}
      </section>
    </>
  );
}

// ---------- Where: location history ----------
function Where({ a }: { a: Row }) {
  const { me } = useAuth();
  const { name } = useProfiles();
  const kennels = useTable('kennels');
  const history = useTable('animal_locations').filter((l) => l.animal_id === a.id).sort((x, y) => y.from_on.localeCompare(x.from_on) || y.created_at.localeCompare(x.created_at));
  const [status, setStatus] = useState(a.status === 'shelter' ? 'foster' : 'shelter');
  const [kennelId, setKennelId] = useState('');
  const [withName, setWithName] = useState('');
  const [contact, setContact] = useState('');
  const [country, setCountry] = useState('');
  const [on, setOn] = useState(today());
  const [note, setNote] = useState('');
  const code = (id?: string) => kennels.find((k) => k.id === id)?.code;
  const latest = history[0];
  const backdated = latest && on < latest.from_on;
  const needsWho = ['foster', 'trial', 'adopted'].includes(status);

  const save = () => {
    insert('animal_locations', {
      animal_id: a.id, status, kennel_id: status === 'shelter' ? kennelId || null : null, with_name: withName.trim(), with_contact: contact.trim(),
      country: country.trim(), from_on: on, note: note.trim(), created_by: me.id, created_at: nowIso(),
    });
    // show the change straight away; the server confirms it
    if (!backdated) update('animals', { id: a.id }, { status, status_since: on, in_shelter: status === 'shelter', kennel_id: status === 'shelter' ? kennelId || null : null });
    setWithName(''); setContact(''); setCountry(''); setNote('');
    toast(backdated ? 'Added to history' : `${a.name}: ${STATUS[status].label}`);
  };

  return (
    <>
      <section className="card">
        <h2 className="h">Record a move</h2>
        <label className="field">
          <span>Moving to</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_ORDER.map((k) => <option key={k} value={k}>{k === 'shelter' ? 'Shelter (new pen or back in)' : STATUS[k].label}</option>)}
          </select>
        </label>
        {status === 'shelter' && (
          <label className="field"><span>Kennel</span>
            <select value={kennelId} onChange={(e) => setKennelId(e.target.value)}>
              <option value="">—</option>
              {kennels.filter((k) => k.active && k.species === a.species).map((k) => <option key={k.id} value={k.id}>{k.code}</option>)}
            </select>
          </label>
        )}
        {status !== 'shelter' && status !== 'deceased' && (
          <div className="grid2">
            <label className="field"><span>{needsWho ? 'With (name)' : 'With / where'}</span><input value={withName} onChange={(e) => setWithName(e.target.value)} /></label>
            <label className="field"><span>Contact · optional</span><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" /></label>
          </div>
        )}
        {['adopted', 'transferred'].includes(status) && (
          <label className="field"><span>Country · optional</span><input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Qatar, UK, Canada" /></label>
        )}
        <label className="field"><span>Date</span><input type="date" value={on} max={today()} onChange={(e) => setOn(e.target.value)} /></label>
        {backdated && <span className="note">This is earlier than the latest entry ({fmt(latest.from_on)}), so it's added to the history without changing where {a.name} is now.</span>}
        <label className="field"><span>Note · optional</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="btn" disabled={needsWho && !withName.trim()} onClick={save}>{needsWho && !withName.trim() ? 'Add who they are with' : 'Save move'}</button>
      </section>
      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Where {a.name} has been</h2>
        {!history.length && <Empty>No history yet.</Empty>}
        {history.map((l, i) => {
          const s = STATUS[l.status] ?? STATUS.other;
          const until = i > 0 ? history[i - 1].from_on : null;
          return (
            <div key={l.id} className="row" style={{ flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="chip" style={{ background: s.bg, color: s.fg }}>{s.label}{l.status === 'shelter' && code(l.kennel_id) ? ` · ${code(l.kennel_id)}` : ''}</span>
                <span className="t13">{fmt(l.from_on)}{until ? ` – ${fmt(until)}` : ' – now'}</span>
              </div>
              {(l.with_name || l.country) && <span className="t14">{[l.with_name, l.with_contact, l.country].filter(Boolean).join(' · ')}</span>}
              <span className="t13">{[l.note, l.created_by ? name(l.created_by) : ''].filter(Boolean).join(' · ')}</span>
            </div>
          );
        })}
      </section>
    </>
  );
}

// ---------- Photos & files ----------
function Files({ a }: { a: Row }) {
  const { me } = useAuth();
  const files = useTable('animal_files').filter((f) => f.animal_id === a.id).sort((x, y) => y.created_at.localeCompare(x.created_at));
  const [blob, setBlob] = useState<Blob | null>(null);
  const [caption, setCaption] = useState('');
  const add = () => {
    if (!blob) return;
    const path = queueUpload('photos', blob, 'animals');
    const kind = blob.type.startsWith('image/') ? 'photo' : 'document';
    insert('animal_files', { animal_id: a.id, kind, path, caption: caption.trim(), created_by: me.id, created_at: nowIso() });
    if (kind === 'photo' && !a.photo_path) update('animals', { id: a.id }, { photo_path: path });
    setBlob(null); setCaption(''); toast('Added');
  };
  return (
    <>
      <section className="card">
        <h2 className="h">Add a photo or document</h2>
        <PhotoPicker value={blob} onChange={setBlob} label="Photo, passport scan or PDF" accept="image/*,application/pdf" required />
        <label className="field"><span>Caption · optional</span><input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Pet passport page 3" /></label>
        <button className="btn" disabled={!blob} onClick={add}>Add</button>
      </section>
      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Photos & files · {files.length}</h2>
        {!files.length && <Empty>None yet.</Empty>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {files.map((f) => (
            <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <StoredImage bucket="photos" path={f.path} alt={f.caption} />
              <span className="t13">{f.caption || (f.kind === 'photo' ? 'Photo' : 'Document')} · {fmt(today(new Date(f.created_at)))}</span>
              {f.kind === 'photo' && (a.photo_path === f.path
                ? <span className="ok" style={{ fontSize: 13 }}>Main photo</span>
                : <button className="btn link sm" style={{ alignSelf: 'flex-start', minHeight: 28, padding: 0 }} onClick={() => { update('animals', { id: a.id }, { photo_path: f.path }); toast('Main photo set'); }}>Make main photo</button>)}
              <ManageButton table="animal_files" row={f} label={f.caption || 'this file'} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ---------- History (audit log) ----------
function History({ a }: { a: Row }) {
  const { name } = useProfiles();
  const kennels = useTable('kennels');
  const types = useTable('treatment_types');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    supabase.from('animal_audit').select('*').eq('animal_id', a.id).order('changed_at', { ascending: false }).limit(300).then(({ data, error }) => {
      if (!live) return;
      if (error) setErr(navigator.onLine ? error.message : 'History needs a connection.');
      else setRows(data ?? []);
    });
    return () => {
      live = false;
    };
  }, [a.id, a.updated_at]);

  const show = (k: string, v: any): string => {
    if (v == null || v === '') return '—';
    if (k === 'kennel_id') return kennels.find((x) => x.id === v)?.code ?? '—';
    if (k === 'type_id') return types.find((x) => x.id === v)?.name ?? '—';
    if (k === 'status') return STATUS[v]?.label ?? v;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (/_path$/.test(k)) return 'file';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return shortDate(v);
    return String(v);
  };

  const items = useMemo(() => (rows ?? []).filter((r) => {
    // location moves already appear as their own entry
    if (r.table_name === 'animals' && r.action === 'update') {
      const keys = Object.keys(r.changes);
      return !keys.every((k) => ['status', 'status_since', 'kennel_id'].includes(k));
    }
    return true;
  }), [rows]);

  return (
    <section className="card tight">
      <h2 className="h" style={{ paddingBottom: 6 }}>Who changed what</h2>
      {err && <span className="bad">{err}</span>}
      {!rows && !err && <Empty>Loading…</Empty>}
      {rows && !items.length && <Empty>No changes recorded yet.</Empty>}
      {items.map((r) => {
        const what = TABLE_LABEL[r.table_name] ?? r.table_name;
        const verb = r.action === 'insert' ? 'added' : r.action === 'delete' ? 'deleted' : 'changed';
        const c = r.changes as Record<string, any>;
        const lines =
          r.action === 'update'
            ? Object.entries(c).map(([k, [o, n]]) => `${FIELD_LABEL[k] ?? k}: ${show(k, o)} → ${show(k, n)}`)
            : [c.name ?? c.title ?? (c.status ? STATUS[c.status]?.label : '') ?? '', c.given_on ? `given ${shortDate(c.given_on)}` : '', c.from_on ? `from ${shortDate(c.from_on)}` : '', c.with_name ?? '']
                .filter(Boolean)
                .slice(0, 3);
        return (
          <div key={r.id} className="row" style={{ flexDirection: 'column', gap: 2 }}>
            <span className="t15">{what} {verb}</span>
            <span className="t13">{shortDate(today(new Date(r.changed_at)))} {timeOf(r.changed_at)} · {r.changed_by ? name(r.changed_by) : 'System'}</span>
            {lines.map((l, i) => <span key={i} className="t13" style={{ color: 'var(--ink-2)' }}>{l}</span>)}
          </div>
        );
      })}
    </section>
  );
}
