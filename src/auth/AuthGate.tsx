import { FormEvent, useEffect, useState, type ReactNode } from 'react';
import { getSupabase, supabaseConfigured } from '../lib/supabase';

type SessionState = 'loading' | 'in' | 'out';

export function AuthGate({ children }: { children: ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>(supabaseConfigured() ? 'loading' : 'out');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured()) return undefined;
    const supabase = getSupabase();
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSessionState(data.session ? 'in' : 'out');
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionState(session ? 'in' : 'out');
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabaseConfigured()) return;
    setBusy(true);
    setError('');
    setNotice('');
    const supabase = getSupabase();
    const credentials = { email: email.trim(), password };
    const result =
      mode === 'signup' ? await supabase.auth.signUp(credentials) : await supabase.auth.signInWithPassword(credentials);
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (mode === 'signup' && !result.data.session) {
      setNotice('Check your email to confirm the account, then sign in.');
    }
  }

  if (!supabaseConfigured()) {
    return (
      <main className="auth-screen">
        <form className="auth-card">
          <p className="kicker">Fieldbook</p>
          <h1>Add your Supabase keys</h1>
          <p>Copy .env.example to .env and set the project URL and anon key, then restart the dev server.</p>
        </form>
      </main>
    );
  }

  if (sessionState === 'loading') {
    return (
      <main className="auth-screen">
        <p className="kicker">Fieldbook</p>
      </main>
    );
  }

  if (sessionState === 'in') return children;

  return (
    <main className="auth-screen">
      <section className="auth-aside">
        <div className="mark-box">F</div>
        <p className="kicker">Fieldbook</p>
        <h1>One account for the essays, the recordings, and the plan.</h1>
      </section>
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="kicker">{mode === 'signup' ? 'New account' : 'Welcome back'}</p>
        <h2>{mode === 'signup' ? 'Create an account' : 'Sign in'}</h2>
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" type="email" autoComplete="email" value={email} required onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          minLength={6}
          value={password}
          required
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-notice">{notice}</p> : null}
        <button className="btn primary" type="submit" disabled={busy}>
          {mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        <button
          className="btn text"
          type="button"
          onClick={() => {
            setMode((current) => (current === 'signup' ? 'signin' : 'signup'));
            setError('');
            setNotice('');
          }}
        >
          {mode === 'signup' ? 'I already have an account' : 'Create an account'}
        </button>
      </form>
    </main>
  );
}

export async function signOut() {
  if (!supabaseConfigured()) return;
  await getSupabase().auth.signOut();
}
