// PAWSapp reminders and alerts.
// Called (a) every 5 minutes by the database scheduler with a cron token, and
// (b) by the app with the signed-in user's token for "test" and "incident".
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function secret(name: string) {
  const { data } = await admin.rpc('get_secret', { secret_name: name });
  return data as string | null;
}

// Qatar time helpers (UTC+3, no DST)
function qatar(d = new Date()) {
  const q = new Date(d.getTime() + 3 * 3600_000);
  const day = q.toISOString().slice(0, 10);
  const hm = q.toISOString().slice(11, 16);
  return { day, hm, dow: q.getUTCDay() };
}
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

type Payload = { title: string; body: string; url?: string; tag?: string; urgent?: boolean };

async function sendTo(userIds: string[] | 'all' | 'management' | 'staff', p: Payload) {
  let q = admin.from('profiles').select('id, role').eq('active', true);
  if (userIds === 'management') q = q.eq('role', 'management');
  if (userIds === 'staff') q = q.eq('role', 'staff');
  const { data: people } = await q;
  const ids = (people ?? []).map((x) => x.id).filter((id) => (Array.isArray(userIds) ? userIds.includes(id) : true));
  if (!ids.length) return 0;
  const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', ids);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), { TTL: 6 * 3600, urgency: p.urgent ? 'high' : 'normal' });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('push failed', e?.statusCode, e?.body);
    }
  }
  return sent;
}

/** Returns true the first time a key is seen, so each alert goes out once. */
async function once(key: string) {
  const { error } = await admin.from('notifications_sent').insert({ key });
  return !error;
}

function occursOn(it: any, day: string, dow: number) {
  if (it.repeat === 'none') return it.starts_on === day;
  if (it.starts_on > day) return false;
  if (it.repeat === 'daily') return true;
  if (it.repeat === 'weekly') return new Date(it.starts_on + 'T00:00:00Z').getUTCDay() === dow;
  return false;
}

async function name(id: string) {
  const { data } = await admin.from('profiles').select('full_name').eq('id', id).single();
  return data?.full_name ?? 'Someone';
}

async function incidentAlert(id: string) {
  const { data: i } = await admin.from('incidents').select('*').eq('id', id).single();
  if (!i || i.acknowledged_at) return 0;
  if (!(await once(`inc:${id}`))) return 0;
  return sendTo('management', { title: '⚠ Incident reported', body: `${i.description}${i.location ? ` — ${i.location}` : ''} (${await name(i.reported_by)})`, url: '#/incidents', tag: `inc-${id}`, urgent: true });
}

async function maintenanceAlert(id: string) {
  const { data: m } = await admin.from('maintenance_issues').select('*').eq('id', id).single();
  if (!m || m.status === 'fixed') return 0;
  if (!(await once(`maint:${id}`))) return 0;
  return sendTo('management', { title: m.urgent ? '⚠ Urgent maintenance' : 'Maintenance reported', body: `${m.description}${m.location ? ` — ${m.location}` : ''} (${await name(m.reported_by)})`, url: '#/maintenance', tag: `maint-${id}`, urgent: !!m.urgent });
}

async function runSchedule() {
  const { day, hm, dow } = qatar();
  const now = toMin(hm);
  const log: string[] = [];
  const { data: settings } = await admin.from('app_settings').select('*');
  const get = (k: string, d: string) => (settings ?? []).find((s) => s.key === k)?.value ?? d;
  const morning = toMin(get('morning_reminder_time', '07:00'));
  const eodAt = toMin(get('eod_alert_time', '20:00'));

  const { data: items } = await admin.from('calendar_items').select('*').eq('active', true);
  const todays = (items ?? []).filter((it) => occursOn(it, day, dow));

  // 1 hour before timed entries
  for (const it of todays.filter((x) => x.at_time)) {
    const t = toMin(it.at_time.slice(0, 5));
    if (now >= t - 60 && now < t && (await once(`rem:${it.id}:${day}`))) {
      const who = it.assignee ? [it.assignee] : 'all';
      const label = it.kind === 'task' ? 'Task' : ({ visitor: 'Visitor', vet: 'Vet', airport: 'Airport run', dropoff: 'Drop-off / pick-up' } as any)[it.category] ?? 'Appointment';
      await sendTo(who, { title: `${it.at_time.slice(0, 5)} · ${label}`, body: it.title, url: '#/calendar', tag: `rem-${it.id}` });
      log.push(`reminder ${it.title}`);
    }
  }

  // Morning round-up of untimed entries
  const untimed = todays.filter((x) => !x.at_time);
  if (untimed.length && now >= morning && now < morning + 180 && (await once(`morning:${day}`))) {
    await sendTo('all', { title: `Today: ${untimed.length} to do`, body: untimed.map((x) => x.title).slice(0, 6).join(' · '), url: '#/tasks', tag: `morning-${day}` });
    log.push('morning');
  }

  // End-of-day check not signed off
  if (now >= eodAt) {
    const { data: so } = await admin.from('eod_signoffs').select('id').eq('work_on', day).maybeSingle();
    if (!so && (await once(`eod:${day}`))) {
      await sendTo('management', { title: 'End-of-day check not signed off', body: `Nobody has signed off today's check yet (${get('eod_alert_time', '20:00')} deadline).`, url: '#/eod', tag: `eod-${day}`, urgent: true });
      log.push('eod alert');
    }
  }

  // Backup for incidents whose instant alert didn't go out
  const { data: inc } = await admin.from('incidents').select('id').is('acknowledged_at', null).gte('created_at', new Date(Date.now() - 86400_000).toISOString());
  for (const i of inc ?? []) if (await incidentAlert(i.id)) log.push('incident');

  // New requests from management → staff
  const since = new Date(Date.now() - 2 * 86400_000).toISOString();

  // Maintenance: backup for new reports, and tell the reporter when it's fixed
  const { data: mt } = await admin.from('maintenance_issues').select('id, status, reported_by, updated_by, description').or(`created_at.gte.${since},updated_at.gte.${since}`);
  for (const m of mt ?? []) {
    if (m.status !== 'fixed' && (await maintenanceAlert(m.id))) log.push('maintenance');
    if (m.status === 'fixed' && m.updated_by !== m.reported_by && (await once(`maint-fixed:${m.id}`)))
      await sendTo([m.reported_by], { title: 'Fixed', body: m.description, url: '#/maintenance', tag: `maint-${m.id}` });
  }
  const { data: reqs } = await admin.from('requests').select('*').eq('done', false).gte('created_at', since);
  for (const r of reqs ?? []) {
    if (await once(`req:${r.id}`)) {
      await sendTo('staff', { title: `Request from ${await name(r.from_user)}`, body: r.body, url: '#/', tag: `req-${r.id}` });
      log.push('request');
    }
  }

  // Leave and sick reports → management
  const { data: lv } = await admin.from('leave_requests').select('*').eq('status', 'pending').gte('created_at', since);
  for (const l of lv ?? []) {
    if (await once(`leave:${l.id}`)) await sendTo('management', { title: 'Leave request', body: `${await name(l.user_id)} · ${l.start_on}${l.end_on !== l.start_on ? ` to ${l.end_on}` : ''}`, url: '#/leave', tag: `leave-${l.id}` });
  }
  const { data: sk } = await admin.from('sick_reports').select('*').gte('created_at', since);
  for (const s of sk ?? []) {
    if (await once(`sick:${s.id}`)) await sendTo('management', { title: 'Sick today', body: `${await name(s.user_id)} has reported sick (day ${s.consecutive_day}${s.certificate_path ? ', certificate uploaded' : ''})`, url: '#/leave', tag: `sick-${s.id}` });
  }

  // Leave decisions → the person
  const { data: decided } = await admin.from('leave_requests').select('*').neq('status', 'pending').gte('decided_at', since);
  for (const l of decided ?? []) {
    if (await once(`leave-decision:${l.id}`)) await sendTo([l.user_id], { title: `Leave ${l.status}`, body: `${l.start_on}${l.end_on !== l.start_on ? ` to ${l.end_on}` : ''}`, url: '#/leave' });
  }

  // Tidy old keys
  await admin.from('notifications_sent').delete().lt('sent_at', new Date(Date.now() - 14 * 86400_000).toISOString());
  return log;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const [pub, priv] = await Promise.all([secret('vapid_public'), secret('vapid_private')]);
    webpush.setVapidDetails('mailto:admin@pawsrescueqatar.org', pub!, priv!);
    const body = await req.json().catch(() => ({}));

    if (body.type === 'cron') {
      if (body.token !== (await secret('cron_token'))) return new Response('forbidden', { status: 403, headers: cors });
      const log = await runSchedule();
      return Response.json({ ok: true, log }, { headers: cors });
    }

    // Everything else needs a signed-in, active user
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return new Response('unauthorised', { status: 401, headers: cors });
    const { data: me } = await admin.from('profiles').select('*').eq('id', u.user.id).single();
    if (!me?.active) return new Response('forbidden', { status: 403, headers: cors });

    if (body.type === 'test') {
      const n = await sendTo([me.id], { title: 'PAWSapp test', body: 'Reminders are working on this phone.', url: '#/notifications' });
      return Response.json({ ok: true, sent: n }, { headers: cors });
    }
    if (body.type === 'maintenance' && body.id) {
      const n = await maintenanceAlert(String(body.id));
      return Response.json({ ok: true, sent: n }, { headers: cors });
    }
    if (body.type === 'incident' && body.id) {
      const n = await incidentAlert(String(body.id));
      return Response.json({ ok: true, sent: n }, { headers: cors });
    }
    return new Response('unknown', { status: 400, headers: cors });
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500, headers: cors });
  }
});
