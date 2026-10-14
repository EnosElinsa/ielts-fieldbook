# Actionable study planning

## Configure a study week

Open **Settings → Study time** to set the global daily budget, enabled weekdays, weekday minute overrides and focus modules. Blank weekday minutes inherit the global budget; zero minutes creates a rest day.

Choose fixed vocabulary minutes or a percentage of each day. New accounts default to 20%; existing accounts retain an explicit legacy reservation of up to ten minutes. When no learning batch or due recall is available, the planner assigns that time to the other modules.

Set task block minutes and choose whether to split practice into multiple tasks. **Prefer full responses** allocates complete writing blocks before a shorter remainder when enough time is available. Module weights live in **Settings → Skills**; zero excludes a module from balanced automatic scheduling, while a weekday focus prioritizes the selected module.

Before saving, the preview shows affected tasks, the generated seven-day schedule and minutes by module. Saving regenerates eligible automatic tasks through the existing account save queue. Started, completed, skipped and manually edited tasks remain protected. Previous completion records and material bindings are retained.

## Edit the schedule

Each calendar day has **Add task**. Each task offers replacement, duration editing, duplication, rescheduling, ordering and skip/restore actions as applicable to its status. Replacement and duration editing require an unstarted task.

The shared editor supports module, practice, minutes and specific question/section/sentence/vocabulary group and batch. Recommended material remains available. Reading and listening question counts follow the selected time budget; full writing responses and mocks enforce their required duration.

The editor displays the destination day's existing load, resulting total and remaining or extra minutes. Over-budget changes require checking **Keep extra … minutes**. Failed saves retain the current inputs and allow retry. Manual changes are marked **Edited** and protected from future automatic rebuilds.

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
