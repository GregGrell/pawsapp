import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Empty, Icon, Page, Pill, toast } from '../components/ui';
import { STATUS, isRabies, latestGiven } from '../lib/animals';
import { useProfiles, useTable } from '../lib/hooks';
import { insert, remove, update, type Row } from '../lib/store';
import { shortDate, today } from '../lib/time';

/** Saved flight lists. */
export function FlightLists() {
  const lists = useTable('flight_lists').sort((a, b) => (b.flight_on ?? '').localeCompare(a.flight_on ?? '') || b.created_at.localeCompare(a.created_at));
  const { name } = useProfiles();
  const nav = useNavigate();
  const { me } = useAuth();
  const create = () => {
    const l = insert('flight_lists', { title: '', flight_on: null, animal_ids: [], created_by: me.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    nav(`/flight-lists/${l.id}`);
  };
  return (
    <Page title="Flight lists" sub="Export paperwork reports" back="Back"
      right={<button className="btn sm" onClick={create}><Icon name="plus" size={16} color="#fff" width={2.4} /> New</button>}>
      <section className="card tight">
        {!lists.length && <Empty>No flight lists yet. Tap New to build one.</Empty>}
        {lists.map((l) => (
          <Link key={l.id} to={`/flight-lists/${l.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'center' }}>
            <div className="grow">
              <span className="t15">{l.title || 'Untitled flight'}</span>
              <span className="t13">{l.flight_on ? shortDate(l.flight_on) : 'No date'} · {l.animal_ids.length} animal{l.animal_ids.length === 1 ? '' : 's'} · {name(l.created_by)}</span>
            </div>
            <Icon name="chevron" size={18} color="var(--muted)" />
          </Link>
        ))}
      </section>
    </Page>
  );
}

type Line = {
  a: Row; species: string; chip: string; chipOn: string; rabiesOn: string; rattOn: string; rabiesExp: string;
  maker: string; batch: string; wormOn: string; wormDrug: string; gaps: string[];
};

function buildLines(animals: Row[], ids: string[], treatments: Row[]): Line[] {
  return ids
    .map((id) => animals.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => {
      const tr = treatments.filter((t) => t.animal_id === a!.id);
      const rab = latestGiven(tr, isRabies);
      const ratt = latestGiven(tr, (t) => t.kind === 'ratt');
      const worm = a!.species === 'dog' ? latestGiven(tr, (t) => t.kind === 'worming') : null;
      const l: Line = {
        a: a!, species: a!.species === 'dog' ? 'Dog' : 'Cat', chip: a!.microchip ?? '', chipOn: a!.microchip_on ?? '',
        rabiesOn: rab?.given_on ?? '', rattOn: ratt?.given_on ?? '', rabiesExp: rab?.next_due_on ?? '',
        maker: [rab?.manufacturer, rab?.product].filter(Boolean).join(' · '), batch: rab?.batch ?? '',
        wormOn: worm?.given_on ?? '', wormDrug: worm?.product ?? '', gaps: [],
      };
      const need: [keyof Line, string][] = [['chip', 'microchip'], ['chipOn', 'chip date'], ['rabiesOn', 'rabies date'], ['rattOn', 'RATT date'], ['rabiesExp', 'rabies expiry'], ['maker', 'rabies manufacturer'], ['batch', 'rabies batch']];
      if (a!.species === 'dog') need.push(['wormOn', 'deworming date'], ['wormDrug', 'deworming medication']);
      l.gaps = need.filter(([k]) => !l[k]).map(([, n]) => n);
      if (l.chipOn && l.rabiesOn && l.rabiesOn < l.chipOn) l.gaps.push('rabies given before chip');
      return l;
    });
}

const COLS: [string, (l: Line) => string][] = [
  ['Name', (l) => l.a.name],
  ['Dog / cat', (l) => l.species],
  ['Microchip', (l) => l.chip],
  ['Chip inserted', (l) => l.chipOn],
  ['Rabies vaccine', (l) => l.rabiesOn],
  ['RATT blood draw', (l) => l.rattOn],
  ['Rabies expiry', (l) => l.rabiesExp],
  ['Rabies manufacturer', (l) => l.maker],
  ['Rabies batch', (l) => l.batch],
  ['Deworming date', (l) => (l.species === 'Dog' ? l.wormOn : 'n/a')],
  ['Deworming medication', (l) => (l.species === 'Dog' ? l.wormDrug : 'n/a')],
];
const dmy = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);

/** One flight list: pick animals, see the report, download CSV or print. */
export function FlightListEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const list = useTable('flight_lists').find((l) => l.id === id);
  const animals = useTable('animals');
  const treatments = useTable('treatments');
  const [q, setQ] = useState('');
  const [sp, setSp] = useState<'all' | 'dog' | 'cat'>('all');
  const [title, setTitle] = useState(list?.title ?? '');
  const [picking, setPicking] = useState(!list?.animal_ids?.length);
  useEffect(() => setTitle(list?.title ?? ''), [list?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ids: string[] = list?.animal_ids ?? [];
  const lines = useMemo(() => buildLines(animals, ids, treatments), [animals, ids, treatments]);
  const choices = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\s/g, '');
    return animals
      .filter((a) => STATUS[a.status]?.inCare)
      .filter((a) => sp === 'all' || a.species === sp)
      .filter((a) => !term || a.name.toLowerCase().includes(term) || (digits.length >= 3 && (a.microchip ?? '').includes(digits)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [animals, q, sp]);

  if (!list) return <Page title="Flight list" back="Back"><Empty>This list isn't on this device yet.</Empty></Page>;
  const save = (patch: Row) => update('flight_lists', { id: list.id }, { ...patch, updated_at: new Date().toISOString() });
  const toggle = (aid: string) => save({ animal_ids: ids.includes(aid) ? ids.filter((x) => x !== aid) : [...ids, aid] });
  const name = list.title || 'Flight list';

  const csv = () => {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [COLS.map(([h]) => esc(h)).join(','), ...lines.map((l) => COLS.map(([, f]) => esc(dmy(f(l)))).join(','))];
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(name + (list.flight_on ? ` ${list.flight_on}` : '')).replace(/[^\w\- ]+/g, '').trim() || 'flight-list'}.csv`;
    a.click();
  };

  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return toast('Allow pop-ups to print');
    const head = COLS.map(([h]) => `<th>${h}</th>`).join('');
    const body = lines.map((l) => `<tr>${COLS.map(([, f]) => `<td>${dmy(f(l)) || '<span class="gap">—</span>'}</td>`).join('')}</tr>`).join('');
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>
      body{font-family:Arial,sans-serif;margin:24px;color:#111} h1{font-size:18px;margin:0 0 4px} p{margin:0 0 14px;color:#444;font-size:12px}
      table{border-collapse:collapse;width:100%;font-size:11px} th,td{border:1px solid #999;padding:5px 6px;text-align:left;vertical-align:top} th{background:#eee}
      .gap{color:#c00;font-weight:bold} @page{size:A4 landscape;margin:12mm}</style></head><body>
      <h1>PAWS Rescue Qatar · ${esc(name)}</h1><p>${list.flight_on ? `Flight date ${dmy(list.flight_on)} · ` : ''}${lines.length} animals · printed ${dmy(today())}</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const missing = lines.filter((l) => l.gaps.length);

  return (
    <Page title={name} sub={`${lines.length} animal${lines.length === 1 ? '' : 's'}${list.flight_on ? ` · ${shortDate(list.flight_on)}` : ''}`} back="Flight lists">
      <section className="card">
        <div className="grid2">
          <label className="field"><span>Flight / destination</span><input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== list.title && save({ title: title.trim() })} placeholder="e.g. QR003 to London" /></label>
          <label className="field"><span>Flight date</span><input type="date" value={list.flight_on ?? ''} onChange={(e) => save({ flight_on: e.target.value || null })} /></label>
        </div>
      </section>

      <section className="card">
        <div className="head">
          <h2 className="h">Animals on this flight · {ids.length}</h2>
          <button className="btn ghost sm" onClick={() => setPicking(!picking)}>{picking ? 'Done choosing' : 'Add / remove'}</button>
        </div>
        {picking && (
          <>
            <input className="input" type="search" placeholder="Search name or microchip" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search animals" />
            <div className="pills">
              {(['all', 'dog', 'cat'] as const).map((s) => <Pill key={s} on={sp === s} onClick={() => setSp(s)}>{s === 'all' ? 'All' : s === 'dog' ? 'Dogs' : 'Cats'}</Pill>)}
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
              {!choices.length && <Empty>No animals match.</Empty>}
              {choices.map((a) => (
                <label key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', borderTop: '1px solid var(--line-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={ids.includes(a.id)} onChange={() => toggle(a.id)} style={{ width: 22, height: 22 }} />
                  <span className="t15" style={{ flex: 1 }}>{a.name} <span className="t13">· {a.species === 'dog' ? 'Dog' : 'Cat'}{a.microchip ? ` · ${a.microchip}` : ''}</span></span>
                </label>
              ))}
            </div>
          </>
        )}
        {!picking && !ids.length && <Empty>No animals yet.</Empty>}
      </section>

      {lines.length > 0 && (
        <>
          {missing.length > 0 && (
            <section className="banner amber" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <strong className="warn">{missing.length} animal{missing.length === 1 ? ' is' : 's are'} missing details</strong>
              {missing.map((l) => (
                <Link key={l.a.id} to={`/records/${l.a.id}`} className="t14" style={{ color: 'inherit' }}>{l.a.name}: {l.gaps.join(', ')}</Link>
              ))}
            </section>
          )}
          <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, minWidth: 900 }}>
                <thead>
                  <tr>{COLS.map(([h]) => <th key={h} style={{ textAlign: 'left', padding: '10px 8px', background: 'var(--line-2)', whiteSpace: 'nowrap' }}>{h}</th>)}<th style={{ background: 'var(--line-2)' }} /></tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.a.id} style={{ borderTop: '1px solid var(--line)' }}>
                      {COLS.map(([h, f]) => {
                        const v = f(l);
                        return <td key={h} style={{ padding: '8px', whiteSpace: h === 'Name' ? 'normal' : 'nowrap', color: v ? undefined : 'var(--red)', fontWeight: v ? undefined : 700 }}>{v ? (/^\d{4}-/.test(v) ? shortDate(v) : v) : '—'}</td>;
                      })}
                      <td style={{ padding: 8 }}><button className="btn link sm" style={{ color: 'var(--red)' }} onClick={() => toggle(l.a.id)} aria-label={`Remove ${l.a.name}`}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="grid2">
            <button className="btn" onClick={csv}><Icon name="download" size={18} color="#fff" width={2.2} /> Download CSV</button>
            <button className="btn ghost" onClick={print}>Print / save PDF</button>
          </div>
          <p className="note">Uses each animal's latest rabies vaccine, RATT and (dogs) worming entries. Rabies expiry is the vaccine's next due date. Dates download as DD/MM/YYYY.</p>
        </>
      )}
      <button className="btn link" style={{ color: 'var(--red)' }} onClick={() => { if (confirm(`Delete ${name}? The animal records aren't affected.`)) { remove('flight_lists', { id: list.id }); nav('/flight-lists'); } }}>Delete this flight list</button>
    </Page>
  );
}
