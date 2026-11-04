import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import CloseOut, { OUTCOME_COLOR, OUTCOME_LABEL } from '../components/CloseOut';
import { Empty, Icon, Page, StoredImage, toast } from '../components/ui';
import { CATEGORIES, catStyle, hm, itemsOn, useProfiles, useTable } from '../lib/hooks';
import { insert, update, type Row } from '../lib/store';
import { Link } from 'react-router-dom';
import { birthdaysOn } from '../lib/animals';
import { addDays, dayLabel, longDate, minusMinutes, monthLabel, nowHM, today, weekday } from '../lib/time';

export default function Calendar() {
  const { me, isMgmt } = useAuth();
  const { name, list: people } = useProfiles();
  const items = useTable('calendar_items');
  const outcomes = useTable('appointment_outcomes');
  const comps = useTable('task_completions');
  const animals = useTable('animals');
  const [params, setParams] = useSearchParams();
  const d = today();
  const [day, setDay] = useState(d);
  const [weekStart, setWeekStart] = useState(addDays(d, -weekday(d)));
  const [closing, setClosing] = useState<string | null>(null);
  const formOpen = params.has('add');
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const list = itemsOn(items, day);
  const anytime = list.filter((i) => !i.at_time);
  const timed = list.filter((i) => i.at_time);
  const now = nowHM();

  const remove = (it: Row) => {
    if (!confirm(`Remove "${it.title}" from the calendar?${it.repeat !== 'none' ? ' This removes every repeat.' : ''}`)) return;
    update('calendar_items', { id: it.id }, { active: false });
    toast('Removed');
  };

  const entry = (it: Row) => {
    const c = catStyle(it);
    const out = outcomes.find((o) => o.item_id === it.id && o.occurs_on === day);
    const comp = comps.find((x) => x.item_id === it.id && x.occurs_on === day && x.status === 'done');
    const isAppt = it.kind === 'appointment';
    const due = isAppt && it.at_time && (day < d || (day === d && hm(it.at_time) <= now)) && !out;
    const canEdit = isMgmt || it.created_by === me.id;
    return (
      <div className="row" key={it.id}>
        <span className="time">{hm(it.at_time) || 'Any'}</span>
        <div className="grow">
          <span className="chip" style={{ background: c.bg, color: c.fg }}>{c.label}</span>
          <span className="t15">{it.title}</span>
          <span className="t13">
            {it.repeat !== 'none' ? `${it.repeat === 'daily' ? 'Daily' : 'Weekly'} · ` : ''}
            Added by {name(it.created_by)}
            {(it.attendees?.length ? it.attendees : it.assignee ? [it.assignee] : []).length ? ` · ${(it.attendees?.length ? it.attendees : [it.assignee]).map((id: string) => name(id)).join(', ')}` : ''}
          </span>
          {it.external_people && <span className="t14">With: {it.external_people}</span>}
          {it.notes && <span className="t14">{it.notes}</span>}
          {comp && <span className="ok">Done by {name(comp.done_by)}</span>}
          {due && closing !== it.id && (
            <div className="head">
              <span className="warn">Needs close-out</span>
              <button className="btn outline sm" onClick={() => setClosing(it.id)}>Close out</button>
            </div>
          )}
          {closing === it.id && <CloseOut item={it} day={day} onDone={() => setClosing(null)} />}
          {out && (
            <div style={{ borderRadius: 10, background: 'var(--soft)', border: '1px solid var(--line)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: OUTCOME_COLOR[out.outcome] }}>{OUTCOME_LABEL[out.outcome]} · closed out by {name(out.closed_by)}</span>
              {out.note && <span className="t14">{out.note}</span>}
              <StoredImage bucket="photos" path={out.photo_path} />
            </div>
          )}
          {canEdit && (
            <button className="btn link sm" style={{ alignSelf: 'flex-start', padding: 0, minHeight: 36, color: 'var(--red)' }} onClick={() => remove(it)}>
              Remove
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Page
      title="Calendar"
      sub={monthLabel(day)}
      right={
        <button className="btn" onClick={() => (formOpen ? setParams({}) : setParams({ add: '1' }))}>
          <Icon name="plus" size={18} color="#fff" width={2.4} /> {formOpen ? 'Close' : 'Add'}
        </button>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="btn link sm" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><Icon name="back" /></button>
        <div className="week" style={{ flex: 1 }}>
          {week.map((x) => {
            const { dow, num } = dayLabel(x);
            const count = itemsOn(items, x).length;
            const bdays = birthdaysOn(animals, x).length;
            return (
              <button key={x} className={`${x === day ? 'on' : ''} ${x === d ? 'today' : ''}`} onClick={() => setDay(x)} aria-label={`${longDate(x)}, ${count} entries${bdays ? `, ${bdays} birthday${bdays > 1 ? 's' : ''}` : ''}`}>
                <span>{dow}</span>
                <b>{num}</b>
                <span style={{ fontSize: 10 }}>{bdays ? '🎂' : ''}{count ? '•'.repeat(Math.min(count, 3)) : bdays ? '' : ' '}</span>
              </button>
            );
          })}
        </div>
        <button className="btn link sm" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}><Icon name="chevron" /></button>
      </div>

      {formOpen && <AddForm day={day} people={people.filter((p) => p.active)} initialKind={params.get('add') === 'task' ? 'task' : 'appointment'} meId={me.id} onSaved={(date) => { setDay(date); setParams({}); }} />}

      <Birthdays day={day} animals={animals} />

      {anytime.length > 0 && (
        <section className="card tight">
          <h2 className="h" style={{ paddingBottom: 6 }}>Any time · {longDate(day)}</h2>
          {anytime.map((it) => entry(it))}
        </section>
      )}
      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>{longDate(day)}</h2>
        {timed.length === 0 && <Empty>Nothing timed on this day.</Empty>}
        {timed.map((it) => entry(it))}
      </section>
    </Page>
  );

}

function AddForm({ day, people, initialKind, meId, onSaved }: { day: string; people: Row[]; initialKind: 'appointment' | 'task'; meId: string; onSaved: (date: string) => void }) {
    const [kind, setKind] = useState<'appointment' | 'task'>(initialKind);
    const [category, setCategory] = useState('vet');
    const [repeat, setRepeat] = useState('none');
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(day);
    const [time, setTime] = useState('');
    const [who, setWho] = useState<string[]>([]);
    const [external, setExternal] = useState('');
    const toggle = (id: string) => setWho((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
    const [notes, setNotes] = useState('');
    const save = () => {
      insert('calendar_items', {
        kind, category: kind === 'task' ? 'task' : category, title: title.trim(), starts_on: date, at_time: time || null,
        repeat, assignee: who[0] ?? null, attendees: who, external_people: kind === 'appointment' ? external.trim() : '', notes: notes.trim(), created_by: meId, created_at: new Date().toISOString(), active: true,
      });
      toast('Added to the calendar');
      onSaved(date);
    };
    return (
      <section className="card blue">
        <h2 className="h">Add to calendar</h2>
        <div className="grid2">
          <button className="seg" aria-pressed={kind === 'appointment'} onClick={() => setKind('appointment')}>Appointment</button>
          <button className="seg" aria-pressed={kind === 'task'} onClick={() => setKind('task')}>Task</button>
        </div>
        {kind === 'appointment' ? (
          <div className="field">
            <span>Type</span>
            <div className="pills">
              {CATEGORIES.map((c) => (
                <button key={c.key} type="button" className="pill" aria-pressed={category === c.key}
                  style={{ background: c.bg, color: c.fg, borderColor: category === c.key ? c.fg : 'var(--field)', borderRadius: 10 }}
                  onClick={() => setCategory(c.key)}>{c.label}</button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="field">
          <span>Repeats</span>
          <div className="pills">
            {[['none', 'One-off'], ['daily', 'Daily'], ['weekly', 'Weekly']].map(([k, l]) => (
              <button key={k} type="button" className="pill" aria-pressed={repeat === k} onClick={() => setRepeat(k)}>{l}</button>
            ))}
          </div>
        </div>
        <label className="field"><span>What is it?</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'task' ? 'e.g. Wash all bedding' : 'e.g. Vaccines — Milo'} /></label>
        <div className="grid2">
          <label className="field"><span>{repeat === 'none' ? 'Date' : 'Starting'}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field"><span>Time · optional</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        </div>
        <span className="note">{time ? `A reminder goes out at ${minusMinutes(time, 60)}, 1 hour before.` : 'No time set — the reminder comes first thing in the morning.'}</span>
        <div className="field">
          <span>{kind === 'appointment' && category === 'meeting' ? "Who's attending?" : "Who's on it?"} · tap everyone who applies</span>
          <div className="pills">
            <button type="button" className="pill" aria-pressed={who.length === 0} onClick={() => setWho([])}>Anyone</button>
            {people.filter((p) => p.role !== 'records').map((p) => <button key={p.id} type="button" className="pill" aria-pressed={who.includes(p.id)} onClick={() => toggle(p.id)}>{p.full_name.split(' ')[0]}{people.filter((q) => q.full_name.split(' ')[0] === p.full_name.split(' ')[0]).length > 1 ? ` ${p.full_name.split(' ')[1]?.[0] ?? ''}` : ''}</button>)}
          </div>
          {who.length > 0 && <span className="t13">Reminders go to {who.length === 1 ? 'this person' : `these ${who.length} people`} only.</span>}
        </div>
        {kind === 'appointment' && (
          <label className="field"><span>External people · optional</span><input value={external} onChange={(e) => setExternal(e.target.value)} placeholder="e.g. Dr Ahmed (vet), Sarah from QFF" /></label>
        )}
        <label className="field"><span>Notes · optional</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Clinic address, what to bring" /></label>
        <button className="btn" disabled={!title.trim() || !date} onClick={save}>{title.trim() ? 'Add to calendar' : 'Add a description to save'}</button>
      </section>
    );
  }

function Birthdays({ day, animals }: { day: string; animals: Row[] }) {
  const list = birthdaysOn(animals, day);
  if (!list.length) return null;
  return (
    <section className="card tight" style={{ borderColor: '#F9C6E0', background: '#FFF5FA' }}>
      <h2 className="h" style={{ paddingBottom: 6, color: '#9D174D' }}>🎂 Birthdays · {longDate(day)}</h2>
      {list.map(({ a, turns }) => (
        <Link key={a.id} to={`/records/${a.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'center' }}>
          <span className="chip" style={{ background: '#FCE7F3', color: '#9D174D' }}>Birthday</span>
          <div className="grow">
            <span className="t15">{a.name} turns {turns}{a.dob_estimated ? ' (estimated)' : ''}</span>
            <span className="t13">{a.species === 'dog' ? 'Dog' : 'Cat'}{a.breed ? ` · ${a.breed}` : ''}{a.status !== 'shelter' ? ` · ${a.status === 'foster' ? 'at foster' : 'on trial'}` : ''}</span>
          </div>
        </Link>
      ))}
    </section>
  );
}
