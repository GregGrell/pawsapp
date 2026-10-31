import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { boot, clearLocal } from './lib/store';
import { Stripe } from './components/ui';

type Profile = { id: string; full_name: string; email: string; role: 'staff' | 'management' | 'volunteer'; active: boolean };
type Ctx = { session: Session; me: Profile; isMgmt: boolean; signOut: () => Promise<void> };
const AuthCtx = createContext<Ctx | null>(null);
export const useAuth = () => useContext(AuthCtx)!;

const PROFILE_KEY = 'paws-me';

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Profile | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [booted, setBooted] = useState(false);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setMe(data as Profile);
          localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
        }
      });
  }, [session]);

  useEffect(() => {
    if (session && me?.active && me.id === session.user.id && !booted) {
      setBooted(true);
      boot(me.id, me.role === 'management');
    }
  }, [session, me, booted]);

  if (session === undefined) return <Splash />;
  if (!session) return <Login />;
  if (recovery) return <SetPassword onDone={() => setRecovery(false)} />;
  if (!me || me.id !== session.user.id) return <Splash />;
  if (!me.active) return <Pending onRefresh={() => location.reload()} />;

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(PROFILE_KEY);
    await clearLocal();
    location.hash = '#/';
    location.reload();
  };
  return <AuthCtx.Provider value={{ session, me, isMgmt: me.role === 'management', signOut }}>{children}</AuthCtx.Provider>;
}

function Splash() {
  return (
    <div className="center">
      <img src="./heart.png" alt="PAWS Rescue Qatar" width={72} />
      <span className="sub">Loading…</span>
    </div>
  );
}

function Pending({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="center">
      <img src="./logo.png" alt="PAWS Rescue Qatar" width={120} />
      <h1 className="title" style={{ fontSize: 22 }}>Waiting for approval</h1>
      <p className="sub" style={{ maxWidth: 320 }}>Your account is set up. A member of the management team needs to approve it in PAWSapp before you can start.</p>
      <div className="btns" style={{ width: '100%', maxWidth: 320 }}>
        <button className="btn" onClick={onRefresh}>Check again</button>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  );
}

function Login() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const redirect = location.origin + location.pathname;
    let error: any = null;
    if (mode === 'in') ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    else if (mode === 'up') {
      const r = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: redirect } });
      error = r.error;
      if (!error && !r.data.session) setMsg('Check your email and tap the link to confirm your account, then sign in here.');
    } else {
      ({ error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect }));
      if (!error) setMsg('If that email has an account, a reset link is on its way.');
    }
    if (error) setMsg(error.message);
    setBusy(false);
  };

  return (
    <div className="app">
      <Stripe />
      <div className="center">
        <img src="./logo.png" alt="PAWS Rescue Qatar" width={130} />
        <form className="login" onSubmit={go}>
          <h1 className="title" style={{ fontSize: 24, textAlign: 'center' }}>
            {mode === 'in' ? 'Sign in to PAWSapp' : mode === 'up' ? 'Create your account' : 'Reset password'}
          </h1>
          {mode === 'up' && (
            <label className="field"><span>Your name</span><input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          )}
          <label className="field"><span>Email</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          {mode !== 'reset' && (
            <label className="field"><span>Password</span><input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>
          )}
          {msg && <p className="t14" role="alert">{msg}</p>}
          <button className="btn full" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}</button>
          <div className="btns">
            {mode !== 'in' && <button type="button" className="btn link" onClick={() => setMode('in')}>Back to sign in</button>}
            {mode === 'in' && <button type="button" className="btn link" onClick={() => setMode('up')}>New here? Create account</button>}
            {mode === 'in' && <button type="button" className="btn link" onClick={() => setMode('reset')}>Forgot password</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

function SetPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="center">
      <form
        className="login"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await supabase.auth.updateUser({ password: pw });
          if (error) setMsg(error.message);
          else onDone();
        }}
      >
        <h1 className="title" style={{ fontSize: 24 }}>Choose a new password</h1>
        <label className="field"><span>New password</span><input type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
        {msg && <p className="t14" role="alert">{msg}</p>}
        <button className="btn full">Save password</button>
      </form>
    </div>
  );
}
