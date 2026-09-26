# Score file handoff implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An empty skill shows how to hand off a score file, and Finished plus the normal export toast say to score that file outside Fieldbook and import it back.

**Architecture:** Slice 1 only. Today already filters attempts with `sessionSkill`. The handoff sentence uses that list. Finished copy stays in `SaveModal`. The normal export toast stays in `saveAttempt`; mock continuation toasts stay the sentences they already are. Import score stays the header button in `Shell`.

**Tech Stack:** React 19, TypeScript, Vite 6, Vitest, Testing Library.

The roadmap is `docs/superpowers/specs/2026-09-26-launch-learning-roadmap-design.md`. This plan implements slice 1 only. Do not implement slices 2, 3, or 4.

## File map

- Modify `src/features/today/TodayPage.tsx` — one sentence when the active skill has no saved attempt.
- Modify `src/features/today/TodayPage.test.tsx` — the sentence, the exam-date lead, and which attempts hide it.
- Create `src/features/modals/SaveModal.test.tsx` — writing and speaking Finished sentences, buttons, blank fields.
- Modify `src/features/modals/SaveModal.tsx` — those two sentences.
- Modify `src/context/FieldbookContext.tsx` — the Review toast after a normal export.
- Modify `src/App.test.tsx` — the writing export toast.
- Create `tests/finish-handoff.test.ts` — speaking export toast, and mock toasts that name only the next part.

---

### Task 1: Today handoff sentence

**Files:**
- Modify: `src/features/today/TodayPage.test.tsx`
- Modify: `src/features/today/TodayPage.tsx`

- [ ] **Step 1: Write the failing test**

In `src/features/today/TodayPage.test.tsx`, add `activeSkill` to the hoisted values and return it from the mock. Replace the `vi.hoisted` block and the `activeSkill` field inside `useFieldbook` with:

```ts
const { openModal, examDate, fieldbookState, activeSkill } = vi.hoisted(() => ({
  openModal: vi.fn(),
  examDate: { value: '' },
  fieldbookState: { current: null as ReturnType<typeof emptyState> | null },
  activeSkill: { value: 'writing' },
}));
```

Inside the mock return, replace `activeSkill: 'writing'` with `activeSkill: activeSkill.value`.

In `afterEach`, after `examDate.value = ''`, add:

```ts
  activeSkill.value = 'writing';
```

Append these tests:

```ts
const handoff = 'Finish one task. Export the file, score it outside Fieldbook, then import the scored file.';

test('an empty writing skill names the score file under the exam-date lead', () => {
  renderPage();
  expect(screen.getByText('The exam date is not set. Set it and the daily tasks follow the exam.')).toBeInTheDocument();
  expect(screen.getByText(handoff)).toBeInTheDocument();
});

test('a set exam date still names the score file when nothing is saved', () => {
  examDate.value = '2026-12-01';
  renderPage();
  expect(screen.getByText(/Today.s writing is below\./)).toBeInTheDocument();
  expect(screen.getByText(handoff)).toBeInTheDocument();
});

test('a saved writing attempt hides the score-file sentence', () => {
  fieldbookState.current = emptyState();
  fieldbookState.current.sessions.push({
    id: 's1',
    skill: 'writing',
    date: '2026-01-01T00:00:00.000Z',
  });
  renderPage();
  expect(screen.queryByText(handoff)).not.toBeInTheDocument();
});

test('a speaking attempt does not hide the writing score-file sentence', () => {
  fieldbookState.current = emptyState();
  fieldbookState.current.sessions.push({
    id: 's1',
    skill: 'speaking',
    date: '2026-01-01T00:00:00.000Z',
  });
  renderPage();
  expect(screen.getByText(handoff)).toBeInTheDocument();
});

test('a writing attempt does not hide the speaking score-file sentence', () => {
  activeSkill.value = 'speaking';
  fieldbookState.current = emptyState();
  fieldbookState.current.sessions.push({
    id: 's1',
    skill: 'writing',
    date: '2026-01-01T00:00:00.000Z',
  });
  renderPage();
  expect(screen.getByText(handoff)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/today/TodayPage.test.tsx`

Expected: FAIL. The handoff sentence is not in the document.

- [ ] **Step 3: Write the minimal implementation**

In `src/features/today/TodayPage.tsx`, `skillSessions` is already the attempts for `fb.activeSkill`. Immediately after the exam-date lead paragraph (the `{fb.state.settings.examDate ? (` block) and before `<ol className="session-steps">`, add:

```tsx
          {skillSessions.length ? null : (
            <p>Finish one task. Export the file, score it outside Fieldbook, then import the scored file.</p>
          )}
```

Leave the exam-date paragraph and the task list as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/today/TodayPage.test.tsx`

Expected: PASS. 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/today/TodayPage.tsx src/features/today/TodayPage.test.tsx
git commit -m "feat(today): name the score file when a skill has no attempt"
```

---

### Task 2: Finished sentences

**Files:**
- Create: `src/features/modals/SaveModal.test.tsx`
- Modify: `src/features/modals/SaveModal.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/modals/SaveModal.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { SaveModal } from './SaveModal';

const { saveAttempt, closeModal, setPendingAttempt, pending } = vi.hoisted(() => ({
  saveAttempt: vi.fn(),
  closeModal: vi.fn(),
  setPendingAttempt: vi.fn(),
  pending: { skill: 'writing' as string },
}));

vi.mock('../../context/FieldbookContext', () => ({
  useFieldbook: () => ({
    modal: 'save',
    pendingAttempt: pending,
    saveAttempt,
    closeModal,
    setPendingAttempt,
  }),
}));

afterEach(() => {
  cleanup();
  saveAttempt.mockReset();
  closeModal.mockReset();
  setPendingAttempt.mockReset();
  pending.skill = 'writing';
});

test('writing Finished names the essay file and keeps both save buttons', async () => {
  render(<SaveModal />);
  expect(
    screen.getByText('This file is the essay to score. Score it outside Fieldbook, then import the scored file.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save and export' }).className).toContain('primary');
  expect(screen.getByRole('button', { name: 'Save only' }).className).toContain('line');
  expect(screen.queryByRole('button', { name: 'Import score' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save only' }));
  expect(saveAttempt).toHaveBeenCalledWith(false, { focus: '', next: '', errors: '' });
});

test('speaking Finished says the recording is not inside the file', () => {
  pending.skill = 'speaking';
  render(<SaveModal />);
  expect(
    screen.getByText(
      'This file is what you said. The recording is not inside the file. Score it outside Fieldbook, then import the scored file.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/in this browser/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/modals/SaveModal.test.tsx`

Expected: FAIL. The modal still says `Save this attempt. You can also export it for a score.`

- [ ] **Step 3: Write the minimal implementation**

In `src/features/modals/SaveModal.tsx`, replace the paragraph under `<h3>Finished</h3>` with:

```tsx
        <p>
          {speaking
            ? 'This file is what you said. The recording is not inside the file. Score it outside Fieldbook, then import the scored file.'
            : 'This file is the essay to score. Score it outside Fieldbook, then import the scored file.'}
        </p>
```

Leave Cancel, Save only, Save and export, and the three fields as they are. Do not add an import button.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/modals/SaveModal.test.tsx`

Expected: PASS. 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/modals/SaveModal.tsx src/features/modals/SaveModal.test.tsx
git commit -m "feat(save): say the finished file is scored outside Fieldbook"
```

---

### Task 3: Normal export toast

**Files:**
- Create: `tests/finish-handoff.test.ts`
- Modify: `src/App.test.tsx` (the existing test `blocks timed save until the checklist is complete, then export and import link by session_id`)
- Modify: `src/context/FieldbookContext.tsx` (the `toast(...)` call after `navigate('/review')` in `saveAttempt`)

- [ ] **Step 1: Write the failing test**

Create `tests/finish-handoff.test.ts`:

```ts
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('a normal export toast names the outside score, and a mock toast names only the next part', () => {
  const source = readFileSync('src/context/FieldbookContext.tsx', 'utf8');
  assert.match(
    source,
    /Essay saved, and the score request was exported\. Score it outside Fieldbook, then import the scored file\./,
  );
  assert.match(
    source,
    /Saved, and the score request was exported\. Score it outside Fieldbook, then import the scored file\./,
  );
  assert.match(source, /toast\('Task 1 is saved\. Task 2 is next, 40 minutes\.'\)/);
  assert.match(source, /'Part 1 is saved\. Part 2 is next\.'/);
  assert.match(source, /'Part 2 is saved\. Part 3 is next\.'/);
});
```

In `src/App.test.tsx`, inside `blocks timed save until the checklist is complete, then export and import link by session_id`, after `await user.click(screen.getByRole('button', { name: 'Save and export' }));`, add:

```tsx
    expect(
      await screen.findByText(
        'Essay saved, and the score request was exported. Score it outside Fieldbook, then import the scored file.',
      ),
    ).toBeTruthy();
```

Leave the download and import assertions in that test as they are.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/finish-handoff.test.ts src/App.test.tsx`

Expected: FAIL. The context still toasts `Essay saved, and the score request was exported.` with no following sentence. The mock toast literals are already present; the new export sentences are not.

- [ ] **Step 3: Write the minimal implementation**

In `src/context/FieldbookContext.tsx`, replace only the `toast(...)` call that follows `navigate('/review')` with:

```tsx
      toast(
        exportForReview
          ? speaking
            ? 'Saved, and the score request was exported. Score it outside Fieldbook, then import the scored file.'
            : 'Essay saved, and the score request was exported. Score it outside Fieldbook, then import the scored file.'
          : speaking
            ? 'Saved.'
            : 'Essay saved.',
      );
```

Leave `navigate('/review')`. Leave the writing-mock toast `Task 1 is saved. Task 2 is next, 40 minutes.` and the speaking-mock toasts `Part 1 is saved. Part 2 is next.` and `Part 2 is saved. Part 3 is next.` Do not add the outside-score sentence to those three.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/finish-handoff.test.ts src/App.test.tsx`

Expected: PASS. `tests/finish-handoff.test.ts` has 1 test. `src/App.test.tsx` stays green, including the export toast.

- [ ] **Step 5: Commit**

```bash
git add src/context/FieldbookContext.tsx src/App.test.tsx tests/finish-handoff.test.ts
git commit -m "feat(save): tell a normal export to score the file outside Fieldbook"
```

---

## Spec coverage

Slice 1 sentences, buttons, and toasts are Tasks 1–3. The header Import score button is unchanged. Slices 2, 3, and 4 are not in this plan. Slice 3 will replace the speaking Finished sentence from Task 2; do not write that longer sentence here.
