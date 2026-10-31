import { useState } from 'react';
import { Stripe } from '../components/ui';
import { supabase } from '../lib/supabase';

/** Public page behind the gate QR code. No account needed. */
export default function VisitSignIn() {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'visitor' | 'volunteer'>('visitor');
  const [guests, setGuests] = useState(0);
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<'form' | 'busy' | 'done' | 'error'>('form');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    const { error } = await supabase.from('visitors').insert({ name: name.trim(), kind, guests, phone: phone.trim() });
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
            <div className="grid2">
              <button type="button" className="seg" aria-pressed={kind === 'visitor'} onClick={() => setKind('visitor')}>Visitor</button>
              <button type="button" className="seg" aria-pressed={kind === 'volunteer'} onClick={() => setKind('volunteer')}>Volunteer</button>
            </div>
            <label className="field">
              <span>People with you</span>
              <select value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
                {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i === 0 ? 'Just me' : `+ ${i}`}</option>)}
              </select>
            </label>
            <label className="field"><span>Phone · optional</span><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></label>
            {state === 'error' && <p className="bad">Couldn't sign in — please check your signal and try again, or ask a member of staff.</p>}
            <button className="btn full" disabled={state === 'busy' || !name.trim()}>{state === 'busy' ? 'Signing in…' : 'Sign in'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
