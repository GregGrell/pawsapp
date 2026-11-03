import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Empty, Icon, Page, Pill, toast } from '../components/ui';
import { CONTACT_KIND, STATUS } from '../lib/animals';
import { useTable } from '../lib/hooks';
import { insert, update, type Row } from '../lib/store';
import { shortDate } from '../lib/time';

/** Adopters, foster carers and other people animals go to. */
export function Contacts() {
  const contacts = useTable('contacts');
  const locs = useTable('animal_locations');
  const nav = useNavigate();
  const { me } = useAuth();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'adopter' | 'foster'>('all');
  const count = (id: string) => new Set(locs.filter((l) => l.contact_id === id).map((l) => l.animal_id)).size;
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return contacts
      .filter((c) => kind === 'all' || c.kind === kind)
      .filter((c) => !t || [c.full_name, c.phone, c.email, c.city, c.country].some((v) => (v ?? '').toLowerCase().includes(t)))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [contacts, q, kind]);
  const add = () => {
    const c = insert('contacts', { kind: 'adopter', full_name: 'New person', phone: '', email: '', address: '', city: '', country: '', notes: '', created_by: me.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    nav(`/contacts/${c.id}`);
  };
  return (
    <Page title="Adopters & fosters" sub={`${contacts.length} people`} back="Back" right={<button className="btn sm" onClick={add}><Icon name="plus" size={16} color="#fff" width={2.4} /> Add</button>}>
      <section className="card">
        <input className="input" type="search" placeholder="Search name, phone, email, city or country" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        <div className="pills">
          {(['all', 'adopter', 'foster'] as const).map((k) => <Pill key={k} on={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'Everyone' : k === 'adopter' ? 'Adopters' : 'Foster carers'}</Pill>)}
        </div>
      </section>
      <section className="card tight">
        {!list.length && <Empty>{contacts.length ? 'Nobody matches.' : 'Nobody yet. People are added when you record an animal going to foster or adoption, or tap Add.'}</Empty>}
        {list.map((c) => (
          <Link key={c.id} to={`/contacts/${c.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'center' }}>
            <div className="grow">
              <span className="t15">{c.full_name} <span className="t13">· {CONTACT_KIND[c.kind]}</span></span>
              <span className="t13">{[c.phone, c.email, [c.city, c.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'No contact details yet'}</span>
            </div>
            <span className="t13">{count(c.id) || ''}{count(c.id) ? ` animal${count(c.id) === 1 ? '' : 's'}` : ''}</span>
          </Link>
        ))}
      </section>
    </Page>
  );
}

export function ContactEdit() {
  const { id } = useParams();
  const c = useTable('contacts').find((x) => x.id === id);
  const locs = useTable('animal_locations').filter((l) => l.contact_id === id);
  const animals = useTable('animals');
  const blank = (x?: Row) => ({ kind: x?.kind ?? 'adopter', full_name: x?.full_name ?? '', phone: x?.phone ?? '', email: x?.email ?? '', address: x?.address ?? '', city: x?.city ?? '', country: x?.country ?? '', notes: x?.notes ?? '' });
  const [f, setF] = useState(() => blank(c));
  useEffect(() => setF(blank(c)), [c?.id, c?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) return <Page title="Contact" back="Back"><Empty>This person isn't on this device yet.</Empty></Page>;
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(blank(c));
  const save = () => {
    const patch: Row = {};
    for (const [k, v] of Object.entries(f)) patch[k] = typeof v === 'string' ? v.trim() : v;
    update('contacts', { id: c.id }, { ...patch, updated_at: new Date().toISOString() });
    toast('Saved');
  };
  return (
    <Page title={c.full_name} sub={CONTACT_KIND[c.kind]} back="Back">
      <section className="card">
        <label className="field"><span>Full name</span><input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} /></label>
        <label className="field"><span>Type</span><select value={f.kind} onChange={(e) => set('kind', e.target.value)}>{Object.entries(CONTACT_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <div className="grid2">
          <label className="field"><span>Phone</span><input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
          <label className="field"><span>Email</span><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
        </div>
        <label className="field"><span>Address</span><textarea rows={3} value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
        <div className="grid2">
          <label className="field"><span>City</span><input value={f.city} onChange={(e) => set('city', e.target.value)} /></label>
          <label className="field"><span>Country</span><input value={f.country} onChange={(e) => set('country', e.target.value)} /></label>
        </div>
        <label className="field"><span>Notes</span><textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. Has two cats, home check done" /></label>
        <button className="btn" disabled={!dirty || !f.full_name.trim()} onClick={save}>{dirty ? 'Save' : 'No changes'}</button>
        {(c.phone || c.email) && (
          <div className="btns">
            {c.phone && <a className="btn ghost sm" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>Call</a>}
            {c.email && <a className="btn ghost sm" href={`mailto:${c.email}`}>Email</a>}
          </div>
        )}
      </section>
      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Animals</h2>
        {!locs.length && <Empty>No animals linked yet.</Empty>}
        {locs.sort((x, y) => y.from_on.localeCompare(x.from_on)).map((l) => {
          const a = animals.find((x) => x.id === l.animal_id);
          const s = STATUS[l.status] ?? STATUS.other;
          return (
            <Link key={l.id} to={`/records/${l.animal_id}`} className="row" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'center' }}>
              <div className="grow">
                <span className="t15">{a?.name ?? 'Animal'}</span>
                <span className="t13">{s.label} · from {shortDate(l.from_on)}</span>
              </div>
              <Icon name="chevron" size={18} color="var(--muted)" />
            </Link>
          );
        })}
      </section>
      <p className="note">Personal details are visible to PAWS staff, management and the records team only. Every change is logged with who made it.</p>
    </Page>
  );
}
