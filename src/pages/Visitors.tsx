import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Empty, NowOrTime, Page, toast } from '../components/ui';
import { useTable } from '../lib/hooks';
import { insert, update } from '../lib/store';
import { shortDate, timeOf, today } from '../lib/time';

export default function Visitors() {
  const visitors = useTable('visitors');
  const [qr, setQr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [group, setGroup] = useState(1);
  const url = `${location.origin}${location.pathname}#/visit`;
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 600, color: { dark: '#004A70' } }).then(setQr);
  }, [url]);
  const d = today();
  const onSite = visitors.filter((v) => !v.signed_out_at && today(new Date(v.signed_in_at)) === d);
  const earlier = visitors.filter((v) => !onSite.includes(v));

  const print = () => {
    const w = window.open('', '_blank');
    if (!w || !qr) return;
    w.document.write(`<html><head><title>PAWS sign-in</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h1 style="color:#D1007A">Welcome to PAWS</h1><p style="font-size:22px">Scan to sign in</p><img src="${qr}" style="width:70%;max-width:480px"/><p style="font-size:16px;color:#555">${url}</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Page title="Visitors" back="Back">
      <section className="card" style={{ alignItems: 'center', textAlign: 'center' }}>
        <h2 className="h">Gate sign-in QR code</h2>
        {qr && <img src={qr} alt="QR code for visitor sign-in" style={{ width: 220, height: 220 }} />}
        <span className="t13">Visitors scan this with their phone camera. No app or account needed.</span>
        <button className="btn ghost" onClick={print}>Print poster</button>
      </section>

      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>On site now</h2>
        {!onSite.length && <Empty>Nobody signed in.</Empty>}
        {onSite.map((v) => (
          <div key={v.id} className="row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="grow">
              <span className="t15">{v.name}{v.guests ? ` + ${v.guests}` : ''}</span>
              <span className="t13">{v.kind === 'volunteer' ? 'Volunteer' : 'Visitor'} · in {timeOf(v.signed_in_at)}{v.phone ? ` · ${v.phone}` : ''}</span>
            </div>
            <NowOrTime label="Sign out" after={v.signed_in_at} onPick={(at) => { update('visitors', { id: v.id }, { signed_out_at: at }); toast(`${v.name} signed out at ${timeOf(at)}`); }} />
          </div>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>
          <span className="t13" style={{ fontWeight: 600 }}>Sign someone in for them</span>
          <div className="grid2">
            <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Visitor name" />
            <input className="input" type="tel" inputMode="tel" placeholder="Phone · optional" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Visitor phone" />
          </div>
          <select className="input" value={group} onChange={(e) => setGroup(Number(e.target.value))} aria-label="How many of them">
            {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'Just them' : `${n} people`}</option>)}
          </select>
          <NowOrTime label="Sign in" small={false} disabled={!name.trim()} onPick={(at) => {
            insert('visitors', { name: name.trim(), kind: 'visitor', guests: group - 1, phone: phone.trim(), signed_in_at: at });
            toast(`${name.trim()} signed in at ${timeOf(at)}`);
            setName(''); setPhone(''); setGroup(1);
          }} />
        </div>
      </section>

      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Last 7 days</h2>
        {!earlier.length && <Empty>No earlier visitors.</Empty>}
        {earlier.map((v) => (
          <div key={v.id} className="row">
            <div className="grow">
              <span className="t15">{v.name}{v.guests ? ` + ${v.guests}` : ''}</span>
              <span className="t13">{shortDate(today(new Date(v.signed_in_at)))} · {timeOf(v.signed_in_at)}–{v.signed_out_at ? timeOf(v.signed_out_at) : '?'}</span>
            </div>
          </div>
        ))}
      </section>
    </Page>
  );
}
