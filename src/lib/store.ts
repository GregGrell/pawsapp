// Offline-first store.
// - Every table the app needs is kept as a snapshot in memory and in IndexedDB, so the app opens and works with no signal.
// - Writes are applied to the snapshot straight away and queued in an outbox; the outbox is sent when the phone is online.
// - Photos are kept as blobs in the outbox until they upload.
import { get, set } from 'idb-keyval';
import { supabase } from './supabase';
import { addDays, today } from './time';

export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;

type Op =
  | { id: string; type: 'insert'; table: string; row: Row }
  | { id: string; type: 'update'; table: string; match: Row; patch: Row }
  | { id: string; type: 'upsert'; table: string; row: Row; onConflict: string }
  | { id: string; type: 'upload'; bucket: string; path: string; blob: Blob };

type State = {
  tables: Tables;
  outbox: Op[];
  online: boolean;
  syncing: boolean;
  lastSync: string | null;
  error: string | null;
  loaded: boolean;
};

const SNAP_KEY = 'paws-snapshot-v1';
const OUTBOX_KEY = 'paws-outbox-v1';

let state: State = {
  tables: {},
  outbox: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  lastSync: null,
  error: null,
  loaded: false,
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function setState(p: Partial<State>) {
  state = { ...state, ...p };
  emit();
}
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function getState() {
  return state;
}

// ---------- what we load ----------
function queries(userId: string, isMgmt: boolean) {
  const d = today();
  const since30 = addDays(d, -30);
  const since7 = addDays(d, -7);
  const q: Record<string, () => PromiseLike<{ data: any; error: any }>> = {
    profiles: () => supabase.from('profiles').select('*').order('full_name'),
    app_settings: () => supabase.from('app_settings').select('*'),
    kennels: () => supabase.from('kennels').select('*').order('species').order('sort'),
    animals: () => supabase.from('animals').select('*').eq('in_shelter', true).order('name'),
    medications: () => supabase.from('medications').select('*').eq('active', true),
    vaccines_due: () => supabase.from('vaccines_due').select('*').eq('done', false).lte('due_on', addDays(d, 14)).order('due_on'),
    kennel_logs: () => supabase.from('kennel_logs').select('*').gte('created_at', `${since7}T00:00:00+03:00`).order('created_at'),
    calendar_items: () => supabase.from('calendar_items').select('*').eq('active', true),
    task_completions: () => supabase.from('task_completions').select('*').gte('occurs_on', since30),
    appointment_outcomes: () => supabase.from('appointment_outcomes').select('*').gte('occurs_on', since30),
    requests: () => supabase.from('requests').select('*').gte('created_at', `${since30}T00:00:00+03:00`).order('created_at', { ascending: false }),
    request_replies: () => supabase.from('request_replies').select('*').gte('created_at', `${since30}T00:00:00+03:00`).order('created_at'),
    maintenance_issues: () => supabase.from('maintenance_issues').select('*').or(`status.neq.fixed,updated_at.gte.${since30}T00:00:00+03:00`).order('created_at', { ascending: false }),
    incidents: () => supabase.from('incidents').select('*').gte('created_at', `${since30}T00:00:00+03:00`).order('created_at', { ascending: false }),
    leave_requests: () => supabase.from('leave_requests').select('*').gte('end_on', addDays(d, -90)).order('start_on'),
    sick_reports: () => supabase.from('sick_reports').select('*').gte('sick_on', addDays(d, -90)).order('sick_on', { ascending: false }),
    timesheet_entries: () =>
      (isMgmt ? supabase.from('timesheet_entries').select('*') : supabase.from('timesheet_entries').select('*').eq('user_id', userId)).gte('work_on', since30),
    visitors: () => supabase.from('visitors').select('*').gte('signed_in_at', `${since7}T00:00:00+03:00`).order('signed_in_at', { ascending: false }),
    eod_checklist_items: () => supabase.from('eod_checklist_items').select('*').eq('active', true).order('sort'),
    eod_signoffs: () => supabase.from('eod_signoffs').select('*').gte('work_on', since30),
    petty_cash_issues: () => supabase.from('petty_cash_issues').select('*').order('created_at'),
    petty_cash_spends: () => supabase.from('petty_cash_spends').select('*').order('created_at'),
  };
  return q;
}

let ctx: { userId: string; isMgmt: boolean } | null = null;

export async function boot(userId: string, isMgmt: boolean) {
  ctx = { userId, isMgmt };
  const [snap, outbox] = await Promise.all([get(SNAP_KEY), get(OUTBOX_KEY)]);
  const cached = snap && snap.userId === userId ? snap : null;
  setState({
    tables: cached?.tables ?? {},
    lastSync: cached?.lastSync ?? null,
    outbox: (outbox as Op[]) ?? [],
    loaded: !!cached,
  });
  window.addEventListener('online', () => {
    setState({ online: true });
    sync();
  });
  window.addEventListener('offline', () => setState({ online: false }));
  setInterval(() => {
    if (navigator.onLine) sync();
  }, 60_000);
  startRealtime();
  await sync();
}

async function persist() {
  await Promise.all([
    set(SNAP_KEY, { userId: ctx?.userId, tables: state.tables, lastSync: state.lastSync }),
    set(OUTBOX_KEY, state.outbox),
  ]);
}

export async function refresh(only?: string[]) {
  if (!ctx) return;
  const q = queries(ctx.userId, ctx.isMgmt);
  const names = only ?? Object.keys(q);
  const results = await Promise.all(names.map((n) => q[n]()));
  const tables = { ...state.tables };
  let failed = false;
  results.forEach((r, i) => {
    if (r.error) failed = true;
    else tables[names[i]] = r.data ?? [];
  });
  if (failed && !only) throw new Error('Could not load everything');
  // keep queued rows visible until they upload
  applyOutboxTo(tables);
  setState({ tables, loaded: true, lastSync: new Date().toISOString() });
  await persist();
}

function applyOutboxTo(tables: Tables) {
  for (const op of state.outbox) applyLocal(tables, op);
}

function sameKey(a: Row, b: Row, cols: string[]) {
  return cols.every((c) => a[c] === b[c]);
}

function applyLocal(tables: Tables, op: Op) {
  if (op.type === 'upload') return;
  const list = (tables[op.table] = [...(tables[op.table] ?? [])]);
  if (op.type === 'insert') {
    if (!list.some((r) => r.id === op.row.id)) list.push(op.row);
  } else if (op.type === 'upsert') {
    const cols = op.onConflict.split(',');
    const i = list.findIndex((r) => sameKey(r, op.row, cols));
    if (i >= 0) list[i] = { ...list[i], ...op.row };
    else list.push(op.row);
  } else if (op.type === 'update') {
    const cols = Object.keys(op.match);
    for (let i = 0; i < list.length; i++) if (sameKey(list[i], op.match, cols)) list[i] = { ...list[i], ...op.patch };
  }
}

// ---------- writes ----------
const uid = () => crypto.randomUUID();

function enqueue(ops: Op[]) {
  const tables = { ...state.tables };
  ops.forEach((op) => applyLocal(tables, op));
  setState({ tables, outbox: [...state.outbox, ...ops] });
  persist();
  sync();
}

export function insert(table: string, row: Row): Row {
  const full = { id: uid(), ...row };
  enqueue([{ id: uid(), type: 'insert', table, row: full }]);
  return full;
}

export function upsert(table: string, row: Row, onConflict: string) {
  enqueue([{ id: uid(), type: 'upsert', table, row, onConflict }]);
}

export function update(table: string, match: Row, patch: Row) {
  enqueue([{ id: uid(), type: 'update', table, match, patch }]);
}

/** Queue a file; returns the storage path to save on the row. */
export function queueUpload(bucket: 'photos' | 'certificates', blob: Blob, folder: string): string {
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
  const path = `${folder}/${uid()}.${ext}`;
  localFiles.set(`${bucket}/${path}`, URL.createObjectURL(blob));
  state = { ...state, outbox: [...state.outbox, { id: uid(), type: 'upload', bucket, path, blob }] };
  persist();
  return path;
}

export const localFiles = new Map<string, string>();

let syncing: Promise<void> | null = null;
export function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!navigator.onLine) {
      setState({ online: false });
      return;
    }
    setState({ syncing: true, online: true });
    try {
      await flush();
      await refresh();
      setState({ error: null });
    } catch (e: any) {
      setState({ error: e?.message ?? 'Sync failed' });
    } finally {
      setState({ syncing: false });
      syncing = null;
    }
  })();
  return syncing;
}

function isNetworkError(err: any) {
  const msg = String(err?.message ?? err ?? '');
  return /fetch|network|Failed to fetch|Load failed|timeout/i.test(msg) || err?.status === 0;
}

async function flush() {
  while (state.outbox.length) {
    const op = state.outbox[0];
    let error: any = null;
    try {
      if (op.type === 'upload') {
        const r = await supabase.storage.from(op.bucket).upload(op.path, op.blob, { upsert: true, contentType: op.blob.type || 'image/jpeg' });
        error = r.error;
      } else if (op.type === 'insert') {
        const r = await supabase.from(op.table).upsert(op.row, { onConflict: 'id', ignoreDuplicates: true });
        error = r.error;
        // Incidents alert management straight away once they reach the server.
        if (!error && op.table === 'incidents') supabase.functions.invoke('notify', { body: { type: 'incident', id: op.row.id } }).catch(() => {});
        if (!error && op.table === 'maintenance_issues') supabase.functions.invoke('notify', { body: { type: 'maintenance', id: op.row.id } }).catch(() => {});
      } else if (op.type === 'upsert') {
        const r = await supabase.from(op.table).upsert(op.row, { onConflict: op.onConflict });
        error = r.error;
      } else if (op.type === 'update') {
        let q: any = supabase.from(op.table).update(op.patch);
        for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v);
        const r = await q;
        error = r.error;
      }
    } catch (e) {
      error = e;
    }
    if (error) {
      if (isNetworkError(error)) throw new Error('Waiting for signal');
      // A permanent problem (e.g. permission): drop it so the queue keeps moving, but tell the person.
      console.warn('Dropped change', op, error);
      setState({ error: `One change couldn't be saved: ${error.message ?? error}` });
    }
    state = { ...state, outbox: state.outbox.slice(1) };
    await persist();
    emit();
  }
}

// ---------- realtime ----------
let channel: ReturnType<typeof supabase.channel> | null = null;
let pending = new Set<string>();
let timer: any = null;
function startRealtime() {
  if (channel) return;
  channel = supabase.channel('paws-live');
  const live = ['kennel_logs', 'calendar_items', 'task_completions', 'appointment_outcomes', 'requests', 'incidents', 'eod_signoffs', 'leave_requests', 'petty_cash_spends', 'petty_cash_issues', 'visitors', 'maintenance_issues'];
  live.forEach((t) =>
    channel!.on('postgres_changes' as any, { event: '*', schema: 'public', table: t }, () => {
      pending.add(t);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const names = [...pending];
        pending = new Set();
        if (!state.outbox.length) refresh(names).catch(() => {});
      }, 400);
    }),
  );
  channel.subscribe();
}

export async function signedUrl(bucket: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const local = localFiles.get(`${bucket}/${path}`);
  if (local) return local;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function clearLocal() {
  await Promise.all([set(SNAP_KEY, null), set(OUTBOX_KEY, [])]);
}
