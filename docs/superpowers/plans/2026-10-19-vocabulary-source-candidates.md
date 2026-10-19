# Source-backed vocabulary candidates implementation plan

**Goal:** Prepare source-bound drafts for bulk review and use them to improve current learning examples, collocations and distinctions across words.

**Architecture:** A pure TypeScript module joins current fingerprinted work to cached revision pages. A small offline CLI emits drafts and unresolved items without mutating content. Authored, semantically checked records enter the established supplement/ledger pipeline separately.

**Tech stack:** Existing Node.js, TypeScript, vite-node and Vitest.

**Spec:** [Source-backed candidate design](../specs/2026-10-19-vocabulary-source-candidates-design.md).

## Constraints

No subagents, new dependencies, private data, external model calls, automatic semantic approval, source identity replacement or Wrangler deployment. Run local test/build/browser pipelines serially. Preserve existing resources and all personal/history boundaries.

## Tasks

- [x] Add `tests/domain/vocabulary-source-candidates.test.ts`. Run controlled English source blocks through the real preparer and assert: exact sense/POS/case matching; direct examples only; nested/adjacent examples excluded; archaic/truncated/relation examples rejected; unsupported template and duplicate-gloss ambiguity retained for manual review; stale fingerprints rejected; no approval granted. Run the new suite and confirm failure before implementation.
- [x] Add `scripts/vocabulary-source-candidates.ts` with `prepareSourceCandidates(report, items, responses)`. Consume `QualityReport` and exported work items. Emit revision-linked drafts with missing fields, raw evidence and unresolved reasons. Add `scripts/prepare-vocabulary-candidates.ts` and `vocabulary:prepare` with `--work`, `--sources`, `--report` and `--output`. Run tests and actual CLI against saved public responses.
- [x] Export the complete 199-item visible truncated-example queue, retrieve its public source pages into ignored evidence storage and prepare it together. Review exact source matches and author ordinary learning examples, useful collocations and precise distinctions across words. Keep unresolved/mismatched/specialised material explicit. Add meaningful content regressions for corrected semantic/construction traps and preservation boundaries.
- [x] Integrate reviewed records with original fingerprints and a reversal baseline. Regenerate full quality/dictionary accounting. Document actual source match counts, content coverage and remaining limitations. Run affected tests, then required full release checks once the content release is consistent. Local evidence: 7,655 passing tests / one conditional skip / 207 files; build, report freshness, complete accounting, identities, SQL replay and bundle budgets passed. All 2,802 prior resource files are retained, with 248 additional files and 3,050 total.
- [x] Complete four-layout local browser checks: 508 states, 100 distinction journeys and 16 sentence-gap submissions; all writes use synthetic accounts and interception. Inspect representative desktop/light, mobile/dark and 320/light content cards.
- [ ] Commit and push the verified release, integrate the clean primary checkout, verify exact-commit CI/Cloudflare Git deployment, compare production resources and repeat four-layout production browser checks. This file records the pre-release snapshot; exact-commit checks and the retained release evidence establish later publication. Keep the goal active while any dictionary content remains pending.
