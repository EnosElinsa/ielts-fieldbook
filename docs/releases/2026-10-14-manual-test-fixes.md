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
| Final integration corrections | `6cce90c` | 1,096 passed, one skipped | Branch `38547424344` and master `38547869191`: passed |

Each independent index export also passed production build, identity/SQL checks
and bundle budgets. The final build's login JavaScript is 185,403 compressed bytes
across three assets; its largest JavaScript asset is 385,602 bytes.

Actual browser acceptance used original reading/listening sections, complex
matching/gap/diagram material, desktop/mobile viewports and 200% CSS zoom. Switching
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
lookup and its live callback. The independent scoped re-review approved both
corrections and found no new blocker. Original probes and real preview acceptance
both confirm the correction; the final exact-tree complete checks passed.

## Production acceptance

`master` was fast-forwarded from `b2584e7` to the reviewed `6cce90c`. Its accepted
tree is `5ced8279a89f79a6885fddde0cd16f77b143ccdf`. The exact-commit Cloudflare
deployment passed, and production's public HTML entry assets match the accepted
preview byte-for-byte (SHA256 verified):

- Accepted preview: https://c8db2f6e.ielts-fieldbook.pages.dev
- Production deployment: https://c2befb3f.ielts-fieldbook.pages.dev
- Production: https://ielts-fieldbook.pages.dev

Production browser checks verified a cold result page showing existing saved
vocabulary and its Part-review link. Selecting another explicit sense reused the
same word, kept its original source occurrences, and added only an unreviewed
state; existing FSRS state, evidence and review history were unchanged. Exact-Part
review filters the selected source, and backlinks automatically focus the correct
paragraph in view.

A new native MediaRecorder recording was uploaded through the production speaking
UI (483,296 bytes), saved with prompt B's transcript and question snapshot, then
played after reload. Prompt A's original attempt and recording remained separate;
the second account could not download either owner's protected recording. Source
annotation RLS, cloud edit, fresh-read restoration and idempotent commit replay
were rechecked against the deployed database.

Two disposable accounts were deleted after acceptance. Their three recording
objects were removed, all 21 private account-dependent tables were checked for
empty cascades, and both recording prefixes were empty. The browser QA session
was closed. Pre- and post-release backups and private verification reports are
retained under gitignored `local/manual-test-release-2026-10-14/` in the primary
checkout; credentials and session files are excluded from the acceptance archive.
The post-release backup verified all 36 tables and their file SHA256 checksums.

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
