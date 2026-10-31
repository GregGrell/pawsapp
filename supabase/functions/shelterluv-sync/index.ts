// Shelterluv → PAWSapp animal sync.
// Runs nightly (cron token) and on demand from management ("Sync now").
// Reads animals in custody, keeps PAWSapp's animal list in step, and maps Shelterluv locations to kennel codes.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const BASE = 'https://www.shelterluv.com/api/v1';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

const norm = (s: string) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function sl(path: string, key: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { 'X-Api-Key': key, Accept: 'application/json' } });
  const text = await r.text();
  if (!r.ok) throw new Error(`Shelterluv ${r.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Shelterluv returned something that isn't JSON: ${text.slice(0, 120)}`); }
}

async function fetchInCustody(key: string) {
  const all: any[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const q = `?status_type=${encodeURIComponent('in custody')}&limit=100&offset=${offset}`;
    let page: any;
    try { page = await sl(`/animals${q}`, key); } catch (e) {
      if (offset === 0 && String(e).includes('404')) page = await sl(`/animal${q}`, key); else throw e;
    }
    const list = page.animals ?? page.data ?? [];
    all.push(...list);
    if (!page.has_more || !list.length) break;
  }
  return all;
}

function speciesOf(a: any): 'dog' | 'cat' | null {
  const t = String(a.Type ?? a.Species ?? '').toLowerCase();
  if (t.startsWith('dog')) return 'dog';
  if (t.startsWith('cat')) return 'cat';
  return null;
}

function locationTiers(a: any): string[] {
  const loc = a.CurrentLocation ?? {};
  return ['Tier1', 'Tier2', 'Tier3', 'Tier4'].map((k) => loc[k]).filter((x) => x && String(x).trim());
}

async function run(probe = false) {
  const key = Deno.env.get('SHELTERLUV_API_KEY');
  if (!key) throw new Error('No Shelterluv API key saved yet.');

  const animals = await fetchInCustody(key);
  const { data: kennels } = await admin.from('kennels').select('id, code, species').eq('active', true);
  const byCode = new Map((kennels ?? []).map((k) => [norm(k.code), k]));
  const { data: existing } = await admin.from('animals').select('*');

  const seen = new Set<string>();
  const unmatched = new Set<string>();
  let added = 0, updated = 0, skipped = 0;

  for (const a of animals) {
    const sp = speciesOf(a);
    if (!sp) { skipped++; continue; }
    if (a.InFoster === true || a.InFoster === 'true') { skipped++; continue; }
    const slid = String(a['Internal-ID'] ?? a.ID ?? a.Id);
    const name = String(a.Name ?? 'Unnamed').trim();
    seen.add(slid);

    // Kennel: the most specific location tier that matches a PAWSapp kennel code
    const tiers = locationTiers(a);
    let kennel: any = null;
    for (const t of [...tiers].reverse()) {
      const k = byCode.get(norm(t));
      if (k) { kennel = k; break; }
    }
    if (!kennel && tiers.length) unmatched.add(tiers.join(' › '));

    const match =
      (existing ?? []).find((x) => x.shelterluv_id === slid) ??
      (existing ?? []).find((x) => !x.shelterluv_id && x.species === sp && x.name.trim().toLowerCase() === name.toLowerCase());

    const row: any = { shelterluv_id: slid, name, species: sp, in_shelter: true, source: 'shelterluv', updated_at: new Date().toISOString() };
    if (kennel) row.kennel_id = kennel.id;

    if (probe) continue;
    if (match) {
      await admin.from('animals').update(row).eq('id', match.id);
      updated++;
    } else {
      await admin.from('animals').insert(row);
      added++;
    }
  }

  // Animals that came from Shelterluv but are no longer in custody → mark as left
  let left = 0;
  if (!probe) {
    for (const x of existing ?? []) {
      if (x.source === 'shelterluv' && x.in_shelter && x.shelterluv_id && !seen.has(x.shelterluv_id)) {
        await admin.from('animals').update({ in_shelter: false, updated_at: new Date().toISOString() }).eq('id', x.id);
        left++;
      }
    }
  }

  // What does Shelterluv actually send? (used to check for medical/vaccine data)
  let fields: string[] = [];
  let detailFields: string[] = [];
  if (animals[0]) {
    fields = Object.keys(animals[0]).sort();
    try {
      const id = animals[0]['Internal-ID'] ?? animals[0].ID;
      const d = await sl(`/animals/${id}`, key);
      detailFields = Object.keys(d.animal ?? d).sort();
    } catch { /* detail endpoint optional */ }
  }
  const medicalFields = [...fields, ...detailFields].filter((f) => /vacc|medic|treat|health|rabies|drug|dose/i.test(f));

  const result = {
    at: new Date().toISOString(), ok: true, probe,
    inCustody: animals.length, added, updated, left, skipped,
    unmatchedLocations: [...unmatched].slice(0, 30),
    medicalFields: [...new Set(medicalFields)], fields, detailFields,
  };
  if (!probe) await admin.from('app_settings').upsert({ key: 'shelterluv_last_sync', value: result });
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
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
    return Response.json(await run(!!body.probe), { headers: cors });
  } catch (e) {
    const err = { at: new Date().toISOString(), ok: false, error: String((e as Error).message ?? e) };
    if (!body.probe) await admin.from('app_settings').upsert({ key: 'shelterluv_last_sync', value: err });
    return Response.json(err, { status: 200, headers: cors });
  }
});
