import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from '../../auth/AuthGate';
import { emailsMatch } from '../../auth/email';
import { authError } from '../../auth/errors';
import { useAuthUser } from '../../auth/useAuthUser';
import { displayNameOf } from '../../lib/identity';
import { formatAccountDate } from '../../lib/format';
import { getSupabase } from '../../lib/supabase';
import { AccountMark } from './AccountMark';

export function AccountPage() {
  const navigate = useNavigate();
  const user = useAuthUser();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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
  const [busy, setBusy] = useState<'name' | 'password' | 'out' | 'resend' | 'email' | 'delete' | null>(null);
  const confirmed = Boolean(user?.email_confirmed_at);
  const deleteReady = emailsMatch(deleteEmail, user?.email);
  const pendingVisible = Boolean(pendingEmail) && !emailsMatch(user?.email, pendingEmail);

  const storedName = displayNameOf(user);

  useEffect(() => {
    setName(storedName);
  }, [storedName]);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (!next) {
      setNameError('Enter a name.');
      return;
    }
    setBusy('name');
    setNameError('');
    setNameNote('');
    const { error } = await getSupabase().auth.updateUser({ data: { display_name: next } });
    setBusy(null);
    if (error) {
      setNameError(error.message);
      return;
    }
    setNameNote('Name saved.');
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
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
    const { error } = await getSupabase().auth.updateUser({ password });
    setBusy(null);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setPassword('');
    setConfirm('');
    setPasswordNote('Password updated.');
  }

  async function resendConfirmation() {
    const address = user?.email?.trim();
    if (!address || confirmed) return;
    setBusy('resend');
    setResendError('');
    const { error } = await getSupabase().auth.resend({
      type: 'signup',
      email: address,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(null);
    if (error) {
      setResendError(authError(error.message, 'signup'));
      return;
    }
    setSent(true);
  }

  async function saveEmail(event: FormEvent) {
    event.preventDefault();
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
    const { error } = await getSupabase().auth.updateUser(
      { email: next },
      { emailRedirectTo: window.location.origin },
    );
    setBusy(null);
    if (error) {
      setEmailError(authError(error.message, 'signup'));
      return;
    }
    setPendingEmail(next);
  }

  async function removeAccount() {
    if (!deleteReady) return;
    setBusy('delete');
    setDeleteError('');
    const { error } = await getSupabase().rpc('delete_own_account');
    if (error) {
      setBusy(null);
      setDeleteError('Could not delete this account. Try again.');
      return;
    }
    await signOut();
    navigate('/');
  }

  async function leave() {
    setBusy('out');
    await signOut();
    navigate('/');
  }

  return (
    <div className="account">
      <div className="account-id">
        <AccountMark user={user} />
        <h2>{displayNameOf(user)}</h2>
      </div>

      <div className="metrics">
        <div className="metric">
          <label>Email</label>
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
                  disabled={busy === 'resend'}
                >
                  Resend
                </button>
              )
            ) : null}
          </span>
          {resendError ? <p className="auth-error">{resendError}</p> : null}
        </div>
        <div className="metric">
          <label>Joined</label>
          <strong>{formatAccountDate(user?.created_at)}</strong>
        </div>
        <div className="metric">
          <label>Last sign-in</label>
          <strong>{formatAccountDate(user?.last_sign_in_at)}</strong>
        </div>
      </div>

      <div className="split">
        <form className="panel" onSubmit={saveName}>
          <h3>Name</h3>
          <p className="account-note">Shown beside your study record. The sign-in address stays the email above.</p>
          <div className="field">
            <label htmlFor="account-name">Display name</label>
            <input id="account-name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          </div>
          {nameError ? <p className="auth-error">{nameError}</p> : null}
          {nameNote ? <p className="auth-notice">{nameNote}</p> : null}
          <div className="modal-foot">
            <button className="btn primary" type="submit" disabled={busy === 'name'}>
              Save name
            </button>
          </div>
        </form>

        <form className="panel" onSubmit={savePassword}>
          <h3>Password</h3>
          <p className="account-note">You stay signed in on this browser.</p>
          <div className="field">
            <label htmlFor="account-password">New password</label>
            <input
              id="account-password"
              type="password"
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
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          {passwordError ? <p className="auth-error">{passwordError}</p> : null}
          {passwordNote ? <p className="auth-notice">{passwordNote}</p> : null}
          <div className="modal-foot">
            <button className="btn primary" type="submit" disabled={busy === 'password'}>
              Update password
            </button>
          </div>
        </form>
      </div>

      <form className="panel" onSubmit={saveEmail}>
        <h3>Email address</h3>
        <p className="account-note">The address above keeps working until the new one is confirmed.</p>
        <div className="field">
          <label htmlFor="account-email">New email</label>
          <input id="account-email" type="email" value={nextEmail} onChange={(event) => setNextEmail(event.target.value)} />
        </div>
        {emailError ? <p className="auth-error">{emailError}</p> : null}
        {pendingVisible ? <p className="auth-notice">Confirmation sent. {pendingEmail}</p> : null}
        <div className="modal-foot">
          <button className="btn primary" type="submit" disabled={busy === 'email'}>
            Save email
          </button>
        </div>
      </form>

      <div className="panel">
        <h3>Delete account</h3>
        <p className="account-note">Essays, recordings, and the login are removed. This email can be used to register again.</p>
        <div className="field">
          <label htmlFor="account-delete-email">Type your email</label>
          <input
            id="account-delete-email"
            type="email"
            value={deleteEmail}
            onChange={(event) => setDeleteEmail(event.target.value)}
          />
        </div>
        {deleteEmail.trim() && !deleteReady ? <p className="auth-error">Type the email shown above.</p> : null}
        {deleteError ? <p className="auth-error">{deleteError}</p> : null}
        <div className="modal-foot">
          <button className="btn warn" type="button" onClick={() => void removeAccount()} disabled={!deleteReady || busy === 'delete'}>
            Delete account
          </button>
        </div>
      </div>

      <div className="panel account-leave">
        <div>
          <h3>Sign out</h3>
          <p className="account-note">Essays and recordings stay on this account.</p>
        </div>
        <button className="btn warn" type="button" onClick={() => void leave()} disabled={busy === 'out'}>
          Sign out
        </button>
      </div>
    </div>
  );
}
