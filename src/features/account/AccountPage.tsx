import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from '../../auth/AuthGate';
import { emailsMatch } from '../../auth/email';
import { authError } from '../../auth/errors';
import { useAuthUser } from '../../auth/useAuthUser';
import { displayNameOf } from '../../lib/identity';
import { formatAccountDate } from '../../lib/format';
import { requestTimeout } from '../../lib/requestTimeout';
import { getSupabase } from '../../lib/supabase';
import { clearAccountLocalState } from '../../storage/accountCleanup';
import { AccountMark } from './AccountMark';

export function AccountPage() {
  const navigate = useNavigate();
  const user = useAuthUser();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nameNote, setNameNote] = useState('');
  const [passwordNote, setPasswordNote] = useState('');
  const [nameError, setNameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [resendError, setResendError] = useState('');
  const [sent, setSent] = useState(false);
  const [nextEmail, setNextEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [busy, setBusy] = useState<'name' | 'password' | 'out' | 'resend' | 'email' | 'delete' | null>(null);
  const actionBusy = Boolean(busy);
  const confirmed = Boolean(user?.email_confirmed_at);
  const deleteReady = emailsMatch(deleteEmail, user?.email);
  const pendingVisible = Boolean(pendingEmail) && !emailsMatch(user?.email, pendingEmail);

  const storedName = displayNameOf(user);

  useEffect(() => {
    setName(storedName);
  }, [storedName]);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next = name.trim();
    if (!next) {
      setNameError('Enter a name.');
      return;
    }
    setBusy('name');
    setNameError('');
    setNameNote('');
    try {
      const { error } = await requestTimeout(getSupabase().auth.updateUser({ data: { display_name: next } }), 15_000);
      if (error) {
        setNameError(error.message);
        return;
      }
      setNameNote('Name saved.');
    } catch (cause) {
      setNameError(cause instanceof Error && cause.message ? authError(cause.message, 'signin') : 'Could not save your name. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 6) {
      setPasswordError('Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setPasswordError('The two passwords do not match.');
      return;
    }
    setBusy('password');
    setPasswordError('');
    setPasswordNote('');
    try {
      const { error } = await requestTimeout(getSupabase().auth.updateUser({ password }), 15_000);
      if (error) {
        setPasswordError(error.message);
        return;
      }
      setPassword('');
      setConfirm('');
      setPasswordNote('Password updated.');
    } catch (cause) {
      setPasswordError(cause instanceof Error && cause.message ? authError(cause.message, 'reset') : 'Could not update your password. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function resendConfirmation() {
    if (busy) return;
    const address = user?.email?.trim();
    if (!address || confirmed) return;
    setBusy('resend');
    setResendError('');
    try {
      const { error } = await requestTimeout(
        getSupabase().auth.resend({
          type: 'signup',
          email: address,
          options: { emailRedirectTo: window.location.origin },
        }),
        15_000,
      );
      if (error) {
        setResendError(authError(error.message, 'signup'));
        return;
      }
      setSent(true);
    } catch (cause) {
      setResendError(authError(cause instanceof Error ? cause.message : '', 'signup'));
    } finally {
      setBusy(null);
    }
  }

  async function saveEmail(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next = nextEmail.trim();
    if (!next) {
      setEmailError('Enter an email.');
      return;
    }
    if (emailsMatch(next, user?.email)) {
      setEmailError('');
      setPendingEmail('');
      return;
    }
    setBusy('email');
    setEmailError('');
    try {
      const { error } = await requestTimeout(
        getSupabase().auth.updateUser(
          { email: next },
          { emailRedirectTo: window.location.origin },
        ),
        15_000,
      );
      if (error) {
        setEmailError(authError(error.message, 'signup'));
        return;
      }
      setPendingEmail(next);
    } catch (cause) {
      setEmailError(authError(cause instanceof Error ? cause.message : '', 'signup'));
    } finally {
      setBusy(null);
    }
  }

  async function removeAccount(event: FormEvent) {
    event.preventDefault();
    if (!deleteReady || busy) return;
    setBusy('delete');
    setDeleteError('');
    try {
      const { error } = await requestTimeout(Promise.resolve(getSupabase().rpc('delete_own_account')), 15_000);
      if (error) {
        setDeleteError('Could not delete this account. Try again.');
        return;
      }
      const owner = user?.id || null;
      try {
        await signOut(owner);
      } catch {
        // The account is already deleted remotely; clear local Supabase session and device artifacts so AuthGate returns to sign-in.
        await requestTimeout(Promise.resolve(getSupabase().auth.signOut({ scope: 'local' })), 5_000).catch(() => {});
        await clearAccountLocalState(owner);
      }
      navigate('/');
    } catch {
      setDeleteError('Could not delete this account. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function leave() {
    if (busy) return;
    setBusy('out');
    setSignOutError('');
    try { await signOut(user?.id || null); navigate('/'); } catch { setSignOutError('Could not sign out. Try again.'); setBusy(null); }
  }

  return (
    <div className="account">
      <div className="account-id">
        <AccountMark user={user} />
        <h4>{displayNameOf(user)}</h4>
      </div>

      <div className="metrics">
        <div className="metric">
          <span className="metric-label">Email</span>
          <strong>{user?.email || '—'}</strong>
          <span className={confirmed ? 'account-email-status is-confirmed' : 'account-email-status is-pending'}>
            <span>{confirmed ? 'Confirmed' : 'Not confirmed'}</span>
            {!confirmed && user?.email ? (
              sent ? (
                ' · Confirmation sent.'
              ) : (
                <button
                  className="account-resend"
                  type="button"
                  onClick={() => void resendConfirmation()}
                  disabled={actionBusy}
                >
                  {busy === 'resend' ? 'Sending…' : 'Resend'}
                </button>
              )
            ) : null}
          </span>
          {resendError ? <p className="auth-error" role="alert">{resendError}</p> : null}
        </div>
        <div className="metric">
          <span className="metric-label">Joined</span>
          <strong>{formatAccountDate(user?.created_at)}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Last sign-in</span>
          <strong>{formatAccountDate(user?.last_sign_in_at)}</strong>
        </div>
      </div>

      <div className="split">
        <form className="panel" aria-labelledby="account-name-heading" aria-busy={busy === 'name' || undefined} onSubmit={saveName}>
          <h4 id="account-name-heading">Name</h4>
          <p className="account-note">Your display name does not change your sign-in email.</p>
          <div className="field">
            <label htmlFor="account-name">Display name</label>
            <input id="account-name" autoComplete="name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          </div>
          {nameError ? <p className="auth-error" role="alert">{nameError}</p> : null}
          {nameNote ? <p className="auth-notice" role="status">{nameNote}</p> : null}
          <div className="modal-foot">
            <button className="btn primary" type="submit" disabled={actionBusy}>
              {busy === 'name' ? 'Saving…' : 'Save name'}
            </button>
          </div>
        </form>

        <form className="panel" aria-labelledby="account-password-heading" aria-busy={busy === 'password' || undefined} onSubmit={savePassword}>
          <h4 id="account-password-heading">Password</h4>
          <p className="account-note">You stay signed in on this browser.</p>
          <div className="field">
            <label htmlFor="account-password">New password</label>
            <input
              id="account-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="account-confirm">Confirm password</label>
            <input
              id="account-confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={6}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          <button className="btn text account-password-toggle" type="button" aria-pressed={showPassword} onClick={() => setShowPassword(current => !current)}>
            {showPassword ? 'Hide password' : 'Show password'}
          </button>
          {passwordError ? <p className="auth-error" role="alert">{passwordError}</p> : null}
          {passwordNote ? <p className="auth-notice" role="status">{passwordNote}</p> : null}
          <div className="modal-foot">
            <button className="btn primary" type="submit" disabled={actionBusy}>
              {busy === 'password' ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>

      <form className="panel" aria-labelledby="account-email-heading" aria-busy={busy === 'email' || undefined} onSubmit={saveEmail}>
        <h4 id="account-email-heading">Email address</h4>
        <p className="account-note">Continue using your current email until you confirm the new address.</p>
        <div className="field">
          <label htmlFor="account-email">New email</label>
          <input id="account-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={nextEmail} onChange={(event) => setNextEmail(event.target.value)} />
        </div>
        {emailError ? <p className="auth-error" role="alert">{emailError}</p> : null}
        {pendingVisible ? <p className="auth-notice" role="status">Confirmation sent. {pendingEmail}</p> : null}
        <div className="modal-foot">
          <button className="btn primary" type="submit" disabled={actionBusy}>
            {busy === 'email' ? 'Saving…' : 'Save email'}
          </button>
        </div>
      </form>

      <form className="panel account-danger" aria-labelledby="account-delete-heading" aria-busy={busy === 'delete' || undefined} onSubmit={removeAccount}>
        <h4 id="account-delete-heading">Delete account</h4>
        <p className="account-note">Permanently delete your account and all saved study data. You can register again with this email.</p>
        <div className="field">
          <label htmlFor="account-delete-email">Type your email</label>
          <input
            id="account-delete-email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={deleteEmail.trim() && !deleteReady ? 'account-delete-hint' : undefined}
            value={deleteEmail}
            onChange={(event) => setDeleteEmail(event.target.value)}
          />
        </div>
        {deleteEmail.trim() && !deleteReady ? <p id="account-delete-hint" className="account-delete-hint">Type the email shown above.</p> : null}
        {deleteError ? <p className="auth-error" role="alert">{deleteError}</p> : null}
        <div className="modal-foot">
          <button className="btn warn" type="submit" disabled={!deleteReady || actionBusy}>
            {busy === 'delete' ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </form>

      <section className="panel account-leave" aria-busy={busy === 'out' || undefined}>
        <div>
          <h4>Sign out</h4>
          <p className="account-note">Your saved study data will remain in your account.</p>
          {signOutError ? <p className="auth-error" role="alert">{signOutError}</p> : null}
        </div>
        <button className="btn warn" type="button" onClick={() => void leave()} disabled={actionBusy}>
          {busy === 'out' ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </div>
  );
}
