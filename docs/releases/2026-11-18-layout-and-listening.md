# Study layouts and linked-task requirements

## Problems and acceptance

The learner's screenshots showed five vocabulary layouts and two listening
layouts. These confirmed presentation problems; they do not justify changing
grading, learning targets, source content or the scheduling model.

| Finding | Cause and user impact | Change and acceptance |
| --- | --- | --- |
| Results leave most of the Word column empty | Intrinsic table sizing expands long source links, while definitions have a 240px cap. Answers become difficult to compare. | Bound the desktop columns to 38/19/19/14/10 percent. Let definitions and sources wrap. Stack cells according to the results container's width, with real text labels for each field. |
| Six wordbooks form five cards and an orphan | General auto-fit styles can override the intended three-column grid. Actions and descriptions have unrelated heights. | Scope the grid to the vocabulary workbench: three columns on desktop, two on tablet and one on mobile. Subgrid aligns header/content/footer with an explicit-row fallback. Keep navigation and study actions separate. |
| Recommended practice is excessively tall | The saved meaning, recommendation, primary action and supporting disclosures all use a single vertical flow. | Separate the saved meaning from its next exercise on wide screens. Keep the primary action beside its explanation and use one column on narrow screens. |
| History pagination is crowded | The vocabulary route depends on a Planning pagination class whose stylesheet is loaded separately. | Give vocabulary pagination its own wrapping layout and 44px controls. Preserve server pagination and read-only history projections. |
| Future plans dominate review setup | Every pending review renders before the self-directed configuration. | Show at most two ready reviews initially. Keep further ready reviews and upcoming reviews in keyboard-accessible native disclosures. No tasks are removed. |
| Linked task opens an unfocused history collection | The result link selects the completed task's collection rather than its requirements. | Open a single-task view with date, exercise, selection, source, completion condition and current status. Read full tasks on demand, retry failures, and preserve the task view when returning from practice. Existing anchor-only links retain their collection behavior. |
| Listening notes are difficult to read | A wide integrated sheet, weak section hierarchy and equal split columns make text and inputs hard to scan. | Cap integrated content at 1000px, distinguish section headings and question numbers, give split questions more width and add visible layout labels. Keep table inputs fluid within their cells and preserve source annotation identities. |
| Printed bullets run into words (`·a`, `·best`) | The import stores bullet characters directly in text, and hanging indentation cannot add space between the marker and the word. | Render recognized note lines as native lists, with nested lists for dash subitems. Retain printed markers in hidden source text so block IDs and saved annotation offsets remain valid. Leave prose punctuation and table-cell content alone. |

All findings have high confidence from source inspection and rendered synthetic
fixtures. The exact spacing and density remain product design choices. Changes
are limited to presentation and navigation; no dependency, schema migration,
catalogue reimport or history mutation is required.

## Implementation

The result link uses `/planning?view=task#task-<id>`. Planning continues to load
missing full task rows through the existing account-guarded reader. It does not
promote history projections into writable entities. Schedule/Waiting/History
remain available, and the study return URL preserves this new view.

Listening source HTML, text offsets, block identifiers and content hashes are
unchanged. Printed note markers use the existing annotation-safe hidden-prefix
mechanism; visual spacing comes from native list markers. Responsive layout
rules do not reorder interactive controls. The
existing answer, annotation, timer, audio and save/recovery controllers remain
responsible for their state.

Modern Web Guidance was searched for responsive tables, card alignment and form
organization and text lists, and its responsive-table, card, css-layout, forms,
accessibility and html
guides were read before implementation. Applied patterns include container-aware
result layouts, semantic card actions, subgrid with a fallback, native
disclosures, semantic note lists and explicit accessible field labels.

## Validation

The functional regressions were reproduced before their fixes: linked-task
requirements were absent, future reviews were always visible, and the study
return helper replaced `view=task` with `view=schedule`. Regression assertions
cover the corresponding behaviors and failed-read retry. The cramped-bullet
regression also failed before the fix; it now checks native/nested lists, the
unchanged text and source block identities, gap inputs and unaffected prose.

Development-browser checks passed 104 page states using intercepted synthetic
accounts: 2560/1440/768/390/320px, both themes, five vocabulary screens, the linked
task and both listening layouts, plus 24 other application routes. Assertions
checked horizontal overflow, card column counts, table column bounds, single
linked-task rendering, page-two history and answer retention across layout
switches. No runtime or console errors remained in that run.

Independent read-only review identified table input sizing and stacked-cell
labels as issues. Both were corrected; re-review found no remaining actionable
findings. A separate review of the subsequent native-list conversion found no
actionable issue with source offsets, order or responsive layout.

The enhanced Chromium run passed 34 desktop/mobile states, including native
note lists, nested subitems and a real text selection/highlight save. The saved
`best` anchor retains its original range (1–5, after the printed bullet) across
Integrated/Split switches. Answers, question notes and playback position also
survived layout switches. Firefox passed 34 states before the subsequent list
conversion. WebKit passed 34 states with native lists and recording retry;
playback-position assertions are excluded for that Windows runner because even
a standalone synthetic WAV fails to load. Chromium and Firefox verify audio
position; actual Safari playback remains device acceptance.

Full-suite, production build, bundle/compatibility checks and exact-commit
publication evidence are tracked in [PR #26](https://github.com/EnosElinsa/ielts-fieldbook/pull/26).
The required checks must pass before squash merge; frontend publication follows
`master` through Cloudflare Pages.

Temporary browser fixtures, screenshots and traces are outside the checkout in
the task's visualization directory under `layout-readability/`. Release logs
are ignored under `local/logs/layout-readability/`.

## External acceptance and rollback

A physical phone, actual screen reader and the learner's browser/device remain
manual acceptance: open a listening part, type answers, switch Integrated/Split,
open question notes, pause/resume the recording and return after backgrounding.
Confirm the same answers, notes and playback position, clear input focus, and
readable task/field labels. Inspect long source tables with horizontal scrolling.
The synthetic fixture verifies application behavior, not field network latency
or every source question's editorial quality.

Rollback is a previous Cloudflare frontend deployment. Keep all account records
and content-addressed vocabulary resources. This release also includes the
previously verified [scroll fix](2026-11-18-learning-card-scroll.md) and
[group-meaning/resume fixes](2026-11-18-group-meaning-and-resume.md).
