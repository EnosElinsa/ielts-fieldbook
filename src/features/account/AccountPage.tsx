import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { signOut } from '../../auth/AuthGate';
import { getSupabase } from '../../lib/supabase';

function displayNameOf(user: User | null) {
  const stored = user?.user_metadata?.display_name;
  if (typeof stored === 'string' && stored.trim()) return stored.trim();
  const email = user?.email || '';
  return email.split('@')[0] || 'Account';
}

function formatJoined(value: string | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AccountPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [nameNote, setNameNote] = useState('');
  const [passwordNote, setPasswordNote] = useState('');
  const [nameError, setNameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [busy, setBusy] = useState<'name' | 'password' | 'out' | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        setUser(data.user);
        setName(displayNameOf(data.user));
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    const { data, error } = await getSupabase().auth.updateUser({ data: { display_name: next } });
    setBusy(null);
    if (error) {
      setNameError(error.message);
      return;
    }
    setUser(data.user);
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

  async function leave() {
    setBusy('out');
    await signOut();
    navigate('/');
  }

  return (
    <div className="account">
      <div className="metrics">
        <div className="metric">
          <label>Email</label>
          <strong>{user?.email || '—'}</strong>
        </div>
        <div className="metric">
          <label>Joined</label>
          <strong>{formatJoined(user?.created_at)}</strong>
        </div>
        <div className="metric">
          <label>Last sign-in</label>
          <strong>{formatJoined(user?.last_sign_in_at)}</strong>
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
