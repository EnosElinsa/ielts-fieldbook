# Account lifecycle and today's lead implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in person start an email change and delete the login, name a missing exam date on Today, and keep a failed save on screen until the next save succeeds.

**Architecture:** Email change uses `updateUser` and waits for the session email to change. Deletion is one `security definer` function, `delete_own_account`, called with the user JWT. The browser never sees the service role key. `persist` and `persistNow` already return the `saveState` boolean; they also set one shell flag that `SaveFailure` renders under the page title.

**Tech Stack:** React 19, TypeScript, Vite 6, Vitest, Supabase auth and Postgres.

The spec is `docs/superpowers/specs/2026-09-26-account-lifecycle-design.md`.

## File map

- Create `src/auth/email.ts` — `emailsMatch`.
- Create `supabase/migrations/20260926120000_delete_own_account.sql` — the delete function.
- Modify `src/features/account/AccountPage.tsx` — email panel and delete panel.
- Modify `src/features/account/AccountPage.test.tsx` — delete stays disabled until the email matches.
- Modify `src/features/today/TodayPage.tsx` — missing exam date lead.
- Create `src/features/today/TodayPage.test.tsx`.
- Create `src/components/SaveFailure.tsx` — the standing failure line.
- Modify `src/context/FieldbookContext.tsx` — `saveFailed` flag.
- Modify `src/components/Shell.tsx` — render the line under the page title.
- Tests: `tests/auth/email.test.ts`, `src/components/SaveFailure.test.tsx`.

---

### Task 1: Email match

**Files:**
- Create: `tests/auth/email.test.ts`
- Create: `src/auth/email.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/auth/email.test.ts`:

```ts
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { emailsMatch } from '../../src/auth/email';

test('emailsMatch ignores case and surrounding spaces', () => {
  assert.equal(emailsMatch('  EnosElinsa@gmail.com ', 'enoselinsa@gmail.com'), true);
  assert.equal(emailsMatch('other@gmail.com', 'enoselinsa@gmail.com'), false);
  assert.equal(emailsMatch('', 'enoselinsa@gmail.com'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/auth/email.test.ts`

Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Write the implementation**

Create `src/auth/email.ts`:

```ts
export function emailsMatch(typed: string | null | undefined, current: string | null | undefined) {
  const left = String(typed || '').trim().toLowerCase();
  const right = String(current || '').trim().toLowerCase();
  return Boolean(left) && left === right;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/auth/email.test.ts`

Expected: PASS. 1 test.

- [ ] **Step 5: Commit**

```bash
git add tests/auth/email.test.ts src/auth/email.ts
git commit -m "feat(account): match an email without case or surrounding spaces"
```

---

### Task 2: delete_own_account

**Files:**
- Create: `supabase/migrations/20260926120000_delete_own_account.sql`

- [ ] **Step 1: Add the migration**

Create `supabase/migrations/20260926120000_delete_own_account.sql`:

```sql
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, storage, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in to delete this account';
  end if;

  delete from storage.objects
  where bucket_id = 'recordings'
    and (storage.foldername(name))[1] = uid::text;

  delete from auth.users
  where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
```

The storage delete runs before the `auth.users` delete. Cascade foreign keys already remove the profile and study rows. The question catalog has no `user_id`, so it stays.

- [ ] **Step 2: Apply it to the hosted project when the CLI is logged in**

Run: `npx supabase db query --linked -f supabase/migrations/20260926120000_delete_own_account.sql`

If that fails because the CLI is not logged in, do not paste a service role key into the repo. Commit the migration and record in the task report that the hosted function was not applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260926120000_delete_own_account.sql
git commit -m "feat(account): delete the signed-in user from the database"
```

---

### Task 3: Account email and delete panels

**Files:**
- Modify: `src/features/account/AccountPage.tsx`
- Modify: `src/features/account/AccountPage.test.tsx`

- [ ] **Step 1: Extend the test mock and add the failing test**

In `src/features/account/AccountPage.test.tsx`, add `updateUser` and `rpc` to the hoisted object:

```tsx
const { state, resend, updateUser, rpc } = vi.hoisted(() => ({
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
  updateUser: vi.fn(),
  rpc: vi.fn(),
}));
```

Change the supabase mock to:

```tsx
vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({ auth: { resend, updateUser, signOut: vi.fn() }, rpc }),
  supabaseConfigured: () => true,
}));
```

Reset `updateUser` and `rpc` in `afterEach`.

Add this test inside the existing describe:

```tsx
  test('delete stays disabled until the typed email matches', async () => {
    renderPage();
    const button = screen.getByRole('button', { name: 'Delete account' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type your email'), 'other@gmail.com');
    expect(screen.getByText('Type the email shown above.')).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(rpc).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText('Type your email'));
    await userEvent.type(screen.getByLabelText('Type your email'), ' ENOSElinsa@gmail.com ');
    expect(button).toBeEnabled();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/account/AccountPage.test.tsx`

Expected: FAIL. The delete button is not on the page.

- [ ] **Step 3: Add the panels**

In `src/features/account/AccountPage.tsx`:

Import `emailsMatch` from `../../auth/email` and `authError` is already imported.

Add state:

```tsx
  const [nextEmail, setNextEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleteError, setDeleteError] = useState('');
```

Widen `busy` with `'email' | 'delete'`.

Add:

```tsx
  const deleteReady = emailsMatch(deleteEmail, user?.email);
  const pendingVisible = Boolean(pendingEmail) && !emailsMatch(user?.email, pendingEmail);

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
    const { error } = await getSupabase().auth.updateUser({
      email: next,
      options: { emailRedirectTo: window.location.origin },
    });
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
```

Under the name/password `.split`, before the sign-out panel, add:

```tsx
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
```

Do not change the settings backup sentence.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features/account/AccountPage.test.tsx tests/auth/errors.test.ts`

Expected: PASS. The existing already-registered and rate-limit sentences stay in `tests/auth/errors.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/features/account/AccountPage.tsx src/features/account/AccountPage.test.tsx
git commit -m "feat(account): change email after confirmation and delete the login"
```

---

### Task 4: Missing exam date on Today

**Files:**
- Create: `src/features/today/TodayPage.test.tsx`
- Modify: `src/features/today/TodayPage.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/today/TodayPage.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { emptyState } from '../../domain';
import { TodayPage } from './TodayPage';

const { openModal, examDate } = vi.hoisted(() => ({
  openModal: vi.fn(),
  examDate: { value: '' },
}));

vi.mock('../../context/FieldbookContext', () => ({
  useFieldbook: () => {
    const state = emptyState();
    state.settings.examDate = examDate.value;
    return {
      state,
      activeSkill: 'writing',
      ensurePlansForSkill: () => [],
      openModal,
      setLexiconDueOnly: vi.fn(),
      setSkill: vi.fn(),
      startPlan: vi.fn(),
    };
  },
}));

afterEach(() => {
  cleanup();
  openModal.mockReset();
  examDate.value = '';
});

test('an empty exam date can open settings and the tasks stay on the page', async () => {
  render(<TodayPage />);
  expect(screen.getByText('The exam date is not set. Set it and the daily tasks follow the exam.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: "Today's main task" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Set exam date' }));
  expect(openModal).toHaveBeenCalledWith('settings');
});

test('a set exam date keeps the current lead', () => {
  examDate.value = '2026-12-01';
  render(<TodayPage />);
  expect(screen.queryByText('The exam date is not set. Set it and the daily tasks follow the exam.')).not.toBeInTheDocument();
  expect(screen.getByText(/Today.s writing is below\./)).toBeInTheDocument();
});
```

The practice step title comes from `todaySession` on an empty state: `Today's main task`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/today/TodayPage.test.tsx`

Expected: FAIL. The missing-date sentence is not rendered.

- [ ] **Step 3: Change the lead**

In `src/features/today/TodayPage.tsx`, replace the lead paragraph with:

```tsx
          {fb.state.settings.examDate ? (
            <p>
              {session.weakest
                ? `Practise ${criterionLabel(session.weakest.key).toLowerCase()} first. Work through the steps below.`
                : speaking
                  ? 'Today’s speaking is below.'
                  : 'Today’s writing is below.'}
            </p>
          ) : (
            <>
              <p>The exam date is not set. Set it and the daily tasks follow the exam.</p>
              <button type="button" className="btn primary" onClick={() => fb.openModal('settings')}>
                Set exam date
              </button>
            </>
          )}
```

Leave the step list under that paragraph.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/today/TodayPage.test.tsx`

Expected: PASS. 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/today/TodayPage.tsx src/features/today/TodayPage.test.tsx
git commit -m "feat(today): point a missing exam date at settings"
```

---

### Task 5: Standing save failure

**Files:**
- Create: `src/components/SaveFailure.tsx`
- Create: `src/components/SaveFailure.test.tsx`
- Modify: `src/context/FieldbookContext.tsx`
- Modify: `src/components/Shell.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/SaveFailure.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { SaveFailure } from './SaveFailure';

afterEach(cleanup);

test('the failed save line stays only while the flag is set', () => {
  const { rerender } = render(<SaveFailure failed />);
  expect(screen.getByRole('status')).toHaveTextContent('Could not save to your account. Try again.');
  rerender(<SaveFailure failed={false} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  const shell = readFileSync(new URL('./Shell.tsx', import.meta.url), 'utf8');
  expect(shell).toContain('<SaveFailure failed={fb.saveFailed} />');
});
```

`import.meta.url` in Vite tests resolves the source file's directory when the test imports the component. If the Shell read fails to find the file, use `src/components/Shell.tsx` from the project root with `readFileSync('src/components/Shell.tsx', 'utf8')` instead.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/SaveFailure.test.tsx`

Expected: FAIL. `SaveFailure` cannot be resolved.

- [ ] **Step 3: Implement the flag and the line**

Create `src/components/SaveFailure.tsx`:

```tsx
export function SaveFailure({ failed }: { failed: boolean }) {
  if (!failed) return null;
  return (
    <p className="save-failure" role="status">
      Could not save to your account. Try again.
    </p>
  );
}
```

Add to `src/styles/account.css`:

```css
.save-failure{margin:0 0 16px;padding:10px 12px;border-left:3px solid var(--red);background:var(--soft-red);color:var(--red);font-size:13px}
```

In `src/context/FieldbookContext.tsx`, add `const [saveFailed, setSaveFailed] = useState(false);`.

Wrap both `saveState` returns:

```tsx
      return saveState(next, options?.silent ? undefined : toast).then((saved) => {
        setSaveFailed(!saved);
        return saved;
      });
```

and:

```tsx
      return saveState(next, toast).then((saved) => {
        setSaveFailed(!saved);
        return saved;
      });
```

Put `saveFailed` on the context value and in that memo's dependency list.

In `src/components/Shell.tsx`, import `SaveFailure` and place this between `</header>` and `<div className="page">`:

```tsx
          <SaveFailure failed={fb.saveFailed} />
```

A successful autosave clears the flag because it goes through `persistNow`. It still does not toast `Draft saved.` The short failure toast stays inside `saveState`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/SaveFailure.test.tsx src/App.test.tsx src/features/writing/WritingDeskPage.test.tsx`

Expected: PASS.

Run: `npx tsc -b --pretty false`

Expected: exit 0. If `saveState` is inferred as returning `boolean` rather than a promise, `await` or `Promise.resolve(saveState(...)).then(...)` still works. Use `Promise.resolve` if TypeScript complains.

- [ ] **Step 5: Commit**

```bash
git add src/components/SaveFailure.tsx src/components/SaveFailure.test.tsx src/components/Shell.tsx src/context/FieldbookContext.tsx src/styles/account.css
git commit -m "fix(save): keep a failed save on screen until the next success"
```

---

### Task 6: Full check

- [ ] **Step 1: Run the suite and the typecheck**

Run: `npx vitest run`

Expected: PASS.

Run: `npx tsc -b --pretty false`

Expected: exit 0.

- [ ] **Step 2: Stop before pushing**

Do not push unless the user asks. Deleting an account on the live site also needs the hosted function from Task 2 to be applied.
