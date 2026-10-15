import { FormEvent, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { InlineLoadingState } from '../components/AsyncState';
import { getSupabase, supabaseConfigured } from '../lib/supabase';
import { authError, type Mode } from './errors';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
const LegalModal = lazy(() => import('../features/modals/LegalModal').then(module => ({ default: module.LegalModal })));

type SessionState = 'loading' | 'in' | 'out';
type Mailbox = 'confirm' | 'reset' | null;

function errorMessage(error: unknown) {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Something went wrong. Try again.';
}

function Aside({ title }: { title: string }) {
  return (
    <section className="auth-aside">
      <div className="mark-box"><img src="/favicon.svg" alt="" width="32" height="32" /></div>
      <h1>IELTS Fieldbook</h1>
      <p>{title}</p>
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
  const [sessionCheck, setSessionCheck] = useState(0);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);
  const [legalView, setLegalView] = useState<string | null>(null);
  const [sessionOwner, setSessionOwner] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();

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
    void (async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (cancelled) return;
        if (sessionError) throw sessionError;
        setSessionCheckFailed(false);
        setSessionOwner(data.session?.user.id || null);
        setSessionState(data.session ? 'in' : 'out');
      } catch (cause) {
        if (cancelled) return;
        setError(authError(errorMessage(cause), 'signin'));
        setSessionCheckFailed(true);
        setSessionState('out');
      }
    })();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSessionOwner(session?.user.id || null);
      setSessionState(session ? 'in' : 'out');
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [sessionCheck]);

  function clearStatus() {
    setError('');
    setMailbox(null);
    setSent(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabaseConfigured() || busy) return;
    setBusy(true);
    setError('');
    setSessionCheckFailed(false);
    try {
      const supabase = getSupabase();
      const address = email.trim();
      if (mode === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
          redirectTo: window.location.origin,
        });
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
      if (result.error) {
        setError(authError(result.error.message, mode));
        return;
      }
      if (mode === 'signup' && !result.data.session) {
        setSent(false);
        setMailbox('confirm');
      }
    } catch (cause) {
      setError(authError(errorMessage(cause), mode));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!supabaseConfigured() || !email.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { error: resendError } = await getSupabase().auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (resendError) {
        setError(authError(resendError.message, 'signup'));
        return;
      }
      setSent(true);
    } catch (cause) {
      setError(authError(errorMessage(cause), 'signup'));
    } finally {
      setBusy(false);
    }
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
        <Aside title="Loading your account." />
        <section className="auth-card">
          <p className="kicker">Fieldbook</p>
          <h2>Checking your sign-in</h2>
          <InlineLoadingState message="Checking your saved session…" />
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
            try {
              const { error: updateError } = await getSupabase().auth.updateUser({ password: nextPassword });
              if (updateError) {
                setError(authError(updateError.message, 'reset'));
                return;
              }
              setRecovery(false);
              setNextPassword('');
              setConfirmPassword('');
            } catch (cause) {
              setError(authError(errorMessage(cause), 'reset'));
            } finally {
              setBusy(false);
            }
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

  if (sessionState === 'in') return <div key={sessionOwner} style={{ display: 'contents' }}>{children}</div>;

  if (mailbox) {
    const confirming = mailbox === 'confirm';
    return (
      <main className="auth-screen">
        <Aside title={confirming ? 'Confirm your email to activate your account.' : 'Check your email for a password reset link.'} />
        <section className="auth-card">
          <p className="kicker">{confirming ? 'Check email' : 'Reset sent'}</p>
          <h2>{confirming ? 'Confirm your email' : 'Reset your password'}</h2>
          <p className="auth-address">{email.trim()}</p>
          <ol className="auth-steps">
            {confirming ? (
              <>
                <li>Open the confirmation email.</li>
                <li>Click the confirmation link.</li>
                <li>Return to IELTS Fieldbook in the tab that opens.</li>
              </>
            ) : (
              <>
                <li>Open the password reset email.</li>
                <li>Click the reset link. It returns to this site.</li>
                <li>Enter a new password on the page that opens.</li>
              </>
            )}
          </ol>
          {error ? <p className="auth-error">{error}</p> : null}
          {confirming ? (
            sent ? (
              <p>Confirmation email sent.</p>
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
      <Aside title={mode === 'signup' ? 'Create an account to save your IELTS practice.' : mode === 'reset' ? 'Reset the password for your account.' : 'Sign in to continue your IELTS practice.'} />
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="kicker">{kicker}</p>
        <h2>{heading}</h2>
        {mode === 'signup' ? <p>You will need to confirm your email before signing in.</p> : null}
        {mode === 'reset' ? <p>Enter your account email to request a password reset link.</p> : null}
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
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {sessionCheckFailed ? <button className="btn line" type="button" onClick={() => { setError(''); setSessionState('loading'); setSessionCheck((value) => value + 1); }}>Retry connection</button> : null}
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
      <footer className="auth-footer"><button type="button" onClick={() => setLegalView('privacy')}>Privacy & terms</button><button type="button" onClick={() => setLegalView('feedback')}>Feedback</button><button type="button" aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button></footer>
      {legalView ? <Suspense fallback={null}><LegalModal view={legalView} onClose={() => setLegalView(null)} /></Suspense> : null}
    </main>
  );
}

export async function signOut() {
  if (!supabaseConfigured()) return;
  const [{ accountId, resetAccountStore }, { discardDraftRecovery }, { clearVocabularyDraft }, { clearAccountExamRecovery }, { clearPendingAudioAccount }] = await Promise.all([
    import('../storage/remote'), import('../storage/recovery'), import('../storage/vocabularyDrafts'), import('../storage/examRecovery'), import('../storage/pendingAudio'),
  ]);
  const owner=accountId();
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
  discardDraftRecovery(owner);
  clearVocabularyDraft(owner);
  clearAccountExamRecovery(owner);
  await clearPendingAudioAccount(owner);
  resetAccountStore();
}
