import { FormEvent, useEffect, useState, type ReactNode } from 'react';
import { getSupabase, supabaseConfigured } from '../lib/supabase';
import { authError, type Mode } from './errors';

type SessionState = 'loading' | 'in' | 'out';
type Mailbox = 'confirm' | 'reset' | null;

function Aside({ title }: { title: string }) {
  return (
    <section className="auth-aside">
      <div className="mark-box">F</div>
      <p className="kicker">Fieldbook</p>
      <h1>{title}</h1>
    </section>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>(supabaseConfigured() ? 'loading' : 'out');
  const [mode, setMode] = useState<Mode>('signin');
  const [mailbox, setMailbox] = useState<Mailbox>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured()) return undefined;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashError = [hash.get('error_description'), hash.get('error_code')].filter(Boolean).join(' ');
    const hashType = hash.get('type');
    if (hashError) {
      const linkMode = hashType === 'signup' ? 'signup' : hashType === 'recovery' ? 'reset' : 'signin';
      setError(authError(hashError.replace(/\+/g, ' '), linkMode));
      if (linkMode === 'reset') setMode('reset');
    }
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

  function clearStatus() {
    setError('');
    setMailbox(null);
    setSent(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabaseConfigured()) return;
    setBusy(true);
    setError('');
    const supabase = getSupabase();
    const address = email.trim();
    if (mode === 'reset') {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: window.location.origin,
      });
      setBusy(false);
      if (resetError) {
        setError(authError(resetError.message, mode));
        return;
      }
      setSent(false);
      setMailbox('reset');
      return;
    }
    const result =
      mode === 'signup'
        ? await supabase.auth.signUp({
            email: address,
            password,
            options: { emailRedirectTo: window.location.origin },
          })
        : await supabase.auth.signInWithPassword({ email: address, password });
    setBusy(false);
    if (result.error) {
      setError(authError(result.error.message, mode));
      return;
    }
    if (mode === 'signup' && !result.data.session) {
      setSent(false);
      setMailbox('confirm');
    }
  }

  async function resend() {
    if (!supabaseConfigured() || !email.trim()) return;
    setBusy(true);
    setError('');
    const { error: resendError } = await getSupabase().auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (resendError) {
      setError(authError(resendError.message, 'signup'));
      return;
    }
    setSent(true);
  }

  if (!supabaseConfigured()) {
    return (
      <main className="auth-screen">
        <Aside title="Add the project URL and anon key, then restart." />
        <form className="auth-card">
          <p className="kicker">Setup</p>
          <h2>Supabase is not configured</h2>
          <p>Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>
        </form>
      </main>
    );
  }

  if (sessionState === 'loading') {
    return (
      <main className="auth-screen">
        <Aside title="Opening your notebook." />
        <section className="auth-card">
          <p className="kicker">Fieldbook</p>
          <h2>Checking this browser</h2>
          <p>Looking for a saved sign-in.</p>
        </section>
      </main>
    );
  }

  if (sessionState === 'in' && recovery) {
    return (
      <main className="auth-screen">
        <Aside title="Choose a new password for this account." />
        <form
          className="auth-card"
          onSubmit={async (event) => {
            event.preventDefault();
            if (nextPassword.length < 6) {
              setError('Use at least 6 characters.');
              return;
            }
            if (nextPassword !== confirmPassword) {
              setError('The two passwords do not match.');
              return;
            }
            setBusy(true);
            setError('');
            const { error: updateError } = await getSupabase().auth.updateUser({ password: nextPassword });
            setBusy(false);
            if (updateError) {
              setError(authError(updateError.message, 'reset'));
              return;
            }
            setRecovery(false);
            setNextPassword('');
            setConfirmPassword('');
          }}
        >
          <p className="kicker">Password reset</p>
          <h2>New password</h2>
          <p>This replaces the old password. You stay signed in on this browser.</p>
          <label htmlFor="auth-next-password">New password</label>
          <input
            id="auth-next-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={6}
            value={nextPassword}
            required
            onChange={(event) => setNextPassword(event.target.value)}
          />
          <label htmlFor="auth-confirm-password">Confirm password</label>
          <input
            id="auth-confirm-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={6}
            value={confirmPassword}
            required
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <button className="btn text" type="button" onClick={() => setShowPassword((current) => !current)}>
            {showPassword ? 'Hide password' : 'Show password'}
          </button>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>
      </main>
    );
  }

  if (sessionState === 'in') return children;

  if (mailbox) {
    const confirming = mailbox === 'confirm';
    return (
      <main className="auth-screen">
        <Aside title={confirming ? 'Confirm the email, then the notebook opens.' : 'The reset link is in your inbox.'} />
        <section className="auth-card">
          <p className="kicker">{confirming ? 'Check email' : 'Reset sent'}</p>
          <h2>{confirming ? 'Confirm this address' : 'Choose a new password'}</h2>
          <p className="auth-address">{email.trim()}</p>
          <ol className="auth-steps">
            {confirming ? (
              <>
                <li>Open the message from Supabase.</li>
                <li>Click the confirmation link.</li>
                <li>The notebook opens in that tab.</li>
              </>
            ) : (
              <>
                <li>Open the message from Supabase.</li>
                <li>Click the reset link. It returns to this site.</li>
                <li>Enter a new password on the page that opens.</li>
              </>
            )}
          </ol>
          {error ? <p className="auth-error">{error}</p> : null}
          {confirming ? (
            sent ? (
              <p>Confirmation sent.</p>
            ) : (
              <button className="btn line" type="button" onClick={() => void resend()} disabled={busy}>
                {busy ? 'Sending…' : 'Resend confirmation'}
              </button>
            )
          ) : null}
          <button
            className="btn text"
            type="button"
            onClick={() => {
              setMode(confirming ? 'signup' : 'reset');
              clearStatus();
            }}
          >
            Use a different email
          </button>
        </section>
      </main>
    );
  }

  const heading = mode === 'signup' ? 'Create an account' : mode === 'reset' ? 'Reset password' : 'Sign in';
  const kicker = mode === 'signup' ? 'New account' : mode === 'reset' ? 'Password' : 'Welcome back';

  return (
    <main className="auth-screen">
      <Aside title="One account for the essays, the recordings, and the plan." />
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="kicker">{kicker}</p>
        <h2>{heading}</h2>
        {mode === 'signup' ? <p>Use an inbox you can open. We send one confirmation message before the first sign-in.</p> : null}
        {mode === 'reset' ? <p>We email a link that brings you back to this site to choose a new password.</p> : null}
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" type="email" autoComplete="email" value={email} required onChange={(event) => setEmail(event.target.value)} />
        {mode === 'reset' ? null : (
          <>
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={6}
              value={password}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
            <button className="btn text" type="button" onClick={() => setShowPassword((current) => !current)}>
              {showPassword ? 'Hide password' : 'Show password'}
            </button>
            {mode === 'signup' ? <p className="auth-hint">At least 6 characters. You can change it later from Account.</p> : null}
          </>
        )}
        {error ? <p className="auth-error">{error}</p> : null}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
        </button>
        {mode === 'signin' ? (
          <button
            className="btn text"
            type="button"
            onClick={() => {
              setMode('reset');
              clearStatus();
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
            clearStatus();
            setPassword('');
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
