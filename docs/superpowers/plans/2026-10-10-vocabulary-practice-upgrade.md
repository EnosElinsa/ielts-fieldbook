# Vocabulary Practice Upgrade

Goal: make vocabulary study suitable for daily repeated use, including list dictation, automatic playback, a single session submission, feedback timing, exit/recovery and account preferences.

## Decisions

- Default dictation uses a 20-item list with automatic UK audio and answers revealed after final submission. A focused card layout and immediate local feedback remain selectable.
- No per-question cloud-save command. Answers are saved as an account-scoped local draft; a completed session is committed atomically with stable event IDs and can retry without duplicate learning credit.
- Exit offers keep progress, discard or cancel. Navigation stops playback. Session restoration retains entered answers and respects account changes.
- Practice preferences live in profile settings: mode, layout, feedback timing, session size, order, accent, automatic playback/advance, repetitions, speech rate, volume and audio gaps/examples.
- Settings apply to new sessions; audio controls can change current playback without altering frozen grading inputs.
- All objective modes share a session/results workflow. Sentence production remains pending or explicitly self-reported. Playback never increases mastery.
- Imports use a custom English file picker and clear validation/save retry states instead of an OS-localized native control.

## Work Ledger

- [x] Inspect production code and reproduce the repeated reveal/save/next workflow. Baseline: 214 passing tests.
- [x] Domain preferences, session preparation, grading, stable IDs, audio engine and account-scoped recovery.
- [x] Session UI, list/focused views, automatic playback, exit/recovery, results and preference controls.
- [x] Atomic session RPC, account isolation, persistence, backup and progress integration.
- [x] Shared settings and import file-control polish.
- [x] Focused/full tests, desktop/mobile browser verification and final review.
- [ ] Apply additive session migration, merge to master and verify deployment checks.

## Acceptance

Typed answers remain concealed until the chosen feedback point. Whole-list submission records each card once; errors never discard the response or duplicate a review on retry. Pausing/exiting/navigation cancels speech, audio and timers. Preferences survive account reload and are validated. Mobile/dark layouts fit without overflow. Native file-control language does not appear in the import UI.

## Verification, 10 October 2026

- Continued the existing `codex/vocabulary-practice-upgrade` worktree without rebuilding the completed vocabulary release or repeating personal imports.
- Fixed the settings test's unstable mock reference, which caused an infinite effect/render loop and the earlier heap exhaustion.
- Independent review identified and verified fixes for cross-session history after a lost response, autoplay disabled in audio sessions, and concurrent writing autosave overwriting saved preferences.
- `npm test`: 47 files, 274 tests passed. `npm run build`: passed; the existing main bundle size warning remains.
- Standalone PostgreSQL checks passed for rollback, replay, immutable history, collection validation, ownership, timestamps and account deletion cascade.
- Applied `20261010170000_vocabulary_sessions` to production after a private backup; table, RPC, three account policies, RLS and migration registration verified.
- Authenticated Playwright checks covered the 20-row list, concealed answers, keep/resume, settings locks, focused Enter navigation, 1440×1000 desktop and 390×844 mobile/light/dark. No runtime errors or page overflow. Submission/results rendering uses an intercepted RPC to avoid adding synthetic reviews to the real account.
