import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { Page, toast } from '../components/ui';
import { supabase, VAPID_PUBLIC_KEY } from '../lib/supabase';

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush(userId: string) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = (navigator as any).standalone || matchMedia('(display-mode: standalone)').matches;
  if (ios && !standalone) throw new Error('On iPhone, first tap Share → Add to Home Screen, then open PAWSapp from the new icon and turn reminders on there.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser does not support notifications. On Android use Chrome; on iPhone add PAWSapp to the Home Screen first.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in Chrome site settings.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const j = sub.toJSON() as any;
  const { error } = await supabase.from('push_subscriptions').upsert({ user_id: userId, endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export default function Notifications() {
  const { me } = useAuth();
  const [perm, setPerm] = useState<string>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    navigator.serviceWorker?.ready.then((r) => r.pushManager.getSubscription()).then((s) => setSubscribed(!!s)).catch(() => setSubscribed(false));
  }, []);

  const on = perm === 'granted' && subscribed;
  return (
    <Page title="Notifications" back="More">
      <section className="card">
        <h2 className="h">On this phone</h2>
        <span className="t15" style={{ color: on ? 'var(--blue-dark)' : 'var(--amber)' }}>{on ? 'Reminders are on' : perm === 'denied' ? 'Blocked in Chrome settings' : 'Reminders are off'}</span>
        <span className="t14">You'll get: appointment reminders 1 hour before, untimed tasks first thing in the morning, and new requests from management.{' '}Management also gets incident alerts straight away and an alert if the end-of-day check isn't signed off in time.</span>
        {!on && (
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await enablePush(me.id); setPerm('granted'); setSubscribed(true); toast('Reminders turned on'); } catch (e: any) { toast(e.message ?? String(e)); }
            setBusy(false);
          }}>Turn on reminders</button>
        )}
        {on && (
          <button className="btn ghost" disabled={busy} onClick={async () => {
            setBusy(true);
            const { error } = await supabase.functions.invoke('notify', { body: { type: 'test' } });
            toast(error ? 'Could not send a test — check your signal' : 'Test sent — it should arrive in a few seconds');
            setBusy(false);
          }}>Send a test notification</button>
        )}
      </section>
      <section className="card">
        <h2 className="h">If reminders arrive late</h2>
        <span className="t14">Some Android phones delay notifications to save battery. On Android: Settings → Apps → Chrome → Battery → <b>Unrestricted</b>, and install PAWSapp from Chrome's menu → <b>Add to Home screen</b>. On iPhone: in Safari tap <b>Share → Add to Home Screen</b>, then always open PAWSapp from that icon.</span>
      </section>
    </Page>
  );
}
