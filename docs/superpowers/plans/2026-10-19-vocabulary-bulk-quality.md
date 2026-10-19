# Vocabulary bulk quality workflow

**Goal:** Replace small, term-by-term delivery with a complete, reproducible issue queue and bulk candidate validation. Keep the full dictionary-review objective and its existing ledger intact.

**Architecture:** An offline adapter runs the existing dictionary audit, loads checked-in public teaching data and uses the application's actual learning-context resolver. A pure report module groups exact content variants by problem type and exports bounded work packages. Candidate validation checks identities, fingerprints and structure; it does not grant semantic approval or publish content.

**Constraints:** No private accounts, external API calls, new dependencies, automatic semantic-review claims, source deletion, changed personal content, or revised frozen sessions. Preserve distinct source and teaching-context identities. Missing diagrams are not a quality defect. Existing current-page loading, confirmed-error practice and meaning-bound pronunciation remain in place.

- [x] Add regression tests for visible versus reference coverage, same-ID context variants, duplicate-gloss signals, deterministic work packages and stale/invalid candidates.
- [x] Implement the report and command-line workflow using the existing runtime resolvers and editorial audit. Export hundreds of exact work items in one command, without changing review status.
- [x] Run against every public entry, group membership and dictionary sense; publish a compact coverage report and document commands, limitations and prioritisation. Resolve the complete 30-item visible-example queue with 31 source-bound reviews, including the ordinary pan default.
- [x] Run affected tests and required local release checks: 7,452 tests passed with one conditional skip; build, identities, bundle budgets, report freshness and dictionary accounting passed. Verify 260 browser states and 116 distinction journeys across four screen/theme combinations. Exercise the actual CLI with a 200-item export, a valid candidate requiring semantic review and a rejected stale candidate.
- [ ] Commit and push. Verify exact-commit CI and the Cloudflare Git deployment. Keep the goal active while dictionary review remains incomplete. The commit's GitHub checks and production verification provide the release evidence after this pre-release snapshot.
