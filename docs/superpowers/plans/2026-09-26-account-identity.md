# Account identity and site icon implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an English account date, a red initials circle on the account page and in the sidebar, a permanent email confirmation line, and a navy F icon in the browser tab and on a phone home screen.

**Architecture:** Pure helpers in `src/lib/identity.ts` and `src/lib/format.ts` decide the letters and the date. `useAuthUser` keeps the account page and the sidebar on the same Supabase user. `authError` moves to `src/auth/errors.ts` so sign-in and the account resend share one sentence list. The site icon is a static SVG plus a generated 180×180 PNG, linked from `index.html`. No new table, no photo upload, no web app manifest.

**Tech Stack:** React 19, TypeScript, Vite 6, Vitest, Supabase auth.

## File map

- Create `src/lib/identity.ts` — `displayNameOf`, `initials`, `avatarLetters`. No React.
- Create `src/auth/errors.ts` — `authError` and the `Mode` type, moved out of `AuthGate`.
- Create `src/auth/useAuthUser.ts` — `getUser` plus `onAuthStateChange`. Returns null when Supabase is not configured, so existing app tests keep rendering.
- Create `src/features/account/AccountMark.tsx` — the red circle. `size="page"` is 44px, `size="nav"` is 16px.
- Modify `src/lib/format.ts` — add `formatAccountDate`.
- Modify `src/features/account/AccountPage.tsx` — identity row, English dates, email status.
- Modify `src/styles/account.css` — circle, status line, resend control.
- Modify `src/components/Shell.tsx` — Account nav icon becomes `AccountMark`.
- Modify `src/auth/AuthGate.tsx` — import `authError` and `Mode`.
- Create `public/favicon.svg`, `public/apple-touch-icon.png`, `scripts/render-apple-touch-icon.mjs`.
- Modify `index.html` — replace the empty icon.
- Tests: `tests/lib/identity.test.ts`, `tests/lib/format-account-date.test.ts`, `tests/auth/errors.test.ts`, `src/features/account/AccountPage.test.tsx`, `tests/shell-account-mark.test.ts`, `tests/site-icon.test.ts`.

---

### Task 1: Initials

**Files:**
- Create: `tests/lib/identity.test.ts`
- Create: `src/lib/identity.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/identity.test.ts`:

```ts
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { avatarLetters, initials } from '../../src/lib/identity';

test('initials take the first two Latin letters and skip spaces', () => {
  assert.equal(initials('enoselinsa'), 'EN');
  assert.equal(initials('Enos Elinsa'), 'EN');
  assert.equal(initials('a'), 'A');
  assert.equal(initials(''), 'A');
});

test('initials use the first character when the name has no Latin letter', () => {
  assert.equal(initials('林昭'), '林');
});

test('a missing user gets the letter A', () => {
  assert.equal(avatarLetters(null), 'A');
  assert.equal(
    avatarLetters({ email: 'enoselinsa@gmail.com', user_metadata: { display_name: 'enoselinsa' } }),
    'EN',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/identity.test.ts`

Expected: FAIL. The module `src/lib/identity.ts` cannot be resolved.

- [ ] **Step 3: Write the implementation**

Create `src/lib/identity.ts`:

```ts
export type IdentityUser = {
  email?: string | null;
  user_metadata?: { display_name?: unknown } | null;
} | null;

export function displayNameOf(user: IdentityUser) {
  const stored = user?.user_metadata?.display_name;
  if (typeof stored === 'string' && stored.trim()) return stored.trim();
  const email = user?.email || '';
  return email.split('@')[0] || 'Account';
}

export function initials(source: string) {
  const trimmed = source.trim();
  if (!trimmed) return 'A';
  const latin = trimmed.match(/[A-Za-z]/g) || [];
  if (latin.length > 0) return latin.slice(0, 2).join('').toUpperCase();
  return Array.from(trimmed)[0];
}

export function avatarLetters(user: IdentityUser) {
  if (!user) return 'A';
  return initials(displayNameOf(user));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/identity.test.ts`

Expected: PASS. 3 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/lib/identity.test.ts src/lib/identity.ts
git commit -m "feat(account): derive initials from the display name"
```

---

### Task 2: English account dates

**Files:**
- Create: `tests/lib/format-account-date.test.ts`
- Modify: `src/lib/format.ts` (add `formatAccountDate` directly after `formatDate`)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/format-account-date.test.ts`:

```ts
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { formatAccountDate } from '../../src/lib/format';

test('account dates use the English short month', () => {
  assert.equal(formatAccountDate('2026-09-25T12:00:00'), '25 Sept 2026');
});

test('a missing or unparseable account date is an em dash', () => {
  assert.equal(formatAccountDate(undefined), '—');
  assert.equal(formatAccountDate(''), '—');
  assert.equal(formatAccountDate('not-a-date'), '—');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/format-account-date.test.ts`

Expected: FAIL. `formatAccountDate` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/format.ts`, immediately after the `formatDate` function, add:

```ts
export function formatAccountDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return formatDate(value);
}
```

`formatDate` is already `en-GB` with `year: 'numeric', month: 'short', day: 'numeric'`. Do not pass `undefined` into `toLocaleDateString`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/format-account-date.test.ts`

Expected: PASS. 2 tests. The rendered string is `25 Sept 2026`, which is what `en-GB` produces in this runtime.

- [ ] **Step 5: Commit**

```bash
git add tests/lib/format-account-date.test.ts src/lib/format.ts
git commit -m "fix(account): format joined dates in English"
```

---

### Task 3: Share auth error sentences

**Files:**
- Create: `tests/auth/errors.test.ts`
- Create: `src/auth/errors.ts`
- Modify: `src/auth/AuthGate.tsx` (delete the local `authError` and `Mode`, import both)

- [ ] **Step 1: Write the failing test**

Create `tests/auth/errors.test.ts`:

```ts
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { authError } from '../../src/auth/errors';

test('authError maps the sign-in failures the account page can also hit', () => {
  assert.equal(
    authError('Invalid login credentials', 'signin'),
    'That email has no account yet, or the password is wrong. Create an account, or open the confirmation email if you already registered.',
  );
  assert.equal(
    authError('User already registered', 'signup'),
    'That email already has an account. Sign in, or reset the password.',
  );
  assert.equal(
    authError('Email not confirmed', 'signin'),
    'Confirm the email first. Open the message we sent, then sign in.',
  );
  assert.equal(authError('Password should be at least 6 characters', 'signup'), 'Use at least 6 characters.');
  assert.equal(authError('For security purposes, you can only request this after 60 seconds. Rate limit.', 'signup'), 'Too many attempts. Wait a minute, then try again.');
  assert.equal(authError('', 'signin'), 'Something went wrong. Try again.');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/auth/errors.test.ts`

Expected: FAIL. The module `src/auth/errors.ts` cannot be resolved.

- [ ] **Step 3: Write the implementation**

Create `src/auth/errors.ts` with the function that currently lives in `AuthGate.tsx`:

```ts
export type Mode = 'signin' | 'signup' | 'reset';

export function authError(message: string, mode: Mode) {
  const text = message || 'Something went wrong. Try again.';
  if (mode === 'signin' && /invalid login credentials/i.test(text)) {
    return 'That email has no account yet, or the password is wrong. Create an account, or open the confirmation email if you already registered.';
  }
  if (/already registered|already been registered|user already exists/i.test(text)) {
    return 'That email already has an account. Sign in, or reset the password.';
  }
  if (/email not confirmed/i.test(text)) {
    return 'Confirm the email first. Open the message we sent, then sign in.';
  }
  if (/password should be at least|weak password/i.test(text)) {
    return 'Use at least 6 characters.';
  }
  if (/rate limit|too many requests/i.test(text)) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  return text;
}
```

In `src/auth/AuthGate.tsx`:

- Add `import { authError, type Mode } from './errors';` next to the other imports.
- Delete `type Mode = 'signin' | 'signup' | 'reset';`.
- Delete the whole local `function authError`.

Leave every call site (`authError(result.error.message, mode)` and `authError(resendError.message, 'signup')`) as it is.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/auth/errors.test.ts`

Expected: PASS. 1 test.

Then run: `npx tsc -b --pretty false`

Expected: exit 0. `AuthGate.tsx` still typechecks with the imported `Mode`.

- [ ] **Step 5: Commit**

```bash
git add tests/auth/errors.test.ts src/auth/errors.ts src/auth/AuthGate.tsx
git commit -m "refactor(auth): share sign-in error sentences"
```

---

### Task 4: Account page identity, dates, and email status

**Files:**
- Create: `src/auth/useAuthUser.ts`
- Create: `src/features/account/AccountMark.tsx`
- Modify: `src/features/account/AccountPage.tsx`
- Modify: `src/styles/account.css`
- Test: `src/features/account/AccountPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/account/AccountPage.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AccountPage } from './AccountPage';

const { state, resend } = vi.hoisted(() => ({
  state: {
    user: {
      id: 'user-1',
      email: 'enoselinsa@gmail.com',
      created_at: '2026-09-25T12:00:00',
      last_sign_in_at: '2026-09-26T12:00:00',
      email_confirmed_at: '2026-09-25T12:05:00',
      user_metadata: { display_name: 'enoselinsa' },
    } as {
      id: string;
      email: string;
      created_at: string;
      last_sign_in_at: string;
      email_confirmed_at: string | null;
      user_metadata: { display_name: string };
    },
  },
  resend: vi.fn(),
}));

vi.mock('../../auth/useAuthUser', () => ({
  useAuthUser: () => state.user,
}));

vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({ auth: { resend, updateUser: vi.fn(), signOut: vi.fn() } }),
  supabaseConfigured: () => true,
}));

afterEach(() => {
  cleanup();
  resend.mockReset();
  state.user.email_confirmed_at = '2026-09-25T12:05:00';
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountPage />
    </MemoryRouter>,
  );
}

describe('AccountPage identity', () => {
  test('shows English dates, initials, and a confirmed email', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'enoselinsa' })).toBeInTheDocument();
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('25 Sept 2026')).toBeInTheDocument();
    expect(screen.getByText('26 Sept 2026')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resend' })).not.toBeInTheDocument();
  });

  test('offers resend until the confirmation email is sent', async () => {
    state.user.email_confirmed_at = null;
    resend.mockResolvedValue({ error: null });
    renderPage();
    expect(screen.getByText('Not confirmed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resend' }));
    expect(resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'enoselinsa@gmail.com',
      options: { emailRedirectTo: window.location.origin },
    });
    expect(await screen.findByText(/Confirmation sent\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resend' })).not.toBeInTheDocument();
    expect(screen.getByText('Not confirmed')).toBeInTheDocument();
  });

  test('shows the shared rate-limit sentence when resend fails', async () => {
    state.user.email_confirmed_at = null;
    resend.mockResolvedValue({ error: { message: 'email rate limit exceeded' } });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Resend' }));
    expect(await screen.findByText('Too many attempts. Wait a minute, then try again.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/account/AccountPage.test.tsx`

Expected: FAIL. `useAuthUser` cannot be resolved, or the page does not yet render `EN`, `25 Sept 2026`, or `Confirmed`.

- [ ] **Step 3: Write the hook and the mark**

Create `src/auth/useAuthUser.ts`:

```ts
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase, supabaseConfigured } from '../lib/supabase';

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const supabase = getSupabase();
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUser(data.user);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return user;
}
```

Returning early when Supabase is not configured keeps `src/App.test.tsx` from throwing. The account page test mocks this hook, so it does not call Supabase.

Create `src/features/account/AccountMark.tsx`:

```tsx
import { avatarLetters, type IdentityUser } from '../../lib/identity';

export function AccountMark({ user, size = 'page' }: { user: IdentityUser; size?: 'page' | 'nav' }) {
  const className = size === 'nav' ? 'avatar avatar-nav' : 'avatar';
  return (
    <span className={className} aria-hidden="true">
      {avatarLetters(user)}
    </span>
  );
}
```

- [ ] **Step 4: Replace the account page**

Replace `src/features/account/AccountPage.tsx` with:

```tsx
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from '../../auth/AuthGate';
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
  const [busy, setBusy] = useState<'name' | 'password' | 'out' | 'resend' | null>(null);
  const confirmed = Boolean(user?.email_confirmed_at);

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
```

`updateUser` still writes `user_metadata.display_name`. `onAuthStateChange` in `useAuthUser` refreshes the circle after that save. The name field limit stays 40.

Append to `src/styles/account.css`:

```css
.account-id{display:flex;align-items:center;gap:12px}
.account-id h2{margin:0;font:600 28px/1.1 'Source Serif 4',serif;color:var(--ink)}
.avatar{width:44px;height:44px;border-radius:50%;background:var(--red);color:var(--sheet);display:grid;place-items:center;font:600 16px 'Source Serif 4',serif;flex:none}
.avatar-nav{width:16px;height:16px;font-size:8px;line-height:1}
.account-email-status{display:block;margin-top:6px;font:11px/1.4 'DM Mono',monospace;letter-spacing:.04em}
.account-email-status.is-confirmed{color:#2f5646}
.account-email-status.is-pending{color:var(--red)}
.account-resend{margin-left:8px;padding:0;border:0;background:none;color:var(--red);font:inherit;letter-spacing:inherit;text-decoration:underline;cursor:pointer}
.account-resend:disabled{cursor:wait;opacity:.6}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/features/account/AccountPage.test.tsx src/App.test.tsx`

Expected: PASS. The account page shows `EN`, `25 Sept 2026`, `26 Sept 2026`, and `Confirmed`. Resend calls `auth.resend` with `type: 'signup'` and then shows `Confirmation sent.` The existing app test still passes because `useAuthUser` is not mounted there yet.

- [ ] **Step 6: Commit**

```bash
git add src/auth/useAuthUser.ts src/features/account/AccountMark.tsx src/features/account/AccountPage.tsx src/features/account/AccountPage.test.tsx src/styles/account.css
git commit -m "feat(account): show initials and email confirmation"
```

---

### Task 5: Sidebar circle

**Files:**
- Create: `tests/shell-account-mark.test.ts`
- Modify: `src/components/Shell.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/shell-account-mark.test.ts`:

```ts
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the Account link uses the initials circle', () => {
  const shell = readFileSync('src/components/Shell.tsx', 'utf8');
  assert.match(shell, /<AccountMark user=\{accountUser\} size="nav" \/>/);
  assert.equal(shell.includes('{NavIcons.account}'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/shell-account-mark.test.ts`

Expected: FAIL. `Shell.tsx` still renders `{NavIcons.account}` and does not render `AccountMark`.

- [ ] **Step 3: Use the same mark on the Account link**

In `src/components/Shell.tsx`:

Add imports:

```tsx
import { useAuthUser } from '../auth/useAuthUser';
import { AccountMark } from '../features/account/AccountMark';
```

Inside `Shell`, next to the other hooks:

```tsx
const accountUser = useAuthUser();
```

Replace the Account `NavLink` icon. The current block is:

```tsx
<NavLink to="/account" className={({ isActive }) => (isActive ? 'active' : undefined)}>
  <span className="nav-icon" aria-hidden="true">
    {NavIcons.account}
  </span>
  <span className="nav-label">Account</span>
</NavLink>
```

Change it to:

```tsx
<NavLink to="/account" className={({ isActive }) => (isActive ? 'active' : undefined)}>
  <span className="nav-icon">
    <AccountMark user={accountUser} size="nav" />
  </span>
  <span className="nav-label">Account</span>
</NavLink>
```

Do not wrap `AccountMark` in `aria-hidden`. The mark itself is already `aria-hidden`, and the visible label remains `Account`. Leave `NavIcons.account` in `ui.tsx` even if this link no longer uses it. Leave the sidebar brand square (`W` / `S`, gold offset) untouched. Collapsed rails already hide `.nav-label` and keep `.nav-icon`, so the 16px circle stays.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/shell-account-mark.test.ts src/App.test.tsx`

Expected: PASS. `Shell` now calls `useAuthUser`. With no `VITE_SUPABASE_URL` in the test environment, the hook returns null and the Account link still has the accessible name `Account`.

Run: `npx tsc -b --pretty false`

Expected: exit 0. If `User` is not assignable to `IdentityUser`, widen `user_metadata` in `src/lib/identity.ts` to `{ display_name?: unknown; [key: string]: unknown } | null` and rerun `tsc -b`.

- [ ] **Step 5: Commit**

```bash
git add tests/shell-account-mark.test.ts src/components/Shell.tsx src/lib/identity.ts
git commit -m "feat(account): use the initials circle in the sidebar"
```

Include `src/lib/identity.ts` in this commit only if the typecheck edit in Step 4 changed it.

---

### Task 6: Site icon

**Files:**
- Create: `public/favicon.svg`
- Create: `scripts/render-apple-touch-icon.mjs`
- Create: `public/apple-touch-icon.png` (generated, then committed)
- Create: `tests/site-icon.test.ts`
- Modify: `index.html`

- [ ] **Step 1: Write the failing test**

Create `tests/site-icon.test.ts`:

```ts
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the tab and the home screen use the navy F', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /rel="icon" href="\/favicon\.svg"/);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.equal(html.includes('data:,'), false);

  const svg = readFileSync('public/favicon.svg', 'utf8');
  assert.match(svg, /#143848/i);
  assert.match(svg, /#fbf8f2/i);
  assert.match(svg, /<path/i);

  const png = readFileSync('public/apple-touch-icon.png');
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/site-icon.test.ts`

Expected: FAIL because `index.html` still contains `data:,` and the SVG and PNG do not exist.

- [ ] **Step 3: Add the SVG and the page links**

Create `public/favicon.svg`. The letter is a path, so the tab does not need Source Serif 4. The geometry matches the PNG renderer in the next step.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#143848"/>
  <path fill="#fbf8f2" d="M9 6H23V10.2H13.2V14H20V18.2H13.2V26H9Z"/>
</svg>
```

In `index.html`, replace:

```html
<link rel="icon" href="data:," />
```

with:

```html
<link rel="icon" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

Do not add a web app manifest.

- [ ] **Step 4: Generate the 180×180 PNG**

Create `scripts/render-apple-touch-icon.mjs`:

```js
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 180;
const NAVY = [0x14, 0x38, 0x48];
const CREAM = [0xfb, 0xf8, 0xf2];

function coversF(x, y) {
  const u = ((x + 0.5) / SIZE) * 32;
  const v = ((y + 0.5) / SIZE) * 32;
  const stem = u >= 9 && u < 13.2 && v >= 6 && v < 26;
  const top = u >= 9 && u < 23 && v >= 6 && v < 10.2;
  const mid = u >= 9 && u < 20 && v >= 14 && v < 18.2;
  return stem || top || mid;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 8 + data.length);
  return out;
}

const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
for (let y = 0; y < SIZE; y += 1) {
  const row = y * (1 + SIZE * 3);
  raw[row] = 0;
  for (let x = 0; x < SIZE; x += 1) {
    const px = coversF(x, y) ? CREAM : NAVY;
    const i = row + 1 + x * 3;
    raw[i] = px[0];
    raw[i + 1] = px[1];
    raw[i + 2] = px[2];
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(new URL('../public/apple-touch-icon.png', import.meta.url), png);
```

Run: `node scripts/render-apple-touch-icon.mjs`

Expected: `public/apple-touch-icon.png` exists. No extra npm dependency.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/site-icon.test.ts`

Expected: PASS. 1 test.

- [ ] **Step 6: Commit**

```bash
git add index.html public/favicon.svg public/apple-touch-icon.png scripts/render-apple-touch-icon.mjs tests/site-icon.test.ts
git commit -m "feat(ui): add the navy F site icon"
```

---

### Task 7: Full check

- [ ] **Step 1: Run the suite and the typecheck**

Run: `npx vitest run`

Expected: PASS, including the previous storage and app tests.

Run: `npx tsc -b --pretty false`

Expected: exit 0.

- [ ] **Step 2: Stop**

Do not deploy. The icon and the account page ship on the next production build of `master`.
