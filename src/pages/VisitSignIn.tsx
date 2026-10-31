import { useState } from 'react';
import { Stripe } from '../components/ui';
import { supabase } from '../lib/supabase';

/** Public page behind the gate QR code. No account needed. */
export default function VisitSignIn() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [group, setGroup] = useState(1);
  const [state, setState] = useState<'form' | 'busy' | 'done' | 'error'>('form');

  const phoneDigits = phone.replace(/\D/g, '').length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    const { error } = await supabase.from('visitors').insert({ name: name.trim(), kind: 'visitor', guests: group - 1, phone: phone.trim() });
    setState(error ? 'error' : 'done');
  };

  return (
    <div className="app">
      <Stripe />
      <div className="center" style={{ justifyContent: 'flex-start', paddingTop: 40 }}>
        <img src="./logo.png" alt="PAWS Rescue Qatar" width={120} />
        {state === 'done' ? (
          <>
            <h1 className="title" style={{ fontSize: 24 }}>Thanks, {name.split(' ')[0]}!</h1>
            <p className="sub">You're signed in. Please find a member of the PAWS team before you leave so they can sign you out.</p>
          </>
        ) : (
          <form className="login" onSubmit={submit}>
            <h1 className="title" style={{ fontSize: 24, textAlign: 'center' }}>Welcome to PAWS</h1>
            <p className="sub" style={{ textAlign: 'center' }}>Please sign in so we know who's on site.</p>
            <label className="field"><span>Your name</span><input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
            <label className="field"><span>Phone number</span><input required type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="e.g. 5512 3456" /></label>
            <label className="field">
              <span>How many of you?</span>
              <select value={group} onChange={(e) => setGroup(Number(e.target.value))}>
                {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'Just me' : `${n} people`}</option>)}
              </select>
            </label>
            {state === 'error' && <p className="bad">Couldn't sign in — please check your signal and try again, or ask a member of staff.</p>}
            <button className="btn full" disabled={state === 'busy' || !name.trim() || phoneDigits < 8}>{state === 'busy' ? 'Signing in…' : 'Sign in'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
