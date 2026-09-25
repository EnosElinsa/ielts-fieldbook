import { FormEvent, useEffect, useState, type ReactNode } from 'react';
import { getSupabase, supabaseConfigured } from '../lib/supabase';

type SessionState = 'loading' | 'in' | 'out';

export function AuthGate({ children }: { children: ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>(supabaseConfigured() ? 'loading' : 'out');
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured()) return undefined;
    const supabase = getSupabase();
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSessionState(data.session ? 'in' : 'out');
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
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
    if (mode === 'reset') {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      setBusy(false);
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setNotice('Check your email for a link to choose a new password.');
      return;
    }
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

  if (sessionState === 'in' && recovery) {
    return (
      <main className="auth-screen">
        <section className="auth-aside">
          <div className="mark-box">F</div>
          <p className="kicker">Fieldbook</p>
          <h1>Choose a new password for this account.</h1>
        </section>
        <form
          className="auth-card"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError('');
            const { error: updateError } = await getSupabase().auth.updateUser({ password: nextPassword });
            setBusy(false);
            if (updateError) {
              setError(updateError.message);
              return;
            }
            setRecovery(false);
            setNextPassword('');
          }}
        >
          <p className="kicker">Password reset</p>
          <h2>New password</h2>
          <label htmlFor="auth-next-password">New password</label>
          <input
            id="auth-next-password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={nextPassword}
            required
            onChange={(event) => setNextPassword(event.target.value)}
          />
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="btn primary" type="submit" disabled={busy}>
            Save password
          </button>
        </form>
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
        <h2>{mode === 'signup' ? 'Create an account' : mode === 'reset' ? 'Reset password' : 'Sign in'}</h2>
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" type="email" autoComplete="email" value={email} required onChange={(event) => setEmail(event.target.value)} />
        {mode === 'reset' ? null : (
          <>
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
          </>
        )}
        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-notice">{notice}</p> : null}
        <button className="btn primary" type="submit" disabled={busy}>
          {mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
        </button>
        {mode === 'signin' ? (
          <button
            className="btn text"
            type="button"
            onClick={() => {
              setMode('reset');
              setError('');
              setNotice('');
            }}
          >
            Forgot password
          </button>
        ) : null}
        <button
          className="btn text"
          type="button"
          onClick={() => {
            setMode((current) => (current === 'signin' ? 'signup' : 'signin'));
            setError('');
            setNotice('');
          }}
        >
          {mode === 'signup' ? 'I already have an account' : mode === 'reset' ? 'Back to sign in' : 'Create an account'}
        </button>
      </form>
    </main>
  );
}

export async function signOut() {
  if (!supabaseConfigured()) return;
  await getSupabase().auth.signOut();
}
