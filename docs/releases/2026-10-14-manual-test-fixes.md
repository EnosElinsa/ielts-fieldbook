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

Release verification is in progress. Exact delivery/release commits, complete CI,
browser acceptance, deployment and disposable-account cleanup will be recorded
here after confirmation; this document does not claim a published release yet.
