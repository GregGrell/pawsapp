// Shelterluv API → PAWSapp.
// Runs hourly (cron token) and on demand from management ("Sync now" / "Test the key").
// Shelterluv's API is read-only and covers: animals (incl. photos, microchips, weight), intake/outcome/foster events,
// and vaccines. Everything is matched on Shelterluv IDs; new records are added and blank fields filled in, but
// nothing edited in PAWSapp is ever overwritten. Each step remembers where it got to, so a long first run
// simply carries on at the next run.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const BASE = 'https://new.shelterluv.com/api/v1';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const BUDGET_MS = 105_000; // stop starting new work after this; the next run continues
const STATE_KEY = 'shelterluv_sync_state';
const RESULT_KEY = 'shelterluv_last_sync';
// Moves before this date were already loaded from the export files, whose dates are in the Shelterluv account's
// time zone (US Eastern) and so can sit a day apart from the API's. Only those older moves get the ±1 day matching.
const EXPORT_CUTOFF = '2026-11-05';
const PREFIX = 'PRUK-A-';
/** The API gives the bare number ("10"); PAWSapp keeps Shelterluv's full Animal ID ("PRUK-A-10"). */
const fullId = (id: string) => (/^\d+$/.test(id) ? `${PREFIX}${id}` : id);

type Rec = Record<string, any>;
const s = (v: unknown) => (v == null ? '' : String(v).trim());
const qDate = (unix?: number | string | null) => { const n = Number(unix); return n > 0 ? new Date((n + 3 * 3600) * 1000).toISOString().slice(0, 10) : null; };
const strDate = (raw?: string | number | null) => {
  const v = s(raw);
  if (!v) return null;
  if (/^\d+$/.test(v)) return qDate(v);
  const t = Date.parse(v.includes('T') || v.includes('Z') ? v : v.replace(' ', 'T') + 'Z');
  return Number.isNaN(t) ? (/^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null) : qDate(Math.floor(t / 1000));
};
const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);

let started = 0;
const timeLeft = () => Date.now() - started < BUDGET_MS;

async function sl(path: string, key: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 15_000)); continue; }
    const text = await r.text();
    if (r.status === 401 || r.status === 403) throw new Error('Shelterluv refused the API key. Check it was copied in full.');
    if (!r.ok) throw new Error(`Shelterluv ${r.status}: ${text.slice(0, 200)}`);
    try { return JSON.parse(text); } catch { throw new Error(`Shelterluv sent something that isn't JSON: ${text.slice(0, 120)}`); }
  }
  throw new Error('Shelterluv is rate-limiting requests; try again in a few minutes.');
}

/** Read every row of a table, 1,000 at a time. */
async function all(table: string, cols: string, filter?: (q: any) => any) {
  const out: Rec[] = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from(table).select(cols).order('id').range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function insertRows(table: string, rows: Rec[], onConflict = 'sl_key') {
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + 300), { onConflict, ignoreDuplicates: true });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}
async function keepRaw(report: string, rows: Rec[]) {
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await admin.from('sl_raw').upsert(rows.slice(i, i + 300), { onConflict: 'report,sl_key' });
    if (error) throw new Error(`sl_raw: ${error.message}`);
  }
}

// ---------- mapping ----------
function speciesOf(a: Rec): 'dog' | 'cat' | null {
  const t = s(a.Type).toLowerCase();
  return t.startsWith('dog') ? 'dog' : t.startsWith('cat') ? 'cat' : null;
}
function statusFromAnimal(a: Rec): string {
  const st = s(a.Status).toLowerCase();
  if (a.InFoster === true || a.InFoster === 'true' || /foster/.test(st)) return 'foster';
  if (/travel/.test(st)) return 'foster';
  if (/adopt(ed|ion)? ?$|in home/.test(st) && !/available/.test(st)) return 'adopted';
  if (/transfer/.test(st)) return 'transferred';
  if (/return/.test(st) && /owner/.test(st)) return 'returned';
  if (/(died|death|deceased|euthan)/.test(st)) return 'deceased';
  if (/(lost|stolen|released|colony|wild)/.test(st)) return 'other';
  if (/(available|custody|hold|intake|medical|pending|shelter|special)/.test(st)) return 'shelter';
  return 'other';
}
function eventStatus(type: string): string | null {
  if (type === 'Intake.Service' || type === 'Outcome.Service') return null; // not a move
  if (type.startsWith('Intake.')) return 'shelter';
  if (type === 'Outcome.Foster' || type === 'Foster') return 'foster';
  if (type === 'Outcome.Adoption') return 'adopted';
  if (type === 'Outcome.Transfer') return 'transferred';
  if (type === 'Outcome.ReturnToOwner') return 'returned';
  if (type === 'Outcome.UnassistedDeathInCustody' || type === 'Outcome.Euthanasia') return 'deceased';
  if (type.startsWith('Outcome.')) return 'other';
  return null;
}
function vaccineType(product: string, types: Rec[]) {
  const p = product.toLowerCase();
  const by = (n: string) => types.find((t) => t.name === n) ?? null;
  if (/rabi|rabvac|biocan r/.test(p)) return by('Rabies');
  if (/dapp|dhpp|da2pp|canine 1-/.test(p)) return by('DHPPi + Lepto');
  if (/tricat|rcp|fvrcp|fel-o-guard|feligen|herpes/.test(p)) return by('Tricat (FVRCP)');
  return null;
}

// ---------- the run ----------
async function run(mode: 'run' | 'probe') {
  started = Date.now();
  const key = Deno.env.get('SHELTERLUV_API_KEY');
  if (!key) throw new Error('No Shelterluv API key saved yet.');

  if (mode === 'probe') {
    const [a, e, v] = await Promise.all([sl('/animals?limit=1', key), sl('/events/all?limit=1', key), sl('/vaccines?limit=1', key)]);
    return { ok: true, probe: true, animals: a.total_count ?? null, events: e.total_count ?? null, vaccines: v.total_count ?? null,
      animalFields: Object.keys((a.animals ?? [])[0] ?? {}), eventSample: (e.events ?? [])[0] ?? null, vaccineSample: (v.vaccines ?? v.data ?? [])[0] ?? null };
  }

  const { data: st0 } = await admin.from('app_settings').select('value').eq('key', STATE_KEY).maybeSingle();
  const st: Rec = st0?.value ?? {};
  const now = Math.floor(Date.now() / 1000);
  const log: Rec = { animalsAdded: 0, animalsFilled: 0, moves: 0, vaccinesAdded: 0, vaccinesFilled: 0, weights: 0, photos: 0 };
  const save = async () => { await admin.from('app_settings').upsert({ key: STATE_KEY, value: st }); };

  const types = (await admin.from('treatment_types').select('*')).data ?? [];
  let animals = await all('animals', 'id, sl_key, sl_internal_id, name, breed, colour, sex, dob, neutered, microchip, microchip_on, intake_on, photo_path, status');
  const byKey = () => {
    const m = new Map<string, Rec>();
    for (const a of animals) { if (a.sl_key) m.set(a.sl_key, a); if (a.sl_internal_id) m.set(`#${a.sl_internal_id}`, a); }
    return m;
  };
  let A = byKey();
  const chipsInUse = new Set(animals.map((a) => a.microchip).filter(Boolean));

  // 1. Animals: new ones added, blanks filled, latest weight, photo list remembered
  {
    st.animals_run = st.animals_offset != null ? st.animals_run : now;
    const since = st.animals_since ?? 0;
    for (let offset = st.animals_offset ?? 0; timeLeft(); offset += 100) {
      const page = await sl(`/animals?sort=updated_at&since=${since}&limit=100&offset=${offset}`, key);
      const list: Rec[] = page.animals ?? [];
      const adds: Rec[] = [], raws: Rec[] = [], weights: Rec[] = [];
      for (const a of list) {
        const sp = speciesOf(a);
        const id = fullId(s(a.ID));
        if (!sp || !id) continue;
        raws.push({ report: 'api_animal', sl_key: id, animal_sl_id: id, record_table: 'animals', record_sl_key: id, data: a });
        const chip = (a.Microchips ?? [])[0] ?? {};
        const mapped: Rec = {
          name: s(a.Name) || id, breed: s(a.Breed), colour: [s(a.Color), s(a.Pattern)].filter(Boolean).join(' / '),
          sex: /^f/i.test(s(a.Sex)) ? 'female' : /^m/i.test(s(a.Sex)) ? 'male' : 'unknown',
          dob: qDate(a.DOBUnixTime), neutered: a.Altered === 'Yes' ? true : a.Altered === 'No' ? false : null,
          microchip: s(chip.Id).replace(/\s/g, ''), microchip_on: qDate(chip.ImplantUnixTime), intake_on: qDate(a.LastIntakeUnixTime),
        };
        const cur = A.get(id) ?? A.get(`#${s(a['Internal-ID'])}`);
        if (!cur) {
          const status = statusFromAnimal(a);
          adds.push({ ...mapped, microchip: chipsInUse.has(mapped.microchip) ? '' : mapped.microchip, sl_key: id, sl_internal_id: s(a['Internal-ID']) || null,
            shelterluv_id: s(a['Internal-ID']) || null, source: 'shelterluv', species: sp, status, in_shelter: ['shelter', 'foster', 'trial'].includes(status),
            notes: chipsInUse.has(mapped.microchip) ? `Shelterluv microchip ${mapped.microchip} is already on another animal.` : '' });
          if (mapped.microchip) chipsInUse.add(mapped.microchip);
        } else {
          const patch: Rec = {};
          for (const f of ['breed', 'colour', 'dob', 'microchip_on', 'intake_on'] as const) if (!cur[f] && mapped[f]) patch[f] = mapped[f];
          if ((!cur.sex || cur.sex === 'unknown') && mapped.sex !== 'unknown') patch.sex = mapped.sex;
          if (cur.neutered == null && mapped.neutered != null) patch.neutered = mapped.neutered;
          if (!cur.microchip && mapped.microchip && !chipsInUse.has(mapped.microchip)) { patch.microchip = mapped.microchip; chipsInUse.add(mapped.microchip); }
          if (!cur.sl_internal_id && a['Internal-ID']) patch.sl_internal_id = s(a['Internal-ID']);
          if (Object.keys(patch).length) {
            const { error } = await admin.from('animals').update(patch).eq('id', cur.id);
            if (error) throw new Error(`animals: ${error.message}`);
            Object.assign(cur, patch);
            log.animalsFilled++;
          }
        }
        // Weight: Shelterluv sends pounds; we keep kg. Anything over 50 kg is a missing decimal point.
        let kg = parseFloat(s(a.CurrentWeightPounds)) / 2.20462;
        while (kg > 50) kg = kg / 10;
        const wOn = qDate(a.LastUpdatedUnixTime);
        if (kg > 0 && wOn) weights.push({ animal: id, kg: Math.round(kg * 10) / 10, on: wOn });
      }
      if (adds.length) {
        await insertRows('animals', adds);
        log.animalsAdded += adds.length;
        animals = await all('animals', 'id, sl_key, sl_internal_id, name, breed, colour, sex, dob, neutered, microchip, microchip_on, intake_on, photo_path, status');
        A = byKey();
      }
      await keepRaw('api_animal', raws);
      // only record a weight when it differs from the latest one we have
      if (weights.length) {
        const ids = weights.map((w) => A.get(w.animal)?.id).filter(Boolean);
        const { data: last } = await admin.from('animal_weights').select('animal_id, kg, weighed_on').in('animal_id', ids).order('weighed_on', { ascending: false });
        const latest = new Map<string, Rec>();
        for (const r of last ?? []) if (!latest.has(r.animal_id)) latest.set(r.animal_id, r);
        const rows = weights.map((w) => ({ w, id: A.get(w.animal)?.id })).filter(({ w, id }) => id && (!latest.get(id) || Math.abs(Number(latest.get(id)!.kg) - w.kg) >= 0.2))
          .map(({ w, id }) => ({ sl_key: `WAPI:${w.animal}:${w.on}`, animal_id: id, weighed_on: w.on, kg: w.kg, notes: 'From Shelterluv' }));
        if (rows.length) { await insertRows('animal_weights', rows); log.weights += rows.length; }
      }
      if (!page.has_more || !list.length) { st.animals_offset = null; st.animals_since = st.animals_run; st.animals_done_at = new Date().toISOString(); break; }
      st.animals_offset = offset + 100;
    }
    await save();
  }

  // 2. Events → location history (intake, foster, back from foster, adoption, transfer…)
  if (timeLeft()) {
    // Shelterluv's events name people by internal number; the people export links that number to our contact
    const contacts = new Map((await all('contacts', 'id, sl_key, full_name')).map((c) => [c.sl_key, c]));
    const people = new Map<string, Rec>();
    for (const p of await all('sl_raw', 'id, sl_key, data', (q) => q.eq('report', 'people'))) {
      const c = contacts.get(p.sl_key) ?? contacts.get(`P:${s(p.data['Person ID'])}`);
      if (c && s(p.data['Internal ID (API)'])) people.set(s(p.data['Internal ID (API)']), c);
    }
    const locs = await all('animal_locations', 'id, animal_id, from_on, status');
    const have = new Set(locs.map((l) => `${l.animal_id}|${l.from_on}|${l.status}`));
    const outcomes = new Set(locs.filter((l) => ['adopted', 'transferred', 'returned', 'deceased', 'other'].includes(l.status)).map((l) => `${l.animal_id}|${l.from_on}`));
    st.events_run = st.events_offset != null ? st.events_run : now;
    const since = st.events_since ?? 0;
    for (let offset = st.events_offset ?? 0; timeLeft(); offset += 100) {
      const page = await sl(`/events/all?since=${since}&limit=100&offset=${offset}`, key);
      const list: Rec[] = page.events ?? [];
      const rows: Rec[] = [], raws: Rec[] = [];
      for (const e of list) {
        const type = s(e.Type);
        const status = eventStatus(type);
        const on = qDate(e.Time);
        const recs: Rec[] = e.AssociatedRecords ?? [];
        const person = recs.find((r) => r.Type === 'Person');
        for (const r of recs.filter((x) => x.Type === 'Animal')) {
          const an = A.get(s(r.Id)) ?? A.get(`#${s(r.Id)}`);
          const k = `EV:${s(r.Id)}:${e.Time}:${type}`;
          raws.push({ report: 'api_event', sl_key: k, animal_sl_id: an?.sl_key ?? s(r.Id), record_table: 'animal_locations', record_sl_key: k, data: e });
          if (!an || !status || !on) continue;
          const sig = `${an.id}|${on}|${status}`;
          const old = on < EXPORT_CUTOFF;
          const near = (d: number) => `${an.id}|${addDays(on, d)}|${status}`;
          if (have.has(sig) || (old && (have.has(near(-1)) || have.has(near(1))))) continue; // already in PAWSapp
          // an old "back from foster" logged the day after an adoption/transfer is the same handover, not a new stay
          if (old && status === 'shelter' && (outcomes.has(`${an.id}|${on}`) || outcomes.has(`${an.id}|${addDays(on, -1)}`))) continue;
          have.add(sig);
          const sub = s(e.Subtype);
          rows.push({
            sl_key: k, animal_id: an.id, status, from_on: on, kennel_id: null, created_at: new Date(Number(e.Time) * 1000).toISOString(),
            contact_id: person ? people.get(s(person.Id))?.id ?? null : null, with_name: ['shelter', 'deceased'].includes(status) ? '' : person ? people.get(s(person.Id))?.full_name ?? '' : '', with_contact: '',
            country: status === 'adopted' ? (/abroad/i.test(sub) ? 'Abroad' : 'Qatar') : /belgium/i.test(sub) ? 'Belgium' : '',
            note: [type.replace('.', ' · ').replace('Intake · FosterReturn', 'Back from foster'), sub, e.User ? `by ${s(e.User)}` : ''].filter(Boolean).join(' · ') + ' (Shelterluv)',
          });
        }
      }
      rows.sort((x, y) => x.from_on.localeCompare(y.from_on));
      if (rows.length) { await insertRows('animal_locations', rows); log.moves += rows.length; }
      await keepRaw('api_event', raws);
      if (!page.has_more || !list.length) { st.events_offset = null; st.events_since = st.events_run; break; }
      st.events_offset = offset + 100;
    }
    await save();
  }

  // 3. Vaccines: add missing ones, fill in manufacturer / batch / vet on ones we already have.
  // Shelterluv doesn't sort or filter these by date, so read them all, at most once every 20 hours.
  if (timeLeft() && (st.vaccines_offset != null || !st.vaccines_since || now - st.vaccines_since > 20 * 3600)) {
    const vacs = await all('treatments', 'id, animal_id, given_on, type_id, name, product, manufacturer, batch, vet, notes', (q) => q.eq('kind', 'vaccine'));
    const byDay = new Map<string, Rec[]>();
    for (const v of vacs) { const k = `${v.animal_id}|${v.given_on}`; byDay.set(k, [...(byDay.get(k) ?? []), v]); }
    st.vaccines_run = st.vaccines_offset != null ? st.vaccines_run : now;
    let finished = false;
    for (let offset = st.vaccines_offset ?? 0; timeLeft(); offset += 100) {
      const page = await sl(`/vaccines?status=completed&limit=100&offset=${offset}`, key);
      const list: Rec[] = page.vaccines ?? page.data ?? [];
      const adds: Rec[] = [], raws: Rec[] = [];
      for (const v of list) {
        const on = strDate(v.completed_at);
        const an = A.get(`#${s(v.animal_id)}`);
        raws.push({ report: 'api_vaccine', sl_key: `VACAPI:${v.id}`, animal_sl_id: an?.sl_key ?? null, record_table: 'treatments', record_sl_key: null, data: v });
        if (!an || !on) continue;
        const product = s(v.product);
        const t = vaccineType(product, types);
        const vet = [s(v.vaccinated_by), s(v.supervising_vet), s(v.clinic)].filter(Boolean).join(' · ');
        const tag = s(v.rabies_tag_number) ? `Rabies tag ${s(v.rabies_tag_number)}` : '';
        const same = (byDay.get(`${an.id}|${on}`) ?? []).find((x) => (t && x.type_id === t.id) || x.product === product || x.name === product);
        if (same) {
          const patch: Rec = {};
          if (!same.manufacturer && s(v.manufacturer)) patch.manufacturer = s(v.manufacturer);
          if (!same.batch && s(v.lot)) patch.batch = s(v.lot);
          if (!same.vet && vet) patch.vet = vet;
          if (!same.product && product) patch.product = product;
          if (!same.notes && tag) patch.notes = tag;
          if (Object.keys(patch).length) {
            const { error } = await admin.from('treatments').update(patch).eq('id', same.id);
            if (error) throw new Error(`treatments: ${error.message}`);
            Object.assign(same, patch);
            log.vaccinesFilled++;
          }
          continue;
        }
        const due = t?.interval_days ? addDays(on, t.interval_days) : null;
        const row = { sl_key: `VAC:${an.sl_key}:${on}:${product}`, animal_id: an.id, type_id: t?.id ?? null, kind: 'vaccine', name: t?.name ?? (product || 'Vaccine'),
          given_on: on, next_due_on: due, product, manufacturer: s(v.manufacturer), batch: s(v.lot), vet, result: '', notes: tag };
        adds.push(row);
        byDay.set(`${an.id}|${on}`, [...(byDay.get(`${an.id}|${on}`) ?? []), row]);
      }
      if (adds.length) { await insertRows('treatments', adds); log.vaccinesAdded += adds.length; }
      await keepRaw('api_vaccine', raws);
      if (!page.has_more || !list.length) { finished = true; break; }
      st.vaccines_offset = offset + 100;
    }
    if (finished) { st.vaccines_offset = null; st.vaccines_since = st.vaccines_run; }
    await save();
  }

  // 4. Photos: cover photo for every animal; every photo for animals in our care. Copied into PAWSapp's storage.
  let photosLeft = 0;
  if (timeLeft()) {
    const rawAnimals = await all('sl_raw', 'id, sl_key, data', (q) => q.eq('report', 'api_animal'));
    const have = new Set((await all('animal_files', 'id, path')).map((f) => f.path));
    const queue: { an: Rec; url: string; cover: boolean }[] = [];
    for (const r of rawAnimals ?? []) {
      const an = A.get(fullId(r.sl_key)) ?? A.get(`#${s(r.data['Internal-ID'])}`);
      if (!an || an.status === 'deceased') continue;
      const cover = s(r.data.CoverPhoto);
      const inCare = ['shelter', 'foster', 'trial'].includes(an.status);
      const urls = [cover, ...(inCare ? (r.data.Photos ?? []).map(s) : [])].filter((u, i, arr) => u && arr.indexOf(u) === i && !/default|placeholder/i.test(u));
      urls.forEach((url, i) => queue.push({ an, url, cover: i === 0 && !!cover }));
    }
    const pathFor = async (url: string) => {
      const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(url)))).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
      return `animals/sl/${h}.jpg`;
    };
    const todo: { an: Rec; url: string; cover: boolean; path: string }[] = [];
    for (const q of queue) { const path = await pathFor(q.url); if (!have.has(path)) todo.push({ ...q, path }); }
    for (const q of todo) {
      if (!timeLeft()) break;
      try {
        const r = await fetch(q.url);
        if (!r.ok) continue;
        const bytes = new Uint8Array(await r.arrayBuffer());
        const { error } = await admin.storage.from('photos').upload(q.path, bytes, { contentType: r.headers.get('content-type') ?? 'image/jpeg', upsert: true });
        if (error) continue;
        await admin.from('animal_files').insert({ animal_id: q.an.id, kind: 'photo', path: q.path, caption: q.cover ? 'Shelterluv profile photo' : 'From Shelterluv', created_by: null });
        if (!q.an.photo_path) { await admin.from('animals').update({ photo_path: q.path }).eq('id', q.an.id); q.an.photo_path = q.path; }
        have.add(q.path);
        log.photos++;
      } catch { /* skip this photo; try again next run */ }
    }
    photosLeft = todo.filter((q) => !have.has(q.path)).length;
  }

  const unfinished = [st.animals_offset != null && 'animals', st.events_offset != null && 'events', st.vaccines_offset != null && 'vaccines'].filter(Boolean);
  return { at: new Date().toISOString(), ok: true, ...log, photosLeft, stillWorking: unfinished.length || photosLeft ? true : false, seconds: Math.round((Date.now() - started) / 1000) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const mode = body.probe ? 'probe' : 'run';
  try {
    if (body.type === 'cron') {
      const { data: tok } = await admin.rpc('get_secret', { secret_name: 'cron_token' });
      if (body.token !== tok) return new Response('forbidden', { status: 403, headers: cors });
    } else {
      const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
      const { data: u } = await admin.auth.getUser(jwt);
      const { data: me } = u?.user ? await admin.from('profiles').select('*').eq('id', u.user.id).single() : { data: null };
      if (!me?.active || me.role !== 'management') return new Response('forbidden', { status: 403, headers: cors });
    }
    const result = await run(mode);
    if (mode === 'run') await admin.from('app_settings').upsert({ key: RESULT_KEY, value: result });
    return Response.json(result, { headers: cors });
  } catch (e) {
    const err = { at: new Date().toISOString(), ok: false, error: String((e as Error).message ?? e) };
    if (mode === 'run') await admin.from('app_settings').upsert({ key: RESULT_KEY, value: err });
    return Response.json(err, { status: 200, headers: cors });
  }
});
