# Task 1 report — contextual vocabulary content and sessions

Status: DONE_WITH_CONCERNS (known corpus review limits and existing bundle warning; no unresolved implementation failure).

## Implemented

- Pure `resolveVocabularyLearningContext(entry, {bookId?, unitId?, senseId?})` in `src/domain/vocabulary/context.ts`, also exported from the vocabulary domain index. Returns `{entry, sense, reviewed, contentReviewed, status, context, contentVersion}`. `entry.senses[0]` is the selected sense; `sense` is undefined for an explicitly requested unavailable identity rather than silently selecting another meaning. `reviewed` means confirmed context; `contentReviewed` means authored content reviewed independently of context certainty.
- `VocabularyLearningContext` freezes `entryId`, `senseId`, optional `bookId`/`unitId`, `version`, `status`. Resolver is pure and returns a cloned selected sense. No learning-state creation, user-note rewriting or history mutation during queue/display. Same-ID edited learner definitions/examples and Personal note senses win over public patches. Other group bindings cannot leak into current group.
- Versioned membership supplement in `contextSenseOverlay.json`. Geography core uses existing broad noun ID `kaikki:846f18ca02f7f1d01c`; fruit core uses sole genuinely missing stable ID `editorial:core:fruit-centre`. Existing dictionary IDs reused for all other corrections. Original dictionary source/license/attribution/sourceUrl retained; authored edits separately attributed in `sense.editorial` as CC-BY-4.0. Unconfirmed inherited synonyms, antonyms, distinctions and word families cleared. Examples are hand authored natural sentences, not generic placeholder examples.
- Regressions core geography vs fruit centre, vegetable food, complete fruit plant vs food, material strip in food, peel food noun vs action verb, order request vs command, medical treat, culinary recipe. Broader risk-driven review includes mantle/crust/gale, fundamental/array/attitude/underlie, cashier/cathedral, reserve/feature/fitness, kit/discount/cultivation, impression/compound/discharge/concentration. Generic alphabetic or numbered test chapters keep context unresolved even when common modern content is corrected.
- 23 common modern defaults improve standalone and unbound-group display: fruit, vegetable plus 21 mismatched task words. Explicit senseId wins over defaults and membership binding. A group without a confirmed binding receives unreviewed status, rather than claiming its intended sense is known.
- 99 preexisting editorial learning tasks now bind to stable sense IDs through `taskSenseBindings.json`; 21 previously mismatched primary senses are suppressed and receive reviewed common-sense defaults. Example: construct noun cannot receive the build synonym task; stable horse-building noun cannot receive the steady adjective task. Cloze/definition and confusion tasks are gated by selected identity; custom notes are not assigned canned reviewed definitions.
- Every queue path uses resolver, including explicit entry+sense and source group filters. Whole-group selection chooses the bound sense only and reports unsupported specialist modes unavailable instead of choosing a different sense. Read-only queue no longer fills missing storage lists.
- ReviewCard.context and result.context freeze with card content/tasks and session version. Submission accepts new editorial selected senses and legacy dictionary identity-only drafts; old snapshot task acceptance continues to grade frozen answers. New draft validation checks context shape, selected identity, optional group selection/filter ownership, while drafts without context remain valid. Learner state/sense is created only on deliberate session commit.

## Task 2 and 3 integration contract

Use `resolveVocabularyLearningContext(rawEntry, {bookId, unitId, senseId?})` for current list/detail/result content. Render `resolved.sense` and preserve `resolved.entry` original meaning/example notes independently; use `resolved.status` and `resolved.contentReviewed` to distinguish group certainty from authored content review. Explicit historical drill sense takes precedence. Group cards already include resolved content and context; do not regenerate their task from today's dictionary. Historical session grading must continue to use cardSnapshots/tasks; current definition is a separate view.

Media must bind by selected sense ID and, for contextual specialization of a broad dictionary sense, bookId/unitId as well. Earth core retains broad existing dictionary ID; avoid term-only images. `VocabularySense.editorial` exposes separately attributed authored text without removing source dictionary credits. `isVocabularyLearningContext` validates frozen versions structurally without requiring today's manifest version, so historical content is durable.

## Corpus evidence

`python scripts/audit-vocabulary-content.py` scanned 7,021 unique release words, 9,205 memberships, 165 groups and all 51,354 extracted dictionary senses. Artifacts: `docs/vocabulary-context-audit.json` (every word's automated signals and every membership, unresolved risks enumerated), `docs/vocabulary-context-audit.md` (summary, per-book coverage and all manual decisions).

Automated risk entries: 6,727. Signals: polysemy 5,137; multiple groups 1,632; missing example 2,527; marked primary 151; incomplete-definition candidate 38; missing definition 1,168; reviewed task-sense mismatches 21. Flags are candidate risks, not all confirmed errors.

Editorial decisions: 44 memberships; authored/corrected content 34; confirmed thematic contexts 15; context-unresolved audited memberships 29. Remaining automated unresolved risk memberships: 8,896. Separate common modern defaults reviewed: 23; preexisting task IDs bound: 99; task primary mismatches fixed/suppressed: 21. All six books represented. This is risk-driven review, not exhaustive human review of 7,021 words. Original sentences are required to confirm ambiguous generic test/chapter group intent; no unsupported target sense was presented as context-reviewed.

## Verification

- Initial focused checks `npm test -- --run tests/domain/vocabulary-context.test.ts src/domain/vocabulary/content.test.ts tests/domain/vocabulary-selection.test.ts tests/storage/vocabulary-drafts.test.ts`: first 43/44 passed; legacy identity-only missing dictionary sense exposed. Fixed submission compatibility. Second run: 4 files, 44/44 passed.
- `npx tsc -b`: passed after removing two now-unused imports.
- First full `npm test`: 409/411 passed. Two synthetic/no-group session compatibility tests exposed overstrict context checks. Fixed context checking to preserve identity-only synthetic card setup and no-group personal card unit selection. Focused `npm test -- --run tests/domain/vocabulary-session.test.ts tests/domain/vocabulary-context.test.ts`: 2 files, 36/36 passed.
- Final full `npm test`: 56 files, 411/411 passed, exit 0, duration 21.78s. Includes source-order 55 and 235 full-group save/resume/submit, old identity distinction draft grading, frozen snapshot grading and all original tests.
- Self-review identified persisted new editorial sense incorrectly marked as learner override on next display; corrected comparison to recognize the reviewed manifest content. Final focused `npm test -- --run tests/domain/vocabulary-context.test.ts`: 18/18 passed, exit 0, duration 1.83s.
- Final `npm run build`: TypeScript and Vite succeeded, exit 0, 3,124 modules, 7.53s Vite build. Existing Vite warning: chunks >500 kB. Main bundle 880.54kB / gzip252.60kB; compacting/lazy-loading these domain supplements is an integration performance consideration, not a functional blocker.
- `git diff --check`: passed. No private environment files or learner/account data read, printed or committed; no remote writes.

TDD not explicitly required by this task brief; behavioral regression tests were written with implementation, failures diagnosed and corrected with evidence above.

## Self-review and limitations

Reviewed resolver precedence and immutability, stable identity reuse vs missing sense, task sense matching, draft validation backward compatibility, new editorial commit recognition and original content credits. Corrected caller mutation exposure with cloned selected sense; cleared cross-sense relation inheritance. Existing session module has a dense stale-card condition; scoped changes retain historical behavior, but it remains a maintainability concern. Historical records and FSRS/state dates remain unchanged except on authorized new session submission. No UI/media paths touched.

Known limitation: 8,896 automated candidate memberships remain context-unresolved, mostly because polysemy/missing examples are broad risks; this work never labels them fully reviewed. Source original sentence absence limits confirmation in generic listening/test groups. Large JSON audit is intentional complete evidence and does not enter the runtime bundle.

## Owned files

scripts/audit-vocabulary-content.py; docs/vocabulary-context-audit.json; docs/vocabulary-context-audit.md; src/domain/vocabulary/context.ts; contextSenseOverlay.json; taskSenseBindings.json; content.ts; index.ts; selection.ts; session.ts; types.ts; src/storage/vocabularyDrafts.ts; tests/domain/vocabulary-context.test.ts; this report.

Commit subject: Bind vocabulary content and tasks to stable learning contexts.
