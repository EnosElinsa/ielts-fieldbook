# Production update implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the notebook from a confirmation link, toast a draft save only after the account write succeeds, and release by pushing `master`.

**Architecture:** Three parts, each shippable on its own. Auth sentences stay in `src/auth/errors.ts` and `AuthGate` keeps the paper card. Draft toasts wait on the boolean from `saveState`. Publish is a README contract plus the existing Cloudflare Pages project, not a second uploader.

**Tech Stack:** React 19, TypeScript, Vite 6, Vitest, Supabase auth, Cloudflare Pages.

The spec is `docs/superpowers/specs/2026-09-26-auth-entry-design.md`. Account identity is already on `master`. Do not redo it.

## File map

- Modify `src/auth/errors.ts` — unconfirmed sentence and expired-link sentences.
- Modify `src/auth/AuthGate.tsx` — signup redirect, confirm and reset copy, resend result, hash errors.
- Create `src/auth/AuthGate.test.tsx` — confirm screen and redirect.
- Modify `src/context/FieldbookContext.tsx` — `persist` and `persistNow` return the `saveState` promise.
- Modify `src/features/writing/WritingDeskPage.tsx` — Save draft and Continue wait for that promise.
- Modify `src/features/speaking/SpeakingDeskPage.tsx` — the same wait, plus the recording sentences.
- Modify `src/features/review/ReviewPage.tsx` and `src/features/modals/HistoryModal.tsx` — Continue waits for the save.
- Modify `README.md` — push `master` is the release.
- Tests: `tests/auth/errors.test.ts`, `src/features/writing/WritingDeskPage.test.tsx`, `tests/speaking/recording-copy.test.ts`, `tests/readme-deploy.test.ts`.

---

### Task 1: Auth sentences

**Files:**
- Modify: `tests/auth/errors.test.ts`
- Modify: `src/auth/errors.ts`

- [ ] **Step 1: Write the failing test**

Replace `tests/auth/errors.test.ts` with:

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
    'Confirm the email first. Open the message we sent. The notebook opens from that link.',
  );
  assert.equal(authError('Password should be at least 6 characters', 'signup'), 'Use at least 6 characters.');
  assert.equal(
    authError('For security purposes, you can only request this after 60 seconds. Rate limit.', 'signup'),
    'Too many attempts. Wait a minute, then try again.',
  );
  assert.equal(authError('', 'signin'), 'Something went wrong. Try again.');
});

test('authError maps an expired or used link', () => {
  const expired = 'Email link is invalid or has expired otp_expired';
  assert.equal(authError(expired, 'signup'), 'This link no longer works. Send another confirmation email.');
  assert.equal(authError(expired, 'reset'), 'This link no longer works. Send another reset email.');
  assert.equal(authError(expired, 'signin'), 'This link no longer works. Request a new email below.');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/auth/errors.test.ts`

Expected: FAIL. The unconfirmed sentence and the expired-link sentences do not match.

- [ ] **Step 3: Write the implementation**

In `src/auth/errors.ts`, replace the unconfirmed `if` and add the link `if` immediately after it:

```ts
  if (/email not confirmed/i.test(text)) {
    return 'Confirm the email first. Open the message we sent. The notebook opens from that link.';
  }
  if (/otp_expired|email link is invalid|has expired|already been used/i.test(text)) {
    if (mode === 'signup') return 'This link no longer works. Send another confirmation email.';
    if (mode === 'reset') return 'This link no longer works. Send another reset email.';
    return 'This link no longer works. Request a new email below.';
  }
```

Leave the other branches as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/auth/errors.test.ts`

Expected: PASS. 2 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/auth/errors.test.ts src/auth/errors.ts
git commit -m "fix(auth): share expired-link sentences with the account page"
```

---

### Task 2: Confirmation opens the notebook

**Files:**
- Create: `src/auth/AuthGate.test.tsx`
- Modify: `src/auth/AuthGate.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/auth/AuthGate.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AuthGate } from './AuthGate';

const { signUp, resend, resetPasswordForEmail } = vi.hoisted(() => ({
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabaseConfigured: () => true,
  getSupabase: () => ({
    auth: {
      signUp,
      resend,
      resetPasswordForEmail,
      signInWithPassword: vi.fn(),
      updateUser: vi.fn(),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

afterEach(() => {
  cleanup();
  signUp.mockReset();
  resend.mockReset();
  resetPasswordForEmail.mockReset();
  window.location.hash = '';
});

async function renderGate() {
  render(
    <AuthGate>
      <p>Notebook</p>
    </AuthGate>,
  );
  await screen.findByRole('heading', { name: 'Sign in' });
}

test('the confirmation link opens the notebook and resend uses the shared sentence', async () => {
  signUp.mockResolvedValue({ data: { session: null }, error: null });
  resend.mockResolvedValue({ error: null });
  await renderGate();
  await userEvent.click(screen.getByRole('button', { name: 'Create an account' }));
  await userEvent.type(screen.getByLabelText('Email'), 'enoselinsa@gmail.com');
  await userEvent.type(screen.getByLabelText('Password'), 'secret1');
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(signUp).toHaveBeenCalledWith({
    email: 'enoselinsa@gmail.com',
    password: 'secret1',
    options: { emailRedirectTo: window.location.origin },
  });
  expect(await screen.findByText('The notebook opens in that tab.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'I confirmed it. Sign in' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Resend confirmation' }));
  expect(resend).toHaveBeenCalledWith({
    type: 'signup',
    email: 'enoselinsa@gmail.com',
    options: { emailRedirectTo: window.location.origin },
  });
  expect(await screen.findByText('Confirmation sent.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Resend confirmation' })).not.toBeInTheDocument();
});

test('the reset mailbox does not ask for a second sign-in', async () => {
  resetPasswordForEmail.mockResolvedValue({ error: null });
  await renderGate();
  await userEvent.click(screen.getByRole('button', { name: 'Forgot password' }));
  await userEvent.type(screen.getByLabelText('Email'), 'enoselinsa@gmail.com');
  await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(await screen.findByText('Enter a new password on the page that opens.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'I confirmed it. Sign in' })).not.toBeInTheDocument();
});

test('an expired link with no type uses the sign-in sentence', async () => {
  window.location.hash = '#error_description=Email+link+is+invalid+or+has+expired&error_code=otp_expired';
  await renderGate();
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByText('This link no longer works. Request a new email below.')).toBeInTheDocument();
});

test('an expired signup link keeps the sign-in card and the confirmation sentence', async () => {
  window.location.hash =
    '#error_description=Email+link+is+invalid+or+has+expired&error_code=otp_expired&type=signup';
  await renderGate();
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByText('This link no longer works. Send another confirmation email.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/auth/AuthGate.test.tsx`

Expected: FAIL. The confirm step still says to come back and sign in, or `signUp` is called without `emailRedirectTo`.

- [ ] **Step 3: Update AuthGate**

In `src/auth/AuthGate.tsx`:

Add `const [sent, setSent] = useState(false);` next to the other state.

In `clearStatus`, also call `setSent(false)`.

Replace the hash handling at the start of the mount effect with:

```ts
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashError = [hash.get('error_description'), hash.get('error_code')].filter(Boolean).join(' ');
    const hashType = hash.get('type');
    if (hashError) {
      const linkMode = hashType === 'signup' ? 'signup' : hashType === 'recovery' ? 'reset' : 'signin';
      setError(authError(hashError.replace(/\+/g, ' '), linkMode));
      if (linkMode === 'reset') setMode('reset');
    }
```

A fresh page has no email address. An expired signup link (`type=signup`) stays on the sign-in card and still uses the signup sentence. An expired recovery link (`type=recovery`) switches to the reset form. No `type` stays on the sign-in card and uses the signin sentence. Do not render `error_description` by itself.

Replace the `signUp` call with:

```ts
        ? await supabase.auth.signUp({
            email: address,
            password,
            options: { emailRedirectTo: window.location.origin },
          })
```

In `resend`, on success call `setSent(true)` after `setBusy(false)`. On failure leave `sent` false and set `authError` as it does now.

Replace the confirm steps' third item with `The notebook opens in that tab.`

Delete the button whose label is `I confirmed it. Sign in`.

Where the confirm card renders Resend, render `Confirmation sent.` when `sent` is true, and the Resend button otherwise. Disable that button while `busy` is true.

Do not change the new-password form. Do not change the paper CSS. Leave `sessionState === 'in'` returning `children` ahead of the mailbox, and leave `PASSWORD_RECOVERY` showing the new-password form.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/auth/AuthGate.test.tsx tests/auth/errors.test.ts`

Expected: PASS.

Run: `npx tsc -b --pretty false`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/auth/AuthGate.tsx src/auth/AuthGate.test.tsx
git commit -m "feat(auth): open the notebook from the confirmation link"
```

---

### Task 3: Draft saved follows the account write

**Files:**
- Modify: `src/context/FieldbookContext.tsx`
- Modify: `src/features/writing/WritingDeskPage.tsx`
- Create: `src/features/writing/WritingDeskPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/writing/WritingDeskPage.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { emptyState } from '../../domain';
import { WritingDeskPage } from './WritingDeskPage';

const { persistNow, flushDraftPersist, toast } = vi.hoisted(() => ({
  persistNow: vi.fn(),
  flushDraftPersist: vi.fn(() => null),
  toast: vi.fn(),
}));

vi.mock('../../context/FieldbookContext', () => ({
  useFieldbook: () => {
    const state = emptyState();
    const selected = {
      id: '1',
      type: '2',
      name: 'Essay',
      prompt: 'Discuss.',
      image: '',
      format: 'Essay',
      source: '',
    };
    return {
      state,
      stateRef: { current: state },
      selectedQuestion: selected,
      currentDeskMode: () => 'full',
      writingDraft: () => '',
      speakingDraft: () => ({ parentSessionId: null }),
      wordCount: (value: string) => (String(value || '').trim() ? String(value).trim().split(/\s+/).length : 0),
      setWritingDraft: vi.fn(),
      scheduleDraftPersist: vi.fn(),
      flushDraftPersist,
      persistNow,
      toast,
      setChecklistToastNeeded: vi.fn(),
      setPendingAttempt: vi.fn(),
      openModal: vi.fn(),
      setViewedSession: vi.fn(),
    };
  },
}));

afterEach(() => {
  cleanup();
  persistNow.mockReset();
  flushDraftPersist.mockReset();
  flushDraftPersist.mockReturnValue(null);
  toast.mockReset();
});

test('Save draft toasts only after the account write succeeds', async () => {
  persistNow.mockResolvedValue(false);
  render(<WritingDeskPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(toast).not.toHaveBeenCalledWith('Draft saved.');
  persistNow.mockResolvedValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(toast).toHaveBeenCalledWith('Draft saved.');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/writing/WritingDeskPage.test.tsx`

Expected: FAIL. The button toasts `Draft saved.` even when `persistNow` resolves false.

- [ ] **Step 3: Return the save result**

In `src/context/FieldbookContext.tsx`, replace `persist` with:

```tsx
  const persist = useCallback(
    (mutate?: (draft: any) => void, options?: { silent?: boolean }) => {
      const next = structuredClone(stateRef.current);
      if (mutate) mutate(next);
      stateRef.current = next;
      setState(next);
      return saveState(next, options?.silent ? undefined : toast);
    },
    [toast],
  );
```

Replace `persistNow` with:

```tsx
  const persistNow = useCallback(
    (draft?: any) => {
      const next = draft || stateRef.current;
      next.schemaVersion = STATE_VERSION;
      stateRef.current = next;
      setState({ ...next });
      return saveState(next, toast);
    },
    [toast],
  );
```

Replace `flushDraftPersist` with:

```tsx
  const flushDraftPersist = useCallback(() => {
    if (!draftTimer.current) return null;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = null;
    return persistNow();
  }, [persistNow]);
```

The state update stays synchronous. `saveState` is still what toasts `Could not save to your account. Try again.` Do not add a success toast inside `saveState`. Autosave keeps calling `persistNow`, so a failed autosave still toasts that sentence and a successful autosave stays quiet.

In `src/features/writing/WritingDeskPage.tsx`, replace the Save draft click handler with:

```tsx
                onClick={async () => {
                  fb.setWritingDraft(selected.id, composed, { sections });
                  const pending = fb.flushDraftPersist();
                  const saved = await (pending ?? fb.persistNow());
                  if (saved) fb.toast('Draft saved.');
                }}
```

Replace the Continue handler's `fb.persistNow(); fb.toast('Copied into a new draft.');` with:

```tsx
                          const saved = await fb.persistNow();
                          if (saved) fb.toast('Copied into a new draft.');
```

Make that Continue `onClick` `async`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features/writing/WritingDeskPage.test.tsx src/App.test.tsx`

Expected: PASS. `App.test` mocks `saveState` as `() => true`, and `await true` is still success.

- [ ] **Step 5: Commit**

```bash
git add src/context/FieldbookContext.tsx src/features/writing/WritingDeskPage.tsx src/features/writing/WritingDeskPage.test.tsx
git commit -m "fix(write): toast draft saved only after the account write"
```

---

### Task 4: Speaking, review, and history use the same save result

**Files:**
- Modify: `src/features/speaking/SpeakingDeskPage.tsx`
- Modify: `src/features/review/ReviewPage.tsx`
- Modify: `src/features/modals/HistoryModal.tsx`
- Create: `tests/speaking/recording-copy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/speaking/recording-copy.test.ts`:

```ts
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('a recording stays on the account', () => {
  const desk = readFileSync('src/features/speaking/SpeakingDeskPage.tsx', 'utf8');
  assert.match(desk, /Recordings stay on this account\./);
  assert.match(desk, /Could not store the recording\. Saving the transcript only\./);
  assert.equal(desk.includes('in this browser'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/speaking/recording-copy.test.ts`

Expected: FAIL. The desk still says the recording stays in this browser.

- [ ] **Step 3: Update the three callers**

In `src/features/speaking/SpeakingDeskPage.tsx`:

Replace `Recordings stay in this browser only.` with `Recordings stay on this account.`

Replace `Could not store the recording in this browser. Saving the transcript only.` with `Could not store the recording. Saving the transcript only.`

Replace the Save draft click handler with:

```tsx
                onClick={async () => {
                  liveSave({ transcript, notes });
                  const pending = fb.flushDraftPersist();
                  const saved = await (pending ?? fb.persistNow());
                  if (saved) fb.toast('Draft saved.');
                }}
```

Replace `fb.persistNow();` followed by `fb.toast('Copied into a new draft.');` in the Continue handler with:

```tsx
                            const saved = await fb.persistNow();
                            if (saved) fb.toast('Copied into a new draft.');
```

Make that handler `async`.

In `src/features/review/ReviewPage.tsx` and `src/features/modals/HistoryModal.tsx`, make each Continue handler that calls `persistNow` then toasts `Copied into a new draft.` into:

```tsx
      const saved = await fb.persistNow();
      if (saved) fb.toast('Copied into a new draft.');
```

Keep the `navigate` calls where they already are. The handler must be `async`.

Do not change `SessionAudioPlayer`. It already calls `getAudio` when an attempt has an `audioId`. Do not change the existing empty-state sentences.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/speaking/recording-copy.test.ts src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/speaking/SpeakingDeskPage.tsx src/features/review/ReviewPage.tsx src/features/modals/HistoryModal.tsx tests/speaking/recording-copy.test.ts
git commit -m "fix(speak): keep recordings on the account and wait for the save"
```

---

### Task 5: Release by pushing master

**Files:**
- Modify: `README.md`
- Create: `tests/readme-deploy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/readme-deploy.test.ts`:

```ts
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the release step is a push to master', () => {
  const deploy = readFileSync('README.md', 'utf8').split('## Deploy')[1].split('## ')[0];
  assert.match(deploy, /Push `master`/);
  assert.match(deploy, /https:\/\/ielts-fieldbook\.pages\.dev/);
  assert.equal(deploy.includes('npm run deploy:pages'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/readme-deploy.test.ts`

Expected: FAIL. The deploy section still tells the reader to run `npm run deploy:pages`.

- [ ] **Step 3: Rewrite the deploy section**

Replace the `## Deploy` paragraph in `README.md` with:

```md
## Deploy

Push `master`. Cloudflare Pages project `ielts-fieldbook` builds with `npm run build`, publishes `dist`, and serves https://ielts-fieldbook.pages.dev. `public/_redirects` sends every path back to `index.html`.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Pages build environment variables. The build command is `npm run build`. Do not upload `dist` with Wrangler to release.

After the hostname exists, add `https://ielts-fieldbook.pages.dev` to the Supabase site URL and redirect allow list.
```

Leave the question-charts paragraph below it. Leave the `deploy:pages` script in `package.json`. The README no longer offers it as the release step.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/readme-deploy.test.ts`

Expected: PASS. 1 test.

- [ ] **Step 5: Point Pages at the environment**

In the Cloudflare Pages project `ielts-fieldbook`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the local `.env`. Do not print the values and do not commit them. Set the production build command to `npm run build`.

This step changes the hosted project, not the git tree. If the dashboard is not available, record that and stop this task at the README commit. Do not inline the anon key into a file in the repo.

- [ ] **Step 6: Commit**

```bash
git add README.md tests/readme-deploy.test.ts
git commit -m "docs: release by pushing master"
```

---

### Task 6: Full check

- [ ] **Step 1: Run the suite and the typecheck**

Run: `npx vitest run`

Expected: PASS.

Run: `npx tsc -b --pretty false`

Expected: exit 0.

- [ ] **Step 2: Stop before pushing**

Do not push unless the user asks. After a later push of `master`, the release is done when the Cloudflare Pages check for that commit says the deploy succeeded and https://ielts-fieldbook.pages.dev loads.

If that bundle does not contain the Supabase host, set the Pages build command to prefix the two variables from `.env` and add one README sentence that Pages did not inject the build environment. Do not put the key in the README.
