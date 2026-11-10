# Linked vocabulary capture and listening feedback

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent exam tasks; execute the vocabulary integration in this session. Keep all work in the current task branch.

**Goal:** Show every accepted exam answer, make intensive-listening diagnosis specific, and collect selected text into existing vocabulary identities and meanings.

**Architecture:** Keep exam grading unchanged. Preserve historical diagnosis strings and add optional notes. Resolve vocabulary against saved entries, a small released term index and dictionary meanings; save existing identities and selected meanings with new source occurrences. Unknown words remain personal entries in My words, with incomplete meanings excluded from assessments.

**Tech stack:** React, TypeScript, Vitest, existing Supabase JSON persistence and released vocabulary resources.

**Spec:** The approved design is recorded below in this file; the user requested implementation on November 9.

## Approved design and constraints

- Display explicitly accepted answer variants; multiple-choice combinations remain combinations. Do not change grading or infer accepted plurals.
- Group listening diagnoses into sound recognition, language knowledge, writing, listening pace/attention, and Other with an optional note. Keep old saved choices and notes across reload/history.
- A saved word/meaning gains a source occurrence without replacing personal content or learning state. A new meaning belongs to the same word and has its own learning state. A missing word becomes a personal entry, with no new wordbook created.
- Keep the exact original selected quote, text positions, sentence/paragraph and source backlink. Suggest dictionary forms, but require a visible choice before changing a selected form.
- Keep the collection dialog compact: term, matched meanings, source context, definition/example for personal meanings, and advanced fields behind a disclosure.
- Save failures retain edits and can retry; stale lookup/account responses cannot replace current edits or save into a changed account.
- Saving alone creates no assessment evidence or due dates. Missing definitions are visibly pending and cannot generate empty assessment prompts.
- Preserve stable public resource URLs and existing account schema. Use synthetic browser data only. Commit and publish after checks, under the session's existing authorization.

## Task 1: Accepted answer display

Files: `src/features/exam/ExamReviewPage.tsx`, a focused answer presentation helper/component, and focused tests.

- [x] Add a regression for `answer: 'locker', alternatives: ['lockers']`; assert both appear under Accepted answers while the learner's own response stays separate.
- [x] Run the new test and confirm the old rendering fails.
- [x] Implement deduplicated answer variants using grading normalization; label a required multiple-choice set separately.
- [x] Run focused answer and review tests. Self-review grading compatibility.

```ts
expect(acceptedAnswerVariants({ answer: 'locker', alternatives: ['lockers', 'LOCKER'] })).toEqual(['locker', 'lockers']);
```

## Task 2: Intensive diagnosis

Files: `src/features/exam/IntensiveWorkbenchPage.tsx`, a focused diagnosis component, `src/domain/exam/types.ts`, `src/domain/exam/intensive.ts`, related tests and styles.

- [x] Add tests for grouped multi-selection, Other notes, legacy choices and restart/history preservation.
- [x] Run new tests red, implement additive fields and grouped accessible controls, and run green.
- [x] Verify diagnosis remains optional and cannot change a recorded dictation score.

```ts
expect(restarted.reviewHistory?.at(-1)?.errorNote).toBe('I lost the word boundary.');
expect(restarted.errorNote).toBe('');
```

## Task 3: Vocabulary lookup and collection

Files: `scripts/vocabularyResources.ts`, `src/storage/vocabularyCatalog.ts`, `src/features/vocabulary/VocabularyModal.tsx`, focused lookup/collection modules, vocabulary domain helpers, My words view, related tests/styles.

- [x] Test released exact-term lookup without downloading unrelated entry bodies, including failure/retry.
- [x] Emit a separate hashed term index and resolve selected entries through existing scoped entry loading.
- [x] Test an already saved personal meaning gains only a source; selected public meanings retain entry/sense identity; a custom new meaning preserves existing ones.
- [x] Implement lookup with stale-response protection, saved/public/dictionary choices and explicit inflection suggestions. Keep lookup failure distinct from no matches and retain a manual fallback.
- [x] Test modal collection/save failure/retry, account change and edits surviving late lookup results.
- [x] Implement compact selection versus personal entry modes, collapsed advanced fields, and collection destination/pending guidance.
- [x] Show pending meanings in My words and keep blank meanings out of generated assessments.
- [x] Run vocabulary domain, storage resource, modal and existing workflow regressions.

```ts
expect(saved.vocabulary).toHaveLength(1);
expect(saved.vocabulary[0].sources).toHaveLength(2);
expect(saved.vocabularyStates).toEqual(before.vocabularyStates);
```

## Task 4: Review and release

- [x] Review the integrated diff for identity, personal-content, provenance, stale response and grading risks; fix findings and recheck.
- [x] Run production build and required bundle/resource/identity checks.
- [x] Use existing Playwright/Chromium (Browser plugin absent) at desktop and 390/320px, light/dark: variants, diagnosis reload, exact/suggested/custom collection, pending definition, save failure/retry and source return.
- [ ] Record validation in `docs/interface-polish.md`, commit and publish. Verify full CI, deployed entry/resource hashes and synthetic production interaction flows.

## Progress and rulings

Initial checkout was clean at `1262e9b`; work branch is `codex/linked-vocabulary-capture`. The user approved the design and implementation; no further approval checkpoint is required for routine choices or the already authorized release.
