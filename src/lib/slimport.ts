// Shelterluv import: reads the custom-report Excel exports in the browser and loads them into PAWSapp.
// Every record keeps its Shelterluv key (sl_key) so a later export of the same data updates nothing twice,
// and every exported row is kept verbatim in sl_raw.
import { supabase } from './supabase';

export type Rec = Record<string, any>;
export type Parsed = { report: string; file: string; rows: Rec[] };

// Checked in order; each report is recognised by a column only it has.
const REPORTS: [string, string][] = [
  ['diagnoses', 'Date Diagnosed'],
  ['exams', 'Exam Reason'],
  ['procedures', 'Procedure/Surgery Type'],
  ['animals', 'Days In Custody'],
  ['people', 'Primary Email'],
  ['intakes', 'Intake Type'],
  ['outcomes', 'Outcome Type'],
  ['foster_placements', 'Foster Placement Event Date'],
  ['foster_returns', 'Foster Return Date'],
  ['vaccines', 'Vaccine Product'],
  ['tests', 'Test Name'],
  ['treatments', 'Dose Notes'],
];

export async function readFiles(files: File[]): Promise<Parsed[]> {
  const XLSX = await import('xlsx');
  const out: Parsed[] = [];
  for (const f of files) {
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Rec>(ws, { defval: null, raw: true });
    const head = Object.keys(rows[0] ?? {});
    const report = REPORTS.find(([, col]) => head.includes(col))?.[0] ?? 'unknown';
    out.push({ report, file: f.name, rows: rows.map(clean) });
  }
  return out;
}

/** Numbers keep every digit (microchips are 15-digit numbers in the export); placeholders become empty. */
export const clean = (r: Rec) => {
  const o: Rec = {};
  for (const [k, v] of Object.entries(r)) {
    if (v === '—' || v === '' || v == null) o[k] = null;
    else if (typeof v === 'number') o[k] = Number.isInteger(v) ? v.toFixed(0) : String(v);
    else if (v instanceof Date) o[k] = `${String(v.getMonth() + 1).padStart(2, '0')}/${String(v.getDate()).padStart(2, '0')}/${v.getFullYear()}`;
    else o[k] = String(v).trim() === '—' ? null : v;
  }
  return o;
};
const s = (v: any) => (v == null ? '' : String(v).trim());
/** Shelterluv dates are MM/DD/YYYY. */
export function d(v: any): string | null {
  const m = s(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}
const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
const yes = (v: any) => /^yes$/i.test(s(v));

// ---------- mapping ----------

function animalStatus(a: Rec): string {
  const st = s(a['Current Status']).toLowerCase();
  const loc = s(a['Current Location']).toLowerCase();
  if (yes(a['In Custody'])) {
    if (loc.startsWith('foster') || s(a['Foster Person Name']) || /foster/.test(st)) return 'foster';
    return 'shelter';
  }
  if (/transferred/.test(st) || loc.startsWith('transferred')) return 'transferred';
  if (/deceased|died|euthan/.test(st + ' ' + loc)) return 'deceased';
  if (loc.startsWith('returned')) return 'returned';
  if (/healthy in home|adopt/.test(st + ' ' + loc)) return 'adopted';
  return 'other';
}

function outcomeStatus(o: Rec): string {
  const t = s(o['Outcome Type']).toLowerCase();
  if (t === 'adoption') return 'adopted';
  if (t.startsWith('transfer')) return 'transferred';
  if (/death|euthanasia/.test(t)) return 'deceased';
  if (t.startsWith('return to owner')) return 'returned';
  return 'other';
}

export type TypeRow = { id: string; name: string; kind: string; interval_days: number | null };

function vaccineType(product: string, types: TypeRow[]) {
  const p = product.toLowerCase();
  const by = (n: string) => types.find((t) => t.name === n) ?? null;
  if (/rabi|rabvac|biocan r/.test(p)) return by('Rabies');
  if (/dapp|dhpp|da2pp|canine 1-/.test(p)) return by('DHPPi + Lepto');
  if (/tricat|rcp|fvrcp|fel-o-guard|feligen|herpes/.test(p)) return by('Tricat (FVRCP)');
  return null;
}
const WORM = /drontal|panacur|fenbendazole|dewormer|de-wormer|milbemax|praziquantel|pyrantel|febantel|profender|wormer/i;
const FLEA = /bravecto|fipronil|frontline|nexgard|simparica|paradyne|selamectin|revolution|advocate|stronghold|broadline|credelio|seresto|flea/i;

const TEST_GROUP: [RegExp, string][] = [
  [/quad|4dx/i, 'Quad test (4Dx)'],
  [/felv|fiv/i, 'FIV/FeLV test'],
];
const PART_NAME: Record<string, string> = {
  'heart worm': 'Heartworm', heartworm: 'Heartworm', lymes: 'Lyme', lyme: 'Lyme', erlicchia: 'Ehrlichia', ehrlichia: 'Ehrlichia',
  anaplasmosis: 'Anaplasma', anaplasma: 'Anaplasma', fiv: 'FIV', felv: 'FeLV',
};
const resultWord = (r: string) => (/^neg/i.test(r) ? 'negative' : /^pos/i.test(r) ? 'positive' : /^inconclusive/i.test(r) ? 'inconclusive' : r);

/** Turn the parsed exports into PAWSapp rows. Pure; nothing is written here. */
export function build(parsed: Parsed[], types: TypeRow[]) {
  const by = (r: string) => parsed.filter((p) => p.report === r).flatMap((p) => p.rows);
  const raw: Rec[] = [];
  const keep = (report: string, key: string, row: Rec, record_table: string | null, record_sl_key: string | null) =>
    raw.push({ report, sl_key: key, animal_sl_id: row['Animal ID'] ?? null, record_table, record_sl_key, data: row });

  // People
  const contacts = new Map<string, Rec>();
  for (const p of by('people')) {
    const key = `P:${s(p['Person ID'])}`;
    if (!s(p['Person ID'])) continue;
    contacts.set(key, {
      sl_key: key, kind: 'other', full_name: s(p.Name) || 'Unknown',
      phone: [s(p['Primary Phone']), s(p['Secondary Phone'])].filter(Boolean).join(' / '),
      email: [s(p['Primary Email']), s(p['Secondary Email'])].filter(Boolean).join(' / '),
      address: [s(p['Street Address 1']), s(p['Street Address 2']), s(p.Zip)].filter(Boolean).join(', '),
      city: s(p.City), country: '', notes: '',
    });
    keep('people', key, p, 'contacts', key);
  }
  const personFrom = (id: any, name: any, extra: Rec, kind: string) => {
    if (!s(id)) return null;
    const key = `P:${s(id)}`;
    const c = contacts.get(key) ?? { sl_key: key, kind, full_name: s(name) || 'Unknown', phone: '', email: '', address: '', city: '', country: '', notes: '' };
    if (c.kind === 'other' || (c.kind === 'foster' && kind === 'adopter')) c.kind = kind;
    for (const [k, v] of Object.entries(extra)) if (!c[k] && v) c[k] = v;
    contacts.set(key, c);
    return key;
  };

  // Animals
  const animals = new Map<string, Rec>();
  const weights: Rec[] = [];
  for (const a of by('animals')) {
    const key = s(a['Animal ID']);
    if (!key) continue;
    const altered = yes(a['Altered In Care']) || yes(a['Altered Before Arrival']) ? true : null;
    animals.set(key, {
      sl_key: key, sl_internal_id: s(a['Internal ID (API)']) || null, shelterluv_id: s(a['Internal ID (API)']) || null, source: 'shelterluv',
      name: s(a.Name) || key, species: /cat/i.test(s(a.Species)) ? 'cat' : 'dog',
      breed: [s(a['Primary Breed']), s(a['Secondary Breed'])].filter((x, i, arr) => x && arr.indexOf(x) === i).join(' / '),
      colour: [s(a['Primary Color']), s(a['Secondary Color'])].filter((x, i, arr) => x && arr.indexOf(x) === i).join(' / ') + (s(a.Pattern) ? ` (${s(a.Pattern)})` : ''),
      sex: /^f/i.test(s(a.Sex)) ? 'female' : /^m/i.test(s(a.Sex)) ? 'male' : 'unknown',
      dob: d(a.Birthdate), neutered: altered, microchip: s(a['Microchip Number']).replace(/\s/g, ''), microchip_on: d(a['Microchip Implant Date']),
      intake_on: d(a['Intake Date']), notes: '', final_status: animalStatus(a),
    });
    keep('animals', key, a, 'animals', key);
    // Weights are kg. Anything over 50 kg is a missing decimal point (e.g. 225 = 22.5); the original stays in sl_raw.
    let kg = parseFloat(s(a['Current Weight']));
    const on = d(a['Date Weighed']);
    let fixed = false;
    while (kg > 50) { kg = kg / 10; fixed = true; }
    if (kg > 0 && on) {
      weights.push({ sl_key: `W:${key}:${on}`, animal: key, weighed_on: on, kg: Math.round(kg * 100) / 100,
        notes: fixed ? `From Shelterluv (recorded there as ${s(a['Current Weight'])}; decimal point added)` : 'From Shelterluv' });
    }
    if (s(a['Foster Person ID'])) personFrom(a['Foster Person ID'], a['Foster Person Name'], {
      address: [s(a['Foster Person Street 1']), s(a['Foster Person Street 2']), s(a['Foster Person Zip'])].filter(Boolean).join(', '),
      city: s(a['Foster Person City']), phone: s(a['Foster Person Primary Phone']), email: s(a['Foster Person Email']),
    }, 'foster');
  }

  // Location history
  const locations: Rec[] = [];
  const seenLoc = new Set<string>();
  const loc = (key: string, row: Rec) => { if (!seenLoc.has(key)) { seenLoc.add(key); locations.push(row); } };
  for (const r of by('intakes')) {
    const a = s(r['Animal ID']); const on = d(r['Intake Date']);
    if (!a || !on) continue;
    const key = `IN:${a}:${on}:${s(r['Intake Time'])}`;
    const who = personFrom(r['Intake From Person ID'], r['Intake From Person Name'], {
      address: [s(r['Intake From Address 1']), s(r['Intake From Address 2']), s(r['Intake From Zip'])].filter(Boolean).join(', '),
      city: s(r['Intake From City']), phone: s(r['Intake From Phone']), email: s(r['Intake From Email']),
    }, 'other');
    loc(key, { sl_key: key, animal: a, status: 'shelter', from_on: on, contact: null, with_name: '', country: '',
      note: ['Intake', s(r['Intake Type']), s(r['Intake Subtype'])].filter(Boolean).join(': ').replace('Intake: ', 'Intake · ') + (who ? ` · from ${s(r['Intake From Person Name'])}` : '') });
    keep('intakes', key, r, 'animal_locations', key);
    // a first intake sets the animal's intake date if missing
    const an = animals.get(a);
    if (an && (!an.intake_on || on < an.intake_on)) an.intake_on = on;
  }
  for (const r of by('foster_placements')) {
    const a = s(r['Animal ID']); const on = d(r['Foster Placement Event Date']);
    if (!a || !on) continue;
    const key = `FO:${a}:${on}:${s(r['Foster Placement Person ID'])}`;
    const who = personFrom(r['Foster Placement Person ID'], r['Foster Placement Person Name'], {}, 'foster');
    loc(key, { sl_key: key, animal: a, status: 'foster', from_on: on, contact: who, with_name: s(r['Foster Placement Person Name']), country: '', note: 'Foster placement' });
    keep('foster_placements', key, r, 'animal_locations', key);
  }
  for (const r of by('foster_returns')) {
    const a = s(r['Animal ID']); const on = d(r['Foster Return Date']);
    if (!a || !on) continue;
    const key = `FR:${a}:${on}:${s(r['Foster Return Time'])}`;
    loc(key, { sl_key: key, animal: a, status: 'shelter', from_on: on, contact: null, with_name: '', country: '',
      note: `Back from foster${s(r['Foster Return Person Name']) ? ` (${s(r['Foster Return Person Name'])})` : ''}${s(r['Status upon Foster Return']) ? ` · ${s(r['Status upon Foster Return'])}` : ''}` });
    keep('foster_returns', key, r, 'animal_locations', key);
  }
  for (const r of by('outcomes')) {
    const a = s(r['Animal ID']); const on = d(r['Outcome Date']);
    if (!a || !on) continue;
    const key = `OUT:${a}:${on}:${s(r['Outcome Time'])}`;
    const status = outcomeStatus(r);
    const sub = s(r['Outcome Subtype']);
    const who = personFrom(r['Outcome To Person ID'], r['Outcome To Person Name'], {
      address: [s(r['Outcome To Street Address 1']), s(r['Outcome To Street Address 2']), s(r['Outcome To Zip'])].filter(Boolean).join(', '),
      city: s(r['Outcome To City']), phone: s(r['Outcome To Phone']), email: s(r['Outcome To Email']),
    }, status === 'adopted' ? 'adopter' : 'other');
    const country = status === 'adopted' ? (/abroad/i.test(sub) ? 'Abroad' : 'Qatar') : /belgium/i.test(sub) ? 'Belgium' : '';
    loc(key, { sl_key: key, animal: a, status, from_on: on, contact: who, with_name: s(r['Outcome To Person Name']) || s(r['Transfer To']), country,
      note: [s(r['Outcome Type']), sub, s(r['Cause Of Death']), s(r['Outcome Memo'])].filter(Boolean).join(' · ') });
    keep('outcomes', key, r, 'animal_locations', key);
  }

  // Vaccines
  const treatments: Rec[] = [];
  for (const r of by('vaccines')) {
    const a = s(r['Animal ID']); const on = d(r['Date Completed']);
    if (!a || !on) continue;
    const product = s(r['Vaccine Product']);
    const key = `VAC:${a}:${on}:${product}`;
    const t = vaccineType(product, types);
    const due = t?.name === 'Rabies' ? d(r['Rabies Next Due Date']) ?? (t.interval_days ? addDays(on, t.interval_days) : null) : t?.interval_days ? addDays(on, t.interval_days) : null;
    treatments.push({ sl_key: key, animal: a, type_id: t?.id ?? null, kind: 'vaccine', name: t?.name ?? product, given_on: on, next_due_on: due,
      product, manufacturer: '', batch: s(r['Lot #']), vet: [s(r['Vaccinated By']), s(r['Supervising Veterinarian'])].filter(Boolean).join(' · '),
      result: '', notes: s(r['Rabies Tag Number']) ? `Rabies tag ${s(r['Rabies Tag Number'])}` : '' });
    keep('vaccines', key, r, 'treatments', key);
  }

  // Tests: one entry per animal + date + test, with every result part
  const tests = new Map<string, Rec>();
  for (const r of by('tests')) {
    const a = s(r['Animal ID']); const on = d(r['Test Date']);
    const name0 = s(r['Test Name']);
    if (!a || !on || !name0) continue;
    const group = TEST_GROUP.find(([re]) => re.test(name0))?.[1] ?? name0;
    const key = `TEST:${a}:${on}:${group}`;
    const t = types.find((x) => x.name === group) ?? null;
    const done = /completed/i.test(s(r['Test Status']));
    const cur = tests.get(key) ?? { sl_key: key, animal: a, type_id: t?.id ?? null, kind: 'test', name: group, given_on: done ? on : null, next_due_on: done ? null : on,
      product: s(r['Test Product']), manufacturer: '', batch: '', vet: s(r['Test By']), parts: [] as string[], notes: s(r['Test Notes']) };
    if (done) { cur.given_on = on; cur.next_due_on = null; }
    const part = s(r['Result Name']); const res = s(r.Result);
    if (res) cur.parts.push(`${PART_NAME[part.toLowerCase()] ?? part} ${resultWord(res)}`.trim());
    tests.set(key, cur);
    keep('tests', `${key}:${part}`, r, 'treatments', key);
  }
  for (const t of tests.values()) { t.result = [...new Set(t.parts)].join(' · '); delete t.parts; treatments.push(t); }

  // Treatments: worming and flea/tick become care entries; other medicines become medication courses
  const trtKeys = new Set<string>();
  const latestCourse = new Map<string, Rec>();
  const worm = types.find((t) => t.name === 'Worming');
  const flea = types.find((t) => t.name === 'Flea & tick');
  const courses = new Map<string, Rec>();
  const doseCount = new Map<string, number>();
  for (const r of by('treatments')) {
    const a = s(r['Animal ID']); const on = d(r['Date Given']);
    const product = s(r.Product);
    if (!a || !on || !product) continue;
    const doseKey = `DOSE:${a}:${on}:${s(r['Time Given'])}:${product}`;
    if (WORM.test(product) || FLEA.test(product)) {
      const isWorm = WORM.test(product);
      const t = isWorm ? worm : flea;
      const key = `TRT:${a}:${on}:${product}`;
      if (!trtKeys.has(key) && trtKeys.add(key))
        treatments.push({ sl_key: key, animal: a, type_id: t?.id ?? null, kind: isWorm ? 'worming' : 'flea_tick', name: t?.name ?? product, given_on: on,
          next_due_on: t?.interval_days ? addDays(on, t.interval_days) : null, product, manufacturer: '', batch: '',
          vet: [s(r['Given By']), s(r['Supervising Veterinarian'])].filter(Boolean).join(' · '), result: '',
          notes: [s(r.Amount), s(r['Dose Notes']), s(r['Treatment Notes'])].filter(Boolean).join(' · ') });
      keep('treatments', doseKey, r, 'treatments', key);
    } else {
      // group doses into courses: same animal + product, gaps of 7 days or less
      const base = `${a}|${product}`;
      const open = latestCourse.get(base);
      let c = open && on <= addDays(open.ended_on, 7) && on >= addDays(open.started_on, -7) ? open : null;
      if (!c) {
        c = { base, sl_key: `MED:${a}:${on}:${product}`, animal: a, name: product, started_on: on, ended_on: on, notes: new Set<string>() };
        courses.set(c.sl_key, c);
        if (!open || on >= open.ended_on) latestCourse.set(base, c);
      }
      if (on < c.started_on) c.started_on = on;
      if (on > c.ended_on) c.ended_on = on;
      doseCount.set(c.sl_key, (doseCount.get(c.sl_key) ?? 0) + 1);
      for (const n of [s(r.Amount), s(r['Dose Notes'])]) if (n) c.notes.add(n);
      keep('treatments', doseKey, r, 'medications', c.sl_key);
    }
  }
  const medications = [...courses.values()].map((c) => ({
    sl_key: c.sl_key, animal: c.animal, name: c.name, started_on: c.started_on, ended_on: c.ended_on, active: false, source: 'shelterluv',
    instructions: [`${doseCount.get(c.sl_key)} dose${doseCount.get(c.sl_key) === 1 ? '' : 's'}`, ...[...c.notes].slice(0, 3)].join(' · '),
  }));

  // Medical history: procedures, exams, diagnoses
  const notes: Rec[] = [];
  for (const r of by('procedures')) {
    const a = s(r['Animal ID']); const on = d(r['Date Completed']);
    if (!a || !on) continue;
    const key = `PROC:${a}:${on}:${s(r['Procedure/Surgery Type'])}`;
    notes.push({ sl_key: key, animal: a, noted_on: on, title: s(r['Procedure/Surgery Type']) || 'Procedure',
      body: [s(r.Surgeon) && `Surgeon: ${s(r.Surgeon)}`, s(r.Clinic) && `Clinic: ${s(r.Clinic)}`, s(r.Memo), s(r.Notes)].filter(Boolean).join('\n') });
    keep('procedures', key, r, 'medical_notes', key);
  }
  for (const r of by('exams')) {
    const a = s(r['Animal ID']); const on = d(r['Date Completed']);
    if (!a || !on) continue;
    const key = `EXAM:${a}:${on}:${s(r.Type)}`;
    notes.push({ sl_key: key, animal: a, noted_on: on, title: `Exam${s(r['Exam Reason']) ? `: ${s(r['Exam Reason'])}` : ''}`,
      body: ['Subjective', 'Objective', 'Assessment', 'Plan', 'New Diagnoses', 'Performed By'].map((k) => s(r[k]) && `${k}: ${s(r[k])}`).filter(Boolean).join('\n') });
    keep('exams', key, r, 'medical_notes', key);
  }
  for (const r of by('diagnoses')) {
    const a = s(r['Animal ID']); const on = d(r['Date Diagnosed']);
    if (!a || !on) continue;
    const key = `DX:${a}:${on}:${s(r.Diagnosis)}`;
    notes.push({ sl_key: key, animal: a, noted_on: on, title: `Diagnosis: ${s(r.Diagnosis)}`,
      body: [s(r.Notes), s(r['Diagnosed By']) && `By ${s(r['Diagnosed By'])}`, s(r['Diagnosis Status']) && `Status: ${s(r['Diagnosis Status'])}`, d(r['Resolution Date']) && `Resolved ${d(r['Resolution Date'])}`].filter(Boolean).join('\n') });
    keep('diagnoses', key, r, 'medical_notes', key);
  }

  // Animals that appear only in event reports (not in the animal list) still get a record
  const all = [...locations, ...treatments, ...medications, ...notes, ...weights];
  for (const r of all) if (!animals.has(r.animal)) {
    const src = raw.find((x) => x.animal_sl_id === r.animal)?.data ?? {};
    animals.set(r.animal, { sl_key: r.animal, sl_internal_id: s(src['Internal ID (API)']) || null, source: 'shelterluv', name: s(src.Name) || r.animal,
      species: /cat/i.test(s(src.Species)) ? 'cat' : 'dog', breed: s(src['Primary Breed']), colour: '', sex: 'unknown', dob: null, neutered: null,
      microchip: '', microchip_on: null, intake_on: null, notes: '', final_status: 'other' });
  }

  // De-duplicate microchips (keep the first animal; note it on the others)
  const chips = new Map<string, string>();
  for (const a of animals.values()) {
    if (!a.microchip) continue;
    if (chips.has(a.microchip)) { a.notes = `Shelterluv microchip ${a.microchip} is also on ${chips.get(a.microchip)}.`; a.microchip = ''; }
    else chips.set(a.microchip, a.sl_key);
  }

  return { animals: [...animals.values()], contacts: [...contacts.values()], locations, treatments, medications, notes, weights, raw };
}

export type Built = ReturnType<typeof build>;

// ---------- writing ----------

async function inChunks<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<void>, onStep: (n: number) => void) {
  for (let i = 0; i < rows.length; i += size) {
    await fn(rows.slice(i, i + size));
    onStep(Math.min(i + size, rows.length));
  }
}

async function ids(table: string, keys: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 300) {
    const { data, error } = await supabase.from(table).select('id, sl_key').in('sl_key', keys.slice(i, i + 300));
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of data ?? []) m.set(r.sl_key, r.id);
  }
  return m;
}

/** Insert new records; existing Shelterluv keys are left alone so edits made in PAWSapp are never overwritten. */
async function insertNew(table: string, rows: Rec[]) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'sl_key', ignoreDuplicates: true });
  if (error) throw new Error(`${table}: ${error.message}`);
}

export async function write(b: Built, me: string, progress: (msg: string) => void) {
  const strip = (r: Rec, drop: string[]) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k)));

  progress(`People: 0 / ${b.contacts.length}`);
  await inChunks(b.contacts, 500, (c) => insertNew('contacts', c.map((x) => ({ ...x, created_by: me }))), (n) => progress(`People: ${n} / ${b.contacts.length}`));
  const contactIds = await ids('contacts', b.contacts.map((c) => c.sl_key));

  progress(`Animals: 0 / ${b.animals.length}`);
  await inChunks(b.animals, 300, (c) => insertNew('animals', c.map((a) => ({ ...strip(a, ['final_status']), status: 'other', in_shelter: false, created_by: me, updated_at: new Date().toISOString() }))), (n) => progress(`Animals: ${n} / ${b.animals.length}`));
  const animalIds = await ids('animals', b.animals.map((a) => a.sl_key));
  const A = (k: string) => animalIds.get(k);

  const locs = b.locations.filter((l) => A(l.animal)).sort((x, y) => x.from_on.localeCompare(y.from_on))
    .map((l) => ({ sl_key: l.sl_key, animal_id: A(l.animal), status: l.status, kennel_id: null, contact_id: l.contact ? contactIds.get(l.contact) ?? null : null,
      with_name: l.with_name ?? '', with_contact: '', country: l.country ?? '', from_on: l.from_on, note: l.note ?? '', created_by: me }));
  progress(`Location history: 0 / ${locs.length}`);
  await inChunks(locs, 300, (c) => insertNew('animal_locations', c), (n) => progress(`Location history: ${n} / ${locs.length}`));

  const tr = b.treatments.filter((t) => A(t.animal)).map((t) => ({ ...strip(t, ['animal']), animal_id: A(t.animal), created_by: me }));
  progress(`Vaccinations, tests & treatments: 0 / ${tr.length}`);
  await inChunks(tr, 500, (c) => insertNew('treatments', c), (n) => progress(`Vaccinations, tests & treatments: ${n} / ${tr.length}`));

  const meds = b.medications.filter((m) => A(m.animal)).map((m) => ({ ...strip(m, ['animal']), animal_id: A(m.animal), created_by: me }));
  progress(`Medication history: 0 / ${meds.length}`);
  await inChunks(meds, 500, (c) => insertNew('medications', c), (n) => progress(`Medication history: ${n} / ${meds.length}`));

  const notes = b.notes.filter((m) => A(m.animal)).map((m) => ({ ...strip(m, ['animal']), animal_id: A(m.animal), created_by: me }));
  progress(`Medical history: ${notes.length}`);
  await inChunks(notes, 500, (c) => insertNew('medical_notes', c), () => {});

  const w = b.weights.filter((m) => A(m.animal)).map((m) => ({ ...strip(m, ['animal']), animal_id: A(m.animal), created_by: me }));
  await inChunks(w, 500, (c) => insertNew('animal_weights', c), () => {});

  progress(`Original Shelterluv data: 0 / ${b.raw.length}`);
  await inChunks(b.raw, 500, async (c) => {
    const { error } = await supabase.from('sl_raw').upsert(c, { onConflict: 'report,sl_key', ignoreDuplicates: true });
    if (error) throw new Error(`sl_raw: ${error.message}`);
  }, (n) => progress(`Original Shelterluv data: ${n} / ${b.raw.length}`));

  // Current status straight from Shelterluv, for animals nobody has edited in PAWSapp yet
  progress('Setting where each animal is now…');
  const groups = new Map<string, string[]>();
  for (const a of b.animals) { const id = A(a.sl_key); if (id) groups.set(a.final_status, [...(groups.get(a.final_status) ?? []), id]); }
  // skip animals someone has already moved in PAWSapp (they have a location entry that didn't come from Shelterluv)
  const moved = new Set<string>();
  const allIds = [...animalIds.values()];
  for (let i = 0; i < allIds.length; i += 150) {
    const { data } = await supabase.from('animal_locations').select('animal_id').is('sl_key', null).in('animal_id', allIds.slice(i, i + 150));
    for (const r of data ?? []) moved.add(r.animal_id);
  }
  for (const [status, list0] of groups) {
    const list = list0.filter((id) => !moved.has(id));
    for (let i = 0; i < list.length; i += 150) {
      const { error } = await supabase.from('animals').update({ status }).in('id', list.slice(i, i + 150));
      if (error) throw new Error(`status: ${error.message}`);
    }
  }
  progress('Done');
}
