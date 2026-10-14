# Manual Test Fixes and Learning Workflow Completion

Baseline: b2584e7. User-approved specification: the twelve issues in
`local/maunal-test-2026-10-14.md` and the implementation plan approved in chat.

## Delivery 1: reliability

- Isolate speaking audio, transcript, timers and saves by owner/topic/part/prompt.
- Save each prompt; complete ordinary groups and mock stages only after all scoped
  prompts are saved. Targeted single-prompt work retains its narrower scope.
- Preserve legacy topic records and offer explicit prompt association.
- Provide scoped save statuses, no-op guards, 20-second abortable draft RPCs,
  idempotent retries and local recovery.
- Use accessible application confirmations, except native browser beforeunload.
- Verify real recording playback, compact fallback, retries and downloads.
- Fix themed planning controls; show active/today tasks and explicit overdue work.
- Add blind original-sentence playback inside intensive step three without
  weakening full-playback completion requirements.

## Delivery 2: practice workspaces

- Ordinary practice defaults to integrated question/answer layout; mock defaults
  to split layout. Remember ordinary preference per skill.
- Render listening gaps in original source HTML where supported. Split layout
  shows real question material. Reading keeps its passage available alongside
  question/answer material, with mobile panel navigation.
- View changes retain the same answers, attempt, focus, timing and audio.
- Submission controls occupy their own space and cannot cover the last answer.
- Checked answers and result review expose imported and original explanations,
  explicit missing states, and passage/sentence evidence navigation.

## Delivery 3: annotations and source vocabulary

- Selection-near and accessible highlighter/note/vocabulary/evidence controls.
- Source-owned, account-isolated cloud annotations persist across attempts and
  devices. Attempt evidence remains separate. Store robust quote/context/offset
  anchors; ambiguous or stale anchors remain accessible without false placement.
- Part results provide saved vocabulary and deterministic vocabulary candidates
  from authorized original content, explanations and the existing dictionary.
- Lazy dictionary senses require user confirmation before adding. No AI service.
- Deduplicate entries while preserving occurrences; filter review by exact source,
  and navigate back to the original paragraph or sentence. Only review advances FSRS.
- Mock permits highlights/notes but no lookup, explanations or evidence assistance
  before submit. Listening transcript vocabulary follows existing reveal rules.

## Storage and acceptance

- Keep topic questionId; add optional prompt identity/snapshot and bound prompt
  sets. Do not recompute completed legacy plans or silently assign old recordings.
- Add examAnnotations/exam_annotations through additive migration, RLS, atomic
  workspace commit, recovery, backup, conflict handling and account deletion.
- Verify prompt switching/reload/account boundaries/delayed callbacks/timeouts,
  real recording and intensive segment playback, complex source HTML, view-switch
  continuity, mobile/zoom/footer clearance, cross-device annotations and source review.
- Each delivery runs focused tests and complete CI/build/bundle checks. Deploy
  compatible database changes before frontend and verify preview then production.
