# Vocabulary group curriculum implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent content audits and a final branch review.

**Goal:** Give every released group a usable learning syllabus, with meanings chosen for its actual organisation and complete learning content.

**Architecture:** Keep source memberships and account data immutable. Add read-time editorial selections for thematic chapters and common-meaning curricula for alphabetical/general lists; use source sentences where available for test parts. Distinguish a recommended learning meaning from a verified original-source interpretation. Preserve sense IDs when meanings match; create editorial IDs only for distinct missing meanings. Expose alternate learning meanings without combining their mastery state.

**Stack:** React, TypeScript, existing licensed dictionary and editorial overlays, Vitest, Playwright.

**Constraints:** English UI; no private source/session/history committed; no invented source confirmation; all 165 groups and 9,205 source memberships audited for coverage; no automatic user-history migration.

## Tasks

- [x] Audit all existing selected content and each thematic chapter against dictionary candidates; write independent content decisions in three separate editorial files. Preserve attribution and personal edits.
- [x] Add failing tests for livestock content, thematic polysemy, known-group curriculum coverage, arbitrary unknown groups and explicitly chosen senses.
- [x] Implement group curriculum selection and provenance; general lists receive an explicit common-meaning syllabus rather than an unfilled group-meaning warning. Polysemy groups expose multiple common meanings, with separate learning identities.
- [x] Integrate learning cards, details and assessment selection with the same curriculum resolver. Keep old frozen prompts/scoring and source meaning confirmations.
- [x] Run full structural/content coverage audit, meaningful tests and production build. Browser check 320/390/1440 light/dark, source switch, alternate meaning learning and return/recovery.
- [ ] Review complete branch, commit, merge master, push, verify exact deployment and online assets. Report authenticated-production limitations separately.

## Validation and rulings

- All 3,632 thematic memberships inspected across 22 chapters; 1,389 targeted theme rows authored. General lists received 425 same-sense content repairs and 31 distinct modern defaults. The multiple-meaning syllabus has 166 authored choices across common/polysemy words; drought retains one defensible modern meaning rather than an invented second meaning.
- 99 source selections were checked against Cambridge 20/21 listening sentences. Only section/sentence IDs are released. Teaching examples are editorial, not reproduced private transcripts.
- Ruling: whole-group assessment retains one card per word for compatibility. Multiple-meaning cards offer explicit selected-meaning practice, its own evidence and schedule, and disclose whole-group first-meaning coverage.
- Personal edits win unless the learner explicitly selects another meaning. Unknown custom identities, raw saved dictionary baselines, and previous same-ID editorial content remain compatible. New unrelated meanings receive different identities; historical reviews are not migrated or regraded.
- Both public audits pass with 9,205/9,205 memberships and 165/165 groups covered. Zero structural defects or pseudo-relation/cross-reference defects remain in selected group content. Remaining sentence-heuristic candidates were inspected as usable quotations or short complete sentences; the checks do not certify all possible dictionary meanings.
- Full Vitest: 87 files, 684 tests passed. Production build passed. Production-build local-account browser: 29 checks, including 320/390/1440 light/dark, save retry, multiple-meaning assessment and details return, source meaning selection, timeline, keyboard and horizontal overflow; no console/page errors.
- Production build strips authoring rationales and unrelated original-sense audit copies while retaining current credits and edit-detection fields. Main bundle remains large (approximately 5.03 MB / 1.11 MB gzip); no broad asynchronous data-loading rewrite was introduced.
- Browser learning validation uses the real application with a locally intercepted test account, not an authenticated production account. Production access and exact asset checks are separate release steps.
