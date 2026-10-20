# Actionable study planning

## Configure a study week

Open **Settings → Time and modules** to set the global daily budget, enabled weekdays, weekday minute overrides and focus modules. Blank weekday minutes inherit the global budget; zero minutes creates a rest day. The six settings groups also cover Learning goals, Scheduling and overdue, Vocabulary sources and balance, Practice and audio, and Appearance and account. Legacy settings URLs still open their corresponding group; one draft survives category changes.

Under **Vocabulary sources and balance**, choose fixed vocabulary minutes or a percentage of each day. New accounts default to 20%; existing accounts retain an explicit legacy reservation of up to ten minutes. After protected tasks, the planner reserves time for the daily new-word target (default 10, including 0 to pause), then adds reviews. It shows the actual quantity and shortfall when time is limited. When no vocabulary work is available, the planner assigns that time to the other modules.

Set task block minutes and choose whether to split practice into multiple tasks. **Prefer full responses** allocates complete writing blocks before a shorter remainder when enough time is available. Module weights live in **Time and modules**; zero excludes a module from balanced automatic scheduling, while a weekday focus prioritizes the selected module. Leaving all four skills unchecked creates a vocabulary-only plan.

New words follow enabled wordbooks, book order, group order and the next unfinished position. Users can reorder or pause books, or rotate after each batch. Shared entry identities prevent the same word from becoming a new word in another book. New automatic tasks can reserve an exact partial list; old fixed batches, started tasks and history retain their original requirements. Home and Planning share this selector.

Before saving, the preview shows affected tasks, the generated seven-day schedule and minutes by module. Preview and saving use the same planner with the full current schedule. Saving regenerates eligible automatic tasks through the existing account save queue. Started, completed, skipped, manually edited and frozen assessment tasks remain protected. Previous completion records and material bindings are retained.

## Edit the schedule

Each calendar day has **Add task**. Each task offers replacement, duration editing, duplication, rescheduling, ordering and skip/restore actions as applicable to its status. Replacement and duration editing require an unstarted task.

The shared editor supports module, practice, minutes and specific question/section/sentence/vocabulary group and batch. Recommended material remains available. Reading and listening question counts follow the selected time budget; full writing responses and mocks enforce their required duration.

The editor displays the destination day's existing load, resulting total and remaining or extra minutes. Over-budget changes require checking **Keep extra … minutes**. Failed saves retain the current inputs and allow retry. Manual changes are marked **Edited** and protected from future automatic rebuilds.

## Recover missed days

Planning uses Schedule, Waiting and History. The seven-day window places eligible older unfinished tasks before generating new work. Automatic carryover defaults to at most 30% of each day's budget and also respects study days, remaining total time, module time and indivisible task size. Change the allowance under **Scheduling and overdue**. Protected future manual, started or frozen allocations remain intact after a budget reduction, even if that leaves existing overtime; automatic placement adds no further overtime. Tasks that cannot fit remain in Waiting with a reason.

Only unstarted automatic dynamic reviews can merge and reselect from current memory state. Manual tasks, exact fixed lists and started tasks retain their targets. Future dynamic slots reserve prompt capacity and freeze their words when opened. Reviews prioritize confirmed mistakes, recovery, valid mode-specific due schedules, foundation gaps and spaced consolidation. A completed, submitted graded attempt finishes a task even if some answers are wrong; mastery and mistake recovery remain separate.

Waiting supports today, a selected date, capped automatic replan, hold, resume and skip. Started work is excluded from bulk selection until explicitly enabled. Waiting and History show 20 items per page, total counts and target-page deep links. Selecting this page differs from selecting all filtered results. Each bulk action previews both selected tasks and related schedule changes before the atomic save.

History filters completion, user skips, system decisions and archives by date, module, origin and reason. Archive skipped results hides records recoverably and retains their identity so automatic generation cannot recreate them. Unarchiving only restores visibility; restoring a skipped task for execution requires a date. No skip counts as learning, and rearranging never changes FSRS due times. See [vocabulary learning rules](vocabulary-learning-rules.md) and the [unified implementation ledger](unified-learning-implementation.md) for remaining loading and verification work.

## Unified select controls

Use `SelectField` for form fields and `FilterMenu` for toolbar filters. Both use the same Radix Select, styles and keyboard behavior. `SelectField` accepts either `options` with `onValueChange` or existing option children with `onChange`.

Popup content is portaled to the body and positioned relative to the trigger in viewport coordinates. It prefers the bottom side and handles viewport collisions, scrolling and resizing. Dates retain the specialized date picker.

## Validation scope

Browser checks use an isolated local account fixture with external requests blocked. They exercise the real rendered app and save queue without changing learner records. The October 20 unified change requires the planning conflict-guard and schedule-baseline migrations; both compatibility layers were installed before frontend publication. Exact-commit publication and final test evidence are tracked in the unified ledger.

Historical verification on October 14, 2026 (not evidence for the current uncommitted change):

- `npm test -- --maxWorkers=2 --testTimeout=30000`: 133 suites passed, 1119 tests passed, one existing archive-resource test skipped because `LEGACY_VOCABULARY_RESOURCE_DIRECTORY` is not configured.
- `npm run build`: identity consistency check, TypeScript project compilation and Vite production build passed.
- `git diff --check`: passed. No native application `<select>` elements remain in `src`; Radix manages its own hidden form control.
- Real Chrome checks at 320px, 390px and 1440px in both themes: no horizontal overflow; replacement popup anchored below its trigger; modal remains open after selection; specific material choice, over-budget confirmation, add/persist/reload and weekday settings save-failure/retry passed with no browser errors.
- Unit regressions cover keyboard selection, Escape, outside-pointer dismissal and returned focus, including the vocabulary workbench focus interaction.
- Independent review identified full-response allocation and resize minimum inconsistencies; both were corrected and verified. The final review found no further actionable regressions in the reviewed changes.

Local test/build logs are under `local/`. Browser scripts, screenshots and `qa.json` are stored outside the repository under the task's Codex visualization directory.

Vocabulary and backlog recovery checks on October 19, 2026 used an isolated local account with external connections blocked:

- A legacy 56-prompt review retained two meanings of the same word, ignored the saved 20-word/shuffle preferences, restored answers after refresh, and submitted all 56 exact targets correctly.
- Planning and Today returns retained the source query, focused the original task, and showed its completed state. Settings and refresh preserved the planned assessment. Delayed starts preserved intervening navigation.
- Bulk skip/replan previews retained started-work opt-in. Restoring merged Recall history placed the task within the daily budget. Oversized tasks remained waiting, with drafts and material preserved.
- Free setup passed 320px, 390px and 1440px checks in light and dark themes, with no horizontal overflow. The three desktop controls aligned at 44px height and stacked on mobile. Keyboard Enter, Escape and focus return worked; Advanced options started collapsed.
- Manual Recall Add/Replace persisted valid numeric budgets and started their selected targets. Reducing a dynamic review from three minutes to two also reduced its actual session to two distinct words. An empty dynamic review showed No review remaining, restored successfully, and started after eligible content became available. Reload retained exact targets.
- Final browser console checks showed no application warnings or errors. Screenshots and local verification logs are kept outside the repository in the task's Codex visualization directory.
- Final fix verification: 15 affected files and 372 tests passed, and independent re-review confirmed all five final findings addressed without new findings. The complete 200-file suite ran with both two workers and one worker: 199 files and 7287 tests passed, one existing archive-resource test was skipped because `LEGACY_VOCABULARY_RESOURCE_DIRECTORY` was not configured, and the unchanged content-addressed resource determinism test exceeded its explicit 15-second limit. Its separate file rerun passed 14 tests with one skip, including determinism in 14.153 seconds under the same limit; the full command is therefore recorded as having one timing failure, not as green. `npm run build`, `npm run test:identities` and `git diff --check` passed. Build and test runs were separate, and no assertions or timeout limits were changed.
