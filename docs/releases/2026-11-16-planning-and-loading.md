# Planning, listening diagnosis and loading states

Untouched automatic learning reservations now regenerate from actual progress,
the daily word goal and available time. Missed reservations retain their original
selections in History as **Learning replanned**, while their unlearned words return
to the current allocation. Manual, edited, restored and started selections retain
their requirements. Schedule excludes skipped history. A source group ending or
a limited daily budget can still produce a smaller batch.

The shared loading component now follows the page width and uses a quiet animated
indicator, a single sweep over decorative placeholders, and matching Planning and
Today layouts. Reading and listening routes also select their appropriate layout
during lazy loading. Account initialization shows one full-page loader even when
question data is cached. Delayed dialogs open inside the dismissible dialog frame.
The sign-in session check uses the same indicator and offers a real retry after
ten seconds. Reduced motion disables loading animations; skeletons have no
interactive controls or invented progress percentages.

Listening diagnosis uses category rows with wrapping choices, then stacks each
category above its choices in narrow containers. The original choices, notes,
saved progress and keyboard behavior are preserved.

## Database

Migration `20261116120000_learning_replan_history.sql` classifies the new system
reason separately from learner skips. It was applied and registered before the
frontend release, following a verified backup of all 36 tables and the previous
function definition. Transaction checks confirmed unchanged plan rows, invoker
security and execution grants. Authenticated API checks confirmed both filters
against temporary test records. No catalogue migration or seed is required.

## Verification

- The local full suite covered 243 files. Its new boot-loader assertion initially
  selected both the existing screen-reader heading and the visible heading; the
  selector was corrected and all 35 affected component tests passed on rerun.
- The existing resource determinism test exceeded its 45-second limit in the full
  run. After stopping concurrent browser work, its complete file passed 16 tests
  with one existing archive fixture skip, including determinism in 44.265 seconds.
  No assertion or timeout was changed.
- Authentication tests passed all 11 cases, including a stalled session retry.
- Workspace SQL, vocabulary identity, dictionary and vocabulary quality checks
  passed. Private reports remain under gitignored `local/`.
- Real Chrome checks used a temporary Supabase account: both themes at 1440, 390
  and 320 pixels; all eight loading layouts; reduced motion; slow and failed
  request retries; dialog Escape dismissal; and successful Planning hydration.
  No horizontal overflow or application error occurred in the Planning cases.

The PR checks and Cloudflare Pages deployment must succeed for the final commit.
Production verification must check the published assets and account workflows.
