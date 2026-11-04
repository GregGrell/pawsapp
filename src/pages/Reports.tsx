import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth';
import { Empty, Icon, Page, Pill, toast } from '../components/ui';
import { CHIP_RESULT, STATUS, isPositive } from '../lib/animals';
import { money, useProfiles } from '../lib/hooks';
import { hhmm, msByDay, sessions } from '../lib/presence';
import type { Row } from '../lib/store';
import { supabase } from '../lib/supabase';
import { addDays, monthLabel, shortDate, today } from '../lib/time';

// ---------- period ----------
type Mode = 'month' | 'year' | 'custom';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lastDay = (ym: string) => addDays(nextMonth(ym) + '-01', -1);
function nextMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
function prevMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
const startIso = (d: string) => `${d}T00:00:00+03:00`;
const endIso = (d: string) => `${addDays(d, 1)}T00:00:00+03:00`;
const qDay = (iso: string) => today(new Date(iso));

/** Supabase returns at most 1000 rows per request: page through. */
async function all(table: string, build: (q: any) => any, cols = '*'): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(supabase.from(table).select(cols)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const isQatar = (c: string) => /qatar|doha|^\s*qa\s*$/i.test(c ?? '');

type Data = Record<string, Row[]>;

async function load(from: string, to: string): Promise<Data> {
  const S = startIso(from), E = endIso(to);
  const between = (col: string) => (q: any) => q.gte(col, from).lte(col, to);
  const betweenTs = (col: string) => (q: any) => q.gte(col, S).lt(col, E);
  const [
    animals, locations, contacts, treatments, medical, chips, donations, transfers, issues, spends,
    incidents, maintNew, maintFixed, visitors, presence, ooh, leave, sick, eod, kennel, tasks, outcomes, calendar, moves,
  ] = await Promise.all([
    all('animals', (q) => q, 'id,name,species,intake_on,status,created_at'),
    all('animal_locations', between('from_on')),
    all('contacts', (q) => q, 'id,full_name,city,country,kind'),
    all('treatments', between('given_on'), 'id,animal_id,kind,name,given_on,result'),
    all('medical_notes', between('noted_on'), 'id,animal_id,noted_on,title'),
    all('microchip_checks', between('checked_on'), 'id,animal_id,checked_on,result'),
    all('cash_donations', between('received_on')),
    all('donation_transfers', between('transferred_on')),
    all('petty_cash_issues', between('issued_on')),
    all('petty_cash_spends', between('spent_on')),
    all('incidents', betweenTs('created_at')),
    all('maintenance_issues', betweenTs('created_at')),
    all('maintenance_issues', (q) => betweenTs('updated_at')(q).eq('status', 'fixed')),
    all('visitors', betweenTs('signed_in_at')),
    all('site_presence', (q) => q.gte('at', startIso(addDays(from, -1))).lt('at', endIso(addDays(to, 1)))),
    all('out_of_hours', between('work_on')),
    all('leave_requests', (q) => q.eq('status', 'approved').lte('start_on', to).gte('end_on', from)),
    all('sick_reports', between('sick_on')),
    all('eod_signoffs', between('work_on'), 'id,work_on,signed_by'),
    all('kennel_logs', betweenTs('created_at'), 'id,action,species,created_at'),
    all('task_completions', (q) => between('occurs_on')(q).eq('status', 'done'), 'id,item_id,occurs_on,done_by'),
    all('appointment_outcomes', between('occurs_on'), 'id,item_id,occurs_on,outcome'),
    all('calendar_items', (q) => q, 'id,kind,category,title'),
    all('animal_movements', betweenTs('out_at'), 'id,animal_name,species,kind,reason,out_at,returned_at'),
  ]);
  return { animals, locations, contacts, treatments, medical, chips, donations, transfers, issues, spends, incidents, maintNew, maintFixed, visitors, presence, ooh, leave, sick, eod, kennel, tasks, outcomes, calendar, moves };
}

// ---------- page ----------
export default function Reports() {
  const { isMgmt } = useAuth();
  const { name, list: people } = useProfiles();
  const d = today();
  const [mode, setMode] = useState<Mode>('month');
  const [ym, setYm] = useState(d.slice(0, 7));
  const [year, setYear] = useState(d.slice(0, 4));
  const [cFrom, setCFrom] = useState(d.slice(0, 8) + '01');
  const [cTo, setCTo] = useState(d);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [from, to] = mode === 'month' ? [`${ym}-01`, lastDay(ym)] : mode === 'year' ? [`${year}-01-01`, `${year}-12-31`] : [cFrom, cTo];
  const label = mode === 'month' ? monthLabel(`${ym}-01`) : mode === 'year' ? year : `${shortDate(from)} – ${shortDate(to)}`;

  useEffect(() => {
    if (!isMgmt || from > to) return;
    let live = true;
    setBusy(true);
    setErr('');
    load(from, to)
      .then((x) => live && setData(x))
      .catch((e) => live && setErr(navigator.onLine ? String(e.message ?? e) : 'Reports need a connection.'))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [from, to, isMgmt]);

  const r = useMemo(() => (data ? compute(data, from, to, name, people) : null), [data, from, to, name, people]);

  if (!isMgmt) return <Page title="Reports" back="More"><Empty>Reports are for management.</Empty></Page>;
  const years = Array.from({ length: 6 }, (_, i) => String(Number(d.slice(0, 4)) - i));

  return (
    <Page title="Reports" sub={label} back="More">
      <section className="card">
        <div className="pills">
          <Pill on={mode === 'month'} onClick={() => setMode('month')}>Month</Pill>
          <Pill on={mode === 'year'} onClick={() => setMode('year')}>Year</Pill>
          <Pill on={mode === 'custom'} onClick={() => setMode('custom')}>Custom dates</Pill>
        </div>
        {mode === 'month' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn ghost sm" aria-label="Previous month" onClick={() => setYm(prevMonth(ym))}>‹</button>
            <input className="input" type="month" value={ym} max={d.slice(0, 7)} onChange={(e) => e.target.value && setYm(e.target.value)} />
            <button className="btn ghost sm" aria-label="Next month" disabled={ym >= d.slice(0, 7)} onClick={() => setYm(nextMonth(ym))}>›</button>
          </div>
        )}
        {mode === 'year' && (
          <select className="input" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        )}
        {mode === 'custom' && (
          <div className="grid2">
            <label className="field"><span>From</span><input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} /></label>
            <label className="field"><span>To</span><input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} /></label>
          </div>
        )}
        {from > to && <span className="bad">The start date is after the end date.</span>}
      </section>

      {err && <section className="card"><span className="bad">{err}</span></section>}
      {busy && !r && <section className="card"><Empty>Building report…</Empty></section>}

      {r && (
        <>
          <div className="grid2">
            <button className="btn" onClick={() => downloadZip(r, label, from, to).catch((e) => toast(`Download failed: ${e.message}`))}><Icon name="download" size={18} color="#fff" width={2.2} /> Download all (CSV)</button>
            <button className="btn ghost" onClick={() => printReport(r, label)}>Print / save PDF</button>
          </div>
          {busy && <span className="t13">Updating…</span>}

          {r.sections.map((s) => <SectionCard key={s.title} s={s} />)}
          {r.monthly && <MonthlyCard rows={r.monthly} />}
          <p className="note">Each section downloads as its own CSV with every line behind the numbers. Adoptions count as "abroad" when the adopter's country is anything other than Qatar. Adoptions with no country recorded are listed separately so they can be fixed.</p>
        </>
      )}
    </Page>
  );
}

// ---------- shape of a report ----------
type Stat = { label: string; value: string | number; tone?: 'good' | 'bad' | 'warn' };
type Table = { head: string[]; rows: (string | number)[][] };
type Section = { title: string; stats: Stat[]; breakdown?: Table; detail: Table; file: string };
type Report = { sections: Section[]; monthly: (string | number)[][] | null };

export function compute(t: Data, from: string, to: string, name: (id?: string | null) => string, people: Row[]): Report {
  const animal = new Map(t.animals.map((a) => [a.id, a]));
  const contact = new Map(t.contacts.map((c) => [c.id, c]));
  const an = (id: string) => animal.get(id);
  const sp = (id: string) => (an(id)?.species === 'cat' ? 'Cat' : an(id)?.species === 'dog' ? 'Dog' : '');
  const byKind = (rows: Row[], key: (r: Row) => string) => {
    const m: Record<string, number> = {};
    rows.forEach((r) => (m[key(r)] = (m[key(r)] ?? 0) + 1));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const sections: Section[] = [];

  // Intake
  const intake = t.animals.filter((a) => a.intake_on && a.intake_on >= from && a.intake_on <= to);
  sections.push({
    title: 'Animals in', file: 'intake',
    stats: [{ label: 'New animals', value: intake.length }, { label: 'Dogs', value: intake.filter((a) => a.species === 'dog').length }, { label: 'Cats', value: intake.filter((a) => a.species === 'cat').length }],
    detail: { head: ['Date in', 'Name', 'Species', 'Status now'], rows: intake.sort((a, b) => a.intake_on.localeCompare(b.intake_on)).map((a) => [a.intake_on, a.name, a.species === 'dog' ? 'Dog' : 'Cat', STATUS[a.status]?.label ?? a.status]) },
  });

  // Outcomes: adoptions (Qatar / abroad), fosters, trials, transfers, deceased, returned
  const countryOf = (l: Row) => (l.contact_id ? contact.get(l.contact_id)?.country : '') || l.country || '';
  const adopted = t.locations.filter((l) => l.status === 'adopted');
  const inQatar = adopted.filter((l) => isQatar(countryOf(l)));
  const noCountry = adopted.filter((l) => !countryOf(l).trim());
  const abroad = adopted.filter((l) => countryOf(l).trim() && !isQatar(countryOf(l)));
  const abroadBy = byKind(abroad, (l) => countryOf(l).trim().replace(/\b\w/g, (c: string) => c.toUpperCase()));
  sections.push({
    title: 'Adoptions', file: 'adoptions',
    stats: [
      { label: 'Adopted', value: adopted.length, tone: 'good' },
      { label: 'In Qatar', value: inQatar.length },
      { label: 'Abroad', value: abroad.length },
      ...(noCountry.length ? [{ label: 'Country not recorded', value: noCountry.length, tone: 'warn' as const }] : []),
      { label: 'Dogs', value: adopted.filter((l) => an(l.animal_id)?.species === 'dog').length },
      { label: 'Cats', value: adopted.filter((l) => an(l.animal_id)?.species === 'cat').length },
    ],
    breakdown: abroadBy.length ? { head: ['Country', 'Adoptions'], rows: abroadBy } : undefined,
    detail: {
      head: ['Date', 'Animal', 'Species', 'Adopter', 'City', 'Country', 'Qatar / abroad'],
      rows: adopted.sort((a, b) => a.from_on.localeCompare(b.from_on)).map((l) => {
        const c = l.contact_id ? contact.get(l.contact_id) : null;
        const ctry = countryOf(l);
        return [l.from_on, an(l.animal_id)?.name ?? '', sp(l.animal_id), c?.full_name ?? l.with_name ?? '', c?.city ?? '', ctry, !ctry.trim() ? 'Not recorded' : isQatar(ctry) ? 'Qatar' : 'Abroad'];
      }),
    },
  });

  const other = t.locations.filter((l) => ['foster', 'trial', 'transferred', 'deceased', 'returned'].includes(l.status));
  const cnt = (s: string) => other.filter((l) => l.status === s).length;
  sections.push({
    title: 'Other moves', file: 'moves',
    stats: [{ label: 'Into foster', value: cnt('foster') }, { label: 'Trial adoptions', value: cnt('trial') }, { label: 'Transferred', value: cnt('transferred') }, { label: 'Returned to owner', value: cnt('returned') }, { label: 'Deceased', value: cnt('deceased') }],
    detail: { head: ['Date', 'Animal', 'Species', 'Move', 'With', 'Country', 'Note'], rows: other.sort((a, b) => a.from_on.localeCompare(b.from_on)).map((l) => [l.from_on, an(l.animal_id)?.name ?? '', sp(l.animal_id), STATUS[l.status]?.label ?? l.status, (l.contact_id && contact.get(l.contact_id)?.full_name) || l.with_name || '', countryOf(l), l.note ?? '']) },
  });

  // Population now
  const inCare = t.animals.filter((a) => STATUS[a.status]?.inCare);
  sections.push({
    title: 'In our care now', file: 'in-care-now',
    stats: [{ label: 'In shelter', value: inCare.filter((a) => a.status === 'shelter').length }, { label: 'At foster', value: inCare.filter((a) => a.status === 'foster').length }, { label: 'On trial', value: inCare.filter((a) => a.status === 'trial').length }, { label: 'Dogs', value: inCare.filter((a) => a.species === 'dog').length }, { label: 'Cats', value: inCare.filter((a) => a.species === 'cat').length }],
    detail: { head: ['Name', 'Species', 'Status', 'In since'], rows: inCare.sort((a, b) => a.name.localeCompare(b.name)).map((a) => [a.name, a.species === 'dog' ? 'Dog' : 'Cat', STATUS[a.status]?.label ?? '', a.intake_on ?? '']) },
  });

  // Vet & care
  const tests = t.treatments.filter((x) => x.kind === 'test');
  const positives = tests.filter((x) => isPositive(x.result));
  const chipBad = t.chips.filter((c) => CHIP_RESULT[c.result]?.bad);
  const vetVisits = t.outcomes.filter((o) => t.calendar.find((c) => c.id === o.item_id)?.category === 'vet');
  sections.push({
    title: 'Vet & care', file: 'vet-care',
    stats: [
      { label: 'Vaccinations', value: t.treatments.filter((x) => x.kind === 'vaccine').length },
      { label: 'Worming', value: t.treatments.filter((x) => x.kind === 'worming').length },
      { label: 'Flea & tick', value: t.treatments.filter((x) => x.kind === 'flea_tick').length },
      { label: 'RATT samples', value: t.treatments.filter((x) => x.kind === 'ratt').length },
      { label: 'Disease tests', value: tests.length },
      { label: 'Positive tests', value: positives.length, tone: positives.length ? 'bad' : undefined },
      { label: 'Vet appointments attended', value: vetVisits.filter((o) => o.outcome === 'attended').length },
      { label: 'Vet appointments missed', value: vetVisits.filter((o) => o.outcome === 'missed').length, tone: vetVisits.some((o) => o.outcome === 'missed') ? 'warn' : undefined },
      { label: 'Medical notes', value: t.medical.length },
      { label: 'Microchip checks', value: t.chips.length },
      ...(chipBad.length ? [{ label: 'Chip problems', value: chipBad.length, tone: 'bad' as const }] : []),
    ],
    breakdown: { head: ['Treatment', 'Given'], rows: byKind(t.treatments, (x) => x.name) },
    detail: {
      head: ['Date', 'Animal', 'Species', 'Type', 'Treatment / test', 'Result'],
      rows: [
        ...t.treatments.map((x) => [x.given_on, an(x.animal_id)?.name ?? '', sp(x.animal_id), x.kind, x.name, x.result ?? '']),
        ...t.chips.map((c) => [c.checked_on, an(c.animal_id)?.name ?? '', sp(c.animal_id), 'microchip check', 'Microchip check', CHIP_RESULT[c.result]?.label ?? c.result]),
        ...t.medical.map((m) => [m.noted_on, an(m.animal_id)?.name ?? '', sp(m.animal_id), 'medical note', m.title, '']),
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    },
  });

  // Trips out
  const temp = t.moves.filter((m) => m.kind === 'temporary');
  sections.push({
    title: 'Animal trips out', file: 'trips',
    stats: [{ label: 'Temporary sign-outs', value: temp.length }, { label: 'Not back yet', value: temp.filter((m) => !m.returned_at).length }],
    breakdown: temp.length ? { head: ['Reason', 'Trips'], rows: byKind(temp, (m) => m.reason || 'Other') } : undefined,
    detail: { head: ['Out', 'Animal', 'Species', 'Reason', 'Back'], rows: temp.map((m) => [qDay(m.out_at), m.animal_name, m.species === 'dog' ? 'Dog' : 'Cat', m.reason, m.returned_at ? qDay(m.returned_at) : 'Not back']) },
  });

  // Money
  const don = t.donations.reduce((n, x) => n + Number(x.amount), 0);
  const moved = t.transfers.reduce((n, x) => n + Number(x.amount), 0);
  const issued = t.issues.reduce((n, x) => n + Number(x.amount), 0);
  const spent = t.spends.reduce((n, x) => n + Number(x.amount), 0);
  const noRec = t.spends.filter((x) => !x.receipt_path);
  sections.push({
    title: 'Money', file: 'money',
    stats: [
      { label: 'Cash donations (QAR)', value: money(don), tone: 'good' },
      { label: 'Donations', value: t.donations.length },
      { label: 'Moved to petty cash', value: money(moved) },
      { label: 'Petty cash issued', value: money(issued) },
      { label: 'Petty cash spent', value: money(spent) },
      { label: 'Spends with no receipt', value: noRec.length, tone: noRec.length ? 'warn' : undefined },
    ],
    detail: {
      head: ['Date', 'Type', 'Description', 'Amount (QAR)', 'Person', 'Receipt'],
      rows: [
        ...t.donations.map((x) => [x.received_on, 'Donation', [x.donor || 'Anonymous', x.note].filter(Boolean).join(' · '), money(x.amount), name(x.received_by), x.receipt_path ? 'Yes' : 'No']),
        ...t.transfers.map((x) => [x.transferred_on, 'Donations → petty cash', x.note, money(x.amount), name(x.transferred_by), '']),
        ...t.issues.filter((x) => !x.transfer_id).map((x) => [x.issued_on, 'Petty cash issued', x.note || '', money(x.amount), name(x.issued_by), '']),
        ...t.spends.map((x) => [x.spent_on, 'Petty cash spent', x.description, `-${money(x.amount)}`, name(x.spent_by), x.receipt_path ? 'Yes' : `No: ${x.no_receipt_reason}`]),
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    },
  });

  // Site & safety
  const visitorsPeople = t.visitors.reduce((n, v) => n + 1 + (v.guests || 0), 0);
  sections.push({
    title: 'Site, visitors & safety', file: 'site',
    stats: [
      { label: 'Visitor sign-ins', value: t.visitors.length },
      { label: 'Visitors (incl. groups)', value: visitorsPeople },
      { label: 'Incidents', value: t.incidents.length, tone: t.incidents.length ? 'bad' : undefined },
      { label: 'Maintenance reported', value: t.maintNew.length },
      { label: 'Urgent maintenance', value: t.maintNew.filter((m) => m.urgent).length },
      { label: 'Maintenance fixed', value: t.maintFixed.length, tone: 'good' },
    ],
    detail: {
      head: ['Date', 'Type', 'Details', 'Person'],
      rows: [
        ...t.visitors.map((v) => [qDay(v.signed_in_at), 'Visitor', `${v.name}${v.guests ? ` + ${v.guests}` : ''}`, v.phone]),
        ...t.incidents.map((i) => [qDay(i.created_at), 'Incident', [i.description, i.location].filter(Boolean).join(' — '), name(i.reported_by)]),
        ...t.maintNew.map((m) => [qDay(m.created_at), m.urgent ? 'Maintenance (urgent)' : 'Maintenance', [m.description, m.location, m.status === 'fixed' ? 'fixed' : 'open'].filter(Boolean).join(' — '), name(m.reported_by)]),
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    },
  });

  // Daily running
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1;
  // count days from when the team started using the app (first staff account), not before
  const started = people.filter((p) => p.role === 'staff' && p.created_at).map((p) => qDay(p.created_at)).sort()[0] ?? today();
  const countFrom = from > started ? from : started;
  const countTo = today() < to ? today() : to;
  const pastDays = Math.max(0, Math.min(days, Math.round((Date.parse(countTo) - Date.parse(countFrom)) / 86400_000) + 1));
  const kl = (a: string) => t.kennel.filter((k) => k.action === a).length;
  const appts = t.outcomes;
  sections.push({
    title: 'Daily running', file: 'daily',
    stats: [
      { label: 'End-of-day checks signed off', value: `${t.eod.length} of ${pastDays} days`, tone: t.eod.length < pastDays ? 'warn' : 'good' },
      { label: 'Tasks done', value: t.tasks.length },
      { label: 'Appointments attended', value: appts.filter((o) => o.outcome === 'attended').length },
      { label: 'Missed', value: appts.filter((o) => o.outcome === 'missed').length },
      { label: 'Rescheduled', value: appts.filter((o) => o.outcome === 'rescheduled').length },
      { label: 'Feeds logged', value: kl('fed') },
      { label: 'Exercise logged', value: kl('exercised') },
      { label: 'Cleans logged', value: kl('cleaned') },
      { label: 'Meds rounds logged', value: kl('meds') },
    ],
    breakdown: { head: ['Appointment type', 'Attended', 'Missed', 'Rescheduled'], rows: ['vet', 'visitor', 'airport', 'dropoff', 'other'].map((cat) => {
      const os = appts.filter((o) => (t.calendar.find((c) => c.id === o.item_id)?.category ?? 'other') === cat);
      return [({ vet: 'Vet', visitor: 'Visitor', airport: 'Airport run', dropoff: 'Drop-off / pick-up', other: 'Other' } as Record<string, string>)[cat], os.filter((o) => o.outcome === 'attended').length, os.filter((o) => o.outcome === 'missed').length, os.filter((o) => o.outcome === 'rescheduled').length];
    }).filter((r) => Number(r[1]) + Number(r[2]) + Number(r[3]) > 0) },
    detail: {
      head: ['Date', 'Type', 'Details'],
      rows: [
        ...t.eod.map((e) => [e.work_on, 'End-of-day sign-off', name(e.signed_by)]),
        ...appts.map((o) => [o.occurs_on, `Appointment ${o.outcome}`, t.calendar.find((c) => c.id === o.item_id)?.title ?? '']),
        ...t.tasks.map((x) => [x.occurs_on, 'Task done', `${t.calendar.find((c) => c.id === x.item_id)?.title ?? ''} · ${name(x.done_by)}`]),
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    },
  });

  // Staff
  const staff = people.filter((p) => p.role === 'staff' || p.role === 'management' || t.presence.some((e) => e.user_id === p.id));
  const staffRows = staff.map((p) => {
    const ss = sessions(t.presence, p.id);
    const ms = Object.entries(msByDay(ss)).filter(([day]) => day >= from && day <= to).reduce((n, [, v]) => n + v, 0);
    const home = Object.entries(msByDay(ss.filter((x) => x.remote))).filter(([day]) => day >= from && day <= to).reduce((n, [, v]) => n + v, 0);
    const daysOn = Object.entries(msByDay(sessions(t.presence, p.id))).filter(([day, v]) => day >= from && day <= to && v > 0).length;
    const til = t.ooh.filter((o) => o.user_id === p.id && o.status === 'counted').reduce((n, o) => n + o.til_minutes, 0);
    const sickDays = t.sick.filter((s) => s.user_id === p.id).length;
    const leaveDays = t.leave.filter((l) => l.user_id === p.id).reduce((n, l) => {
      const a = l.start_on > from ? l.start_on : from;
      const b = l.end_on < to ? l.end_on : to;
      return n + Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400_000) + 1);
    }, 0);
    return { p, ms, home, daysOn, til, sickDays, leaveDays };
  }).filter((x) => x.ms || x.til || x.sickDays || x.leaveDays);
  sections.push({
    title: 'Staff', file: 'staff',
    stats: [
      { label: 'Hours worked (all)', value: hhmm(staffRows.reduce((n, x) => n + x.ms, 0)) },
      { label: 'of which from home', value: hhmm(staffRows.reduce((n, x) => n + x.home, 0)) },
      { label: 'TIL earned', value: hhmm(staffRows.reduce((n, x) => n + x.til, 0) * 60000) },
      { label: 'Sick days', value: staffRows.reduce((n, x) => n + x.sickDays, 0) },
      { label: 'Leave days', value: staffRows.reduce((n, x) => n + x.leaveDays, 0) },
    ],
    breakdown: { head: ['Person', 'Days worked', 'Hours on site', 'Hours from home', 'TIL earned', 'Sick days', 'Leave days'], rows: staffRows.map((x) => [x.p.full_name, x.daysOn, hhmm(x.ms - x.home), hhmm(x.home), hhmm(x.til * 60000), x.sickDays, x.leaveDays]) },
    detail: { head: ['Person', 'Days worked', 'Hours on site', 'Hours from home', 'TIL earned (mins)', 'Sick days', 'Leave days'], rows: staffRows.map((x) => [x.p.full_name, x.daysOn, ((x.ms - x.home) / 3600000).toFixed(2), (x.home / 3600000).toFixed(2), x.til, x.sickDays, x.leaveDays]) },
  });

  // Month by month (for periods longer than a month)
  let monthly: (string | number)[][] | null = null;
  if (from.slice(0, 7) !== to.slice(0, 7)) {
    monthly = [];
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = nextMonth(m)) {
      const inM = (day?: string) => !!day && day.slice(0, 7) === m;
      const ad = adopted.filter((l) => inM(l.from_on));
      monthly.push([
        `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`,
        intake.filter((a) => inM(a.intake_on)).length,
        ad.length,
        ad.filter((l) => isQatar(countryOf(l))).length,
        ad.filter((l) => countryOf(l).trim() && !isQatar(countryOf(l))).length,
        money(t.donations.filter((x) => inM(x.received_on)).reduce((n, x) => n + Number(x.amount), 0)),
        t.visitors.filter((v) => inM(qDay(v.signed_in_at))).length,
        t.incidents.filter((i) => inM(qDay(i.created_at))).length,
      ]);
    }
  }
  return { sections, monthly };
}

const MONTHLY_HEAD = ['Month', 'Animals in', 'Adopted', 'In Qatar', 'Abroad', 'Donations (QAR)', 'Visitors', 'Incidents'];

// ---------- display ----------
function SectionCard({ s }: { s: Section }) {
  const [open, setOpen] = useState(false);
  const tone = (t?: string) => (t === 'bad' ? 'var(--red)' : t === 'warn' ? 'var(--amber)' : t === 'good' ? '#166534' : 'var(--ink)');
  return (
    <section className="card">
      <div className="head">
        <h2 className="h">{s.title}</h2>
        <button className="btn link sm" onClick={() => downloadCsv(s.file, s.detail)} disabled={!s.detail.rows.length}>CSV</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
        {s.stats.map((x) => (
          <div key={x.label} style={{ background: 'var(--soft, #F6F8F7)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: tone(x.tone), fontVariantNumeric: 'tabular-nums' }}>{x.value}</span>
            <span className="t13">{x.label}</span>
          </div>
        ))}
      </div>
      {s.breakdown && s.breakdown.rows.length > 0 && <MiniTable t={s.breakdown} />}
      {s.detail.rows.length > 0 && (
        <>
          <button className="btn link sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} the {s.detail.rows.length} line{s.detail.rows.length === 1 ? '' : 's'} behind this</button>
          {open && <MiniTable t={{ head: s.detail.head, rows: s.detail.rows.slice(0, 300) }} />}
          {open && s.detail.rows.length > 300 && <span className="t13">Showing 300. The CSV has all {s.detail.rows.length}.</span>}
        </>
      )}
    </section>
  );
}

function MiniTable({ t }: { t: Table }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead><tr>{t.head.map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px', background: 'var(--line-2)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--line-2)' }}>
              {r.map((c, j) => <td key={j} style={{ padding: '7px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: j === 0 ? 'nowrap' : undefined }}>{/^\d{4}-\d{2}-\d{2}$/.test(String(c)) ? shortDate(String(c)) : c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyCard({ rows }: { rows: (string | number)[][] }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[2])));
  return (
    <section className="card">
      <div className="head">
        <h2 className="h">Month by month</h2>
        <button className="btn link sm" onClick={() => downloadCsv('month-by-month', { head: MONTHLY_HEAD, rows })}>CSV</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-label="Adoptions per month">
        <span className="t13">Adoptions per month · <span style={{ color: 'var(--blue)' }}>■</span> in Qatar <span style={{ color: '#D1007A' }}>■</span> abroad</span>
        {rows.map((r) => (
          <div key={String(r[0])} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="t13" style={{ width: 64 }}>{r[0]}</span>
            <div style={{ flex: 1, display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', background: 'var(--line-2)' }}>
              <div style={{ width: `${(Number(r[3]) / max) * 100}%`, background: 'var(--blue)' }} />
              <div style={{ width: `${(Number(r[4]) / max) * 100}%`, background: '#D1007A' }} />
            </div>
            <span className="t13" style={{ width: 24, textAlign: 'right', fontWeight: 700 }}>{r[2]}</span>
          </div>
        ))}
      </div>
      <MiniTable t={{ head: MONTHLY_HEAD, rows }} />
    </section>
  );
}

// ---------- export ----------
const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const dmy = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : v);
const toCsv = (t: Table) => '﻿' + [t.head.map(esc).join(','), ...t.rows.map((r) => r.map((c) => esc(dmy(c))).join(','))].join('\r\n');

function save(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
function downloadCsv(name: string, t: Table) {
  save(new Blob([toCsv(t)], { type: 'text/csv' }), `paws-${name}.csv`);
}

async function downloadZip(r: Report, label: string, from: string, to: string) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const summary: Table = { head: ['Section', 'Measure', 'Value'], rows: r.sections.flatMap((s) => s.stats.map((x) => [s.title, x.label, x.value])) };
  zip.file('00-summary.csv', toCsv(summary));
  r.sections.forEach((s, i) => {
    zip.file(`${String(i + 1).padStart(2, '0')}-${s.file}.csv`, toCsv(s.detail));
    if (s.breakdown?.rows.length) zip.file(`${String(i + 1).padStart(2, '0')}-${s.file}-breakdown.csv`, toCsv(s.breakdown));
  });
  if (r.monthly) zip.file('99-month-by-month.csv', toCsv({ head: MONTHLY_HEAD, rows: r.monthly }));
  save(await zip.generateAsync({ type: 'blob' }), `paws-report_${from}_to_${to}.zip`);
  toast(`Report for ${label} downloaded`);
}

function printReport(r: Report, label: string) {
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print');
  const h = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const table = (t: Table) => `<table><thead><tr>${t.head.map((x) => `<th>${h(x)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((row) => `<tr>${row.map((c) => `<td>${h(dmy(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const body = r.sections.map((s) => `<section><h2>${h(s.title)}</h2><div class="stats">${s.stats.map((x) => `<div><b>${h(x.value)}</b><span>${h(x.label)}</span></div>`).join('')}</div>${s.breakdown?.rows.length ? table(s.breakdown) : ''}</section>`).join('')
    + (r.monthly ? `<section><h2>Month by month</h2>${table({ head: MONTHLY_HEAD, rows: r.monthly })}</section>` : '');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>PAWS report ${h(label)}</title><style>
    body{font-family:Arial,sans-serif;margin:24px;color:#111} h1{font-size:20px;margin:0 0 2px;color:#004A70} p{margin:0 0 16px;color:#555;font-size:12px}
    h2{font-size:15px;margin:18px 0 8px;color:#004A70;border-bottom:1px solid #ccc;padding-bottom:4px} section{break-inside:avoid}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px} .stats div{border:1px solid #ddd;border-radius:6px;padding:6px 8px}
    .stats b{display:block;font-size:16px} .stats span{font-size:11px;color:#555}
    table{border-collapse:collapse;width:100%;font-size:11px;margin-top:6px} th,td{border:1px solid #bbb;padding:4px 6px;text-align:left} th{background:#eee}
    @page{size:A4;margin:14mm}</style></head><body><h1>PAWS Rescue Qatar · Report</h1><p>${h(label)} · printed ${h(dmy(today()))}</p>${body}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
