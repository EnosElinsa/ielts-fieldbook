# Actionable study planning

## Configure a study week

Open **Settings → Study time** to set the global daily budget, enabled weekdays, weekday minute overrides and focus modules. Blank weekday minutes inherit the global budget; zero minutes creates a rest day.

Choose fixed vocabulary minutes or a percentage of each day. New accounts default to 20%; existing accounts retain an explicit legacy reservation of up to ten minutes. When no learning batch or due recall is available, the planner assigns that time to the other modules.

Set task block minutes and choose whether to split practice into multiple tasks. **Prefer full responses** allocates complete writing blocks before a shorter remainder when enough time is available. Module weights live in **Settings → Skills**; zero excludes a module from balanced automatic scheduling, while a weekday focus prioritizes the selected module.

Before saving, the preview shows affected tasks, the generated seven-day schedule and minutes by module. Preview and saving use the same planner with the full current schedule. Saving regenerates eligible automatic tasks through the existing account save queue. Started, completed, skipped, manually edited and frozen assessment tasks remain protected. Previous completion records and material bindings are retained.

## Edit the schedule

Each calendar day has **Add task**. Each task offers replacement, duration editing, duplication, rescheduling, ordering and skip/restore actions as applicable to its status. Replacement and duration editing require an unstarted task.

The shared editor supports module, practice, minutes and specific question/section/sentence/vocabulary group and batch. Recommended material remains available. Reading and listening question counts follow the selected time budget; full writing responses and mocks enforce their required duration.

The editor displays the destination day's existing load, resulting total and remaining or extra minutes. Over-budget changes require checking **Keep extra … minutes**. Failed saves retain the current inputs and allow retry. Manual changes are marked **Edited** and protected from future automatic rebuilds.

## Recover missed days

The seven-day window places older unfinished tasks before generating new work. Completed tasks and future manual arrangements keep their places. Started older tasks have priority over unstarted ones; remaining tasks use their original date order. Automatic carryover respects study days, total minutes and vocabulary time, and does not split a task or modify its learning evidence. A task too long for any available day stays in the collapsed waiting list. Protected future manual, started or frozen allocations remain intact after a budget reduction, even if that leaves existing overtime; automatic placement adds no further overtime.

Unstarted historical vocabulary review snapshots are merged and replanned from current memory state. Started reviews retain their exact targets and drafts. Future review slots reserve prompt capacity and choose their words when opened, so they do not repeatedly freeze the same overdue words. Actual review work uses the vocabulary budget before new-word learning.

Use the backlog actions to preview rearranging or bulk skipping. Started work requires an explicit selection for a bulk skip. The preview lists affected tasks and dates; the save is transactional and retryable. Skipped records and drafts remain available, and no skip is counted as learning. Rearranging a task never moves its words' FSRS dates. See [vocabulary learning rules](vocabulary-learning-rules.md) for the exact mastery and review semantics.

## Unified select controls

Use `SelectField` for form fields and `FilterMenu` for toolbar filters. Both use the same Radix Select, styles and keyboard behavior. `SelectField` accepts either `options` with `onValueChange` or existing option children with `onChange`.

Popup content is portaled to the body and positioned relative to the trigger in viewport coordinates. It prefers the bottom side and handles viewport collisions, scrolling and resizing. Dates retain the specialized date picker.

## Validation scope

Browser checks use an isolated local account fixture with external requests blocked. They exercise the real rendered app and save queue without changing remote account records. This change requires no database migration. Production publication is verified separately through GitHub Check and Cloudflare Pages for the release commit.

Verified on October 14, 2026:

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
- Final browser console checks showed no application warnings or errors. Screenshots and local verification logs are kept outside the repository in the task's Codex visualization directory.
- Final verification: `npm test -- --maxWorkers=2 --testTimeout=30000` passed all 200 files and 7269 tests; one existing archive-resource test was skipped because `LEGACY_VOCABULARY_RESOURCE_DIRECTORY` was not configured. `npm run build`, `npm run test:identities` and `git diff --check` passed. Test and build verification ran separately to avoid resource contention in the retained-corpus determinism test.
