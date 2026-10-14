# Manual test fixes and source learning release

Baseline: `b2584e7`. Approved scope: the twelve October 14 manual-test findings
and the three deliveries in `docs/superpowers/plans/2026-10-14-manual-test-fixes.md`.

## Delivered behavior

1. Application confirmations replace browser confirm dialogs for destructive
   editing actions. Native browser-close protection remains.
2. Speaking drafts, recordings, playback and timers belong to an individual
   prompt. Group and mock progression require the bound prompts to be saved.
   Legacy topic records remain available for explicit prompt association.
3. Draft states distinguish unsaved, pending, saving, saved and failed. Cloud
   requests abort after 20 seconds; local recovery and idempotent retries remain.
4. Recorded audio has stable waveform space and native playback/download/retry
   fallback. Intensive stage three directly plays the original sentence blind;
   pause, seek, sentence change and full-track listening cannot earn completion.
5. Planning uses themed controls. Today links an active or overdue task to its
   exact identity and displays the original date.
6. Practice supports integrated and split question/answer layouts with a shared
   attempt, answers, audio and timer. Mocks default to split; normal preferences
   are per skill. The submission footer occupies normal document space.
7. Checked answers and submitted results expose imported English and original
   explanations, explicit missing states, and source evidence links. Existing
   imported explanations are retained without another bulk import.
8. Source highlights and notes persist by account and material across attempts.
   Nearby selection tools support color, notes, vocabulary and answer evidence.
   Unresolved changed/ambiguous text remains in the notes list without placement.
9. Submitted Parts offer saved vocabulary and deterministic dictionary candidates.
   Meanings load by term, require explicit selection, and preserve distinct source
   occurrences. Collection alone does not advance review evidence or FSRS.
10. Exact Part review uses existing vocabulary modes and FSRS. Entry and review
    results return to original paragraphs, question/stimulus blocks or listening
    sentences. Mock helpers and unrevealed listening transcripts remain gated.

## Compatible storage

State version 13 adds `examAnnotations`. Migration
`20261014120000_exam_annotations.sql` adds an account-owned table with RLS,
account-deletion cascade, keep-newer conflict handling and workspace RPC support.
It was applied and registered before frontend publication. Existing speaking
`questionId` stays topic-level, with optional prompt identity/snapshot added.
Completed historical tasks are not recalculated.

A complete 35-table pre-migration backup is kept outside the implementation
worktree. The updated backup tool includes the new table. Frontend rollback
must retain the compatible database table, identity functions and user data.

## Acceptance and release

| Delivery | Commit | Independent complete tests | Remote CI |
| --- | --- | --- | --- |
| Recording, saves and study workflow | `dadcf2a` | 1,025 passed, one skipped | Run `38537012816`: passed |
| Practice workspaces and source annotations | `fdeb632` | 1,070 passed, one skipped | Run `38543851457`: passed |
| Part vocabulary and source review | `5ccb9ac` | 1,087 passed, one skipped | Run `38544703022`: passed |

Each independent index export also passed production build, identity/SQL checks
and bundle budgets. Delivery three's login JavaScript is 185,402 compressed bytes
across three assets; its largest JavaScript asset is 385,602 bytes.

Actual browser acceptance used original reading/listening sections, complex
matching/gap/diagram material, desktop/mobile viewports and 200% zoom. Switching
layouts preserves answers and the same audio playback. Last-answer controls
remain visible with a static submission footer. Source notes restore in an
independent same-account browser; another account cannot read or insert them.
The annotation workspace RPC supports idempotent replay.

A native MediaRecorder generated a 471,704-byte WebM recording from a real
browser MediaStream. Its uploaded recording plays from the cloud; prompt B's
transcript saves and restores independently of A. Forced WebAudio decoding failure
retains native playback/download, and retry restores the waveform. Intensive
stage three earns completion only after the actual hidden original segment ends;
pause, seeking and sentence switching were exercised. Physical phone keyboards
and a physical microphone were not used in this browser acceptance.

Vocabulary acceptance confirms explicit sense selection, one reused entry with
ten distinct source occurrences, exact-Part review and paragraph/question-block
backlinks. Collection does not create mastery or review evidence. Direct source
routes retain the listening reveal boundary and mock assistance restrictions.

The final independent whole-branch review found two P2 integration gaps: cold
result pages did not load the saved vocabulary module, and intensive backlinks
did not carry the same-Part active-mock lookup restriction. Both are release
blockers. The combined correction hydrates saved vocabulary with loading, retry
and owner guards, and carries the shared cloud/local mock policy into intensive
lookup and its live callback. Scoped re-review, final complete checks, production
publication and disposable-account cleanup remain pending.

## Implementation decisions

- Keep all product UI English, following the existing project requirement.
- Use deterministic local dictionary matching and explicit senses; no AI service.
- Retain public imported explanations and display missing ones explicitly rather
  than running another catalogue import.
- Preserve historical completed tasks and topic-level legacy recordings. Associate
  legacy recordings with a prompt only through an explicit user action.
- Resolve source positions only when quote/context matching is unique; retain
  unresolved notes in the list rather than placing them at an uncertain location.
- Apply cloud and account-scoped local mock recovery together when gating helper
  routes, including mocks started before their first autosave.
