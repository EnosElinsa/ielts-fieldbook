# Vocabulary learning cards implementation plan

Approved direction: 2026-10-19, “采用，开始实施共享规则”. Execute inline; the user has requested no subagents.

**Goal:** Apply common-first learning choices, compact meaning content and selective visual presentation to existing vocabulary content through shared rules.

**Architecture:** Keep dictionary records, teaching snapshots, pronunciation and practice scheduling intact. Separate a diagram's availability from its presentation value with an explicit reviewed-kind policy. Reuse the current exact-meaning lookup and lazy renderer. Keep definition, example and collocations visible; put supplementary explanations in a disclosure. Dictionary search remains exhaustive when requested.

**Tech stack:** React 19, TypeScript, native details/summary, existing CSS tokens, Vitest/Testing Library, existing Playwright helpers.

**Spec:** `docs/vocabulary-learning-redesign-proposal.md`.

## Constraints

- Retain every source/meaning ID, personal edit, frozen prompt/result and historical resource; no readiness revision or dictionary batch is part of this UI release.
- Do not infer learning priority or diagram quality from prose, age of quotations, shape counts or task readiness.
- Retain all pronunciation bindings, next-practice guidance and spacing/recovery behavior.
- Use synthetic browser accounts and intercept persistence writes. Four layouts only: 1440/light, 1440/dark, 390/dark, 320/light.
- Run full pipelines serially. Deploy only through Cloudflare Git integration when verified.
- Preserve unpublished round50 content separately.

## 1. Meaning-bound visual presentation

Files: `src/domain/vocabulary/visualPresentation.ts`, `src/features/vocabulary/VocabularyDiagramDisclosure.tsx`, `VocabularyLearningVisual.tsx`, `VocabularyEntryPage.tsx`, `DictionarySenses.tsx`, visual CSS and focused tests.

- [x] Add failing tests: an abstract reviewed diagram is absent until expanded; collapsing removes the scene; selecting another meaning resets expansion; a reviewed quantitative/spatial diagram remains immediately available; edited definitions cannot inherit a public diagram.
- [x] Run the tests and inspect their expected failures.
- [x] Add an explicit reviewed set of diagram kinds with documented spatial/quantitative/structural rationale. Export `getVocabularyVisualPresentation(resolved)` returning `inline`, `supplementary` or `none`, using the existing exact lookup before classifying.
- [x] Extract a keyed, lazy native disclosure for supplementary diagrams. Dictionary previews reuse it and stay closed. Entry layout creates a visual column only for inline visuals; supplementary visuals stay inside the content column.
- [x] Run focused component tests. Keep renderer scene markup and immutable diagram bindings unchanged.

## 2. Compact learning content

Files: `VocabularySenseContent.tsx`, its tests and `vocabulary-entry.css`.

- [x] Add failing tests: definition/example/collocations are visible; supplementary usage, distinctions and lexical relations are grouped behind one disclosure; missing-example text explains the material boundary; a mismatched fallback example is not borrowed.
- [x] Run the failing tests.
- [x] Keep existing labels and reading-note identity checks. Group secondary material under `Usage and meaning notes`; do not duplicate identical notes. Only accept fallback examples with the same sense ID, definition and POS. Do not mutate learner content.
- [x] Run component tests including existing reading-note and personal replacement examples.

## 3. Common-first dictionary selection

Files: `DictionarySenses.tsx`, its tests.

- [x] Add a failing regression for a word whose sole general meaning is already displayed: remaining specialist/historical meanings must not be called the initial learning recommendation merely because they have notes.
- [x] Keep the authored general filter. Exclude explicitly specialist/historical/proper-name and reference records from the unclassified learning-notes fallback. Preserve `All meanings`, stable numbering, search/POS filters and save/practice identity.
- [x] Verify unclassified records and user-selected meanings remain reachable and browsing creates no learning evidence.

## 4. Verification and delivery

- [x] Run focused UI/domain tests and the existing entry/practice/diagram-loading tests; fix actual regressions.
- [x] Run full tests, compilation/build, dictionary audit, identity/SQL and bundle checks serially. Compare complete retained vocabulary-resource hashes/URLs and scene hashes with the released baseline.
- [x] Use real browser flows to exercise an abstract supplementary diagram, an inline spatial diagram, no-image layout, default/common/all dictionary choices and an exact-meaning practice round trip. Check empty scene requests before disclosure, expansion/reset, no framework errors and no overflow in the four required layouts. Capture and inspect representative screenshots.
- [x] Update proposal/roadmap with precise implementation and verification boundaries and prepare the shared feature for commit; do not claim full-dictionary completion or deploy round50.

Local verification evidence: 7,197 tests pass, one conditional skip, 196 files; compilation/build, dictionary audit, identity/SQL and bundle checks pass. All 2,566 resources and 854 diagram renderings are byte-identical. Four required browser layouts pass 68 states; representative desktop and mobile captures have been inspected. Exact-commit CI, Git deployment, production asset hashes and the same production browser flow are release gates, recorded in the external release evidence after publication.
