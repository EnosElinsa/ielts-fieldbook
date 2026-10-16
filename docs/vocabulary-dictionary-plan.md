# Complete dictionary learning-content review

**Goal:** Continue improving high-frequency polysemous words with examples, collocations, distinctions and accurate diagrams, and review every additional dictionary sense in successive batches.

**Scope:** The released dictionary index and its actual sense records define the full scope. Catalogue defaults are a subset. Nonempty fields, automated checks and a passing build do not prove linguistic review.

**Architecture:** Keep original dictionary records and stable sense IDs. Apply attributed editorial supplements through the existing readiness resolver, including when other dictionary meanings are loaded. Record reviewed identities against their original content hashes. Preserve personal edits, frozen tasks and all published resource URLs.

**Validation:** TypeScript/domain/component tests; the independent full-dictionary audit; the resource-retention comparison; production build, identity/SQL and bundle checks; desktop and mobile learning/selection/practice browser checks using synthetic accounts.

## Work sequence

- [x] Inventory every indexed term and sense; report missing examples, empty learning fields and automatic content-risk signals separately from editorial review.
- [x] Apply same-sense supplements to additional dictionary meanings. Support reviewed collocations, distinction notes and sense-specific distinction exercises while preserving intentional edits.
- [x] Review 65 common senses in the first high-frequency batch: current, interest, rate, capital, bank and charge. Record exactly which senses were examined, retain the other 82 senses of these six terms for later verification, and never transfer an example between meanings.
- [x] Bind original diagrams to exact entry ID, sense ID, definition and part of speech; test wrong meanings and edited definitions.
- [x] Verify selection, saving, practice, attribution and return navigation with synthetic records. Commit and deploy a verified batch under the existing release authorization.
- [x] Review all 50 indexed senses of account, state, matter and value; give historical constructions explicit reading guidance and preserve complete earlier public snapshots for saved-content updates. Add eight contextual exercises and six exact diagrams.
- [x] Add search across displayed definitions, examples, usage and learning notes, combined with part-of-speech filtering, stable meaning numbers and an explicit empty/reset state.
- [x] Review 82 preserved senses of field, form, issue and subject. Restore 31 independently selectable child meanings with exact revision/source-line evidence; retain the two issue senses without reliable use examples as pending. Add ten exercises and six diagrams, correct future Kaikki imports, preserve distinct source IDs through caching, and retain all previously released resource bytes.
- [x] Review all 125 preserved senses of condition, scale, range and ground, and restore three condition submeanings with revision-bound evidence. Add 15 contextual exercises and eight exact diagrams. Allow diagram previews while browsing dictionary meanings without saving learning records.
- [ ] Continue subsequent batches from the complete audit's pending identities, including specialised, historical and proper-name senses. Verify source context where a meaning is uncertain; do not silently omit these records or count them as finished.
- [ ] Audit completion against every indexed sense and all four requested learning-content areas. The goal stays active while any required identity or content is pending or unverified.

The first batch was published in `9baf01e` and passed 50 production browser states. Subsequent releases require their own local and production verification. The complete pending queue is recorded in the dictionary audit; this checklist does not declare the full dictionary finished.

## Completion evidence

The audit must reconcile all source identities, with no stale review hashes, duplicate review rows or orphaned supplements. Every reviewed example must demonstrate its sense and retain source attribution. Collocations and distinction exercises must fit that sense and grammatical form. Diagram coverage must be reported explicitly; inaccurate generic artwork does not satisfy coverage. All retained resource URLs must still load. The final verification must cover the entire requested scope, rather than only the latest batch.
