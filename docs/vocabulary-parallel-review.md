# Complete-term parallel dictionary review

## Integrated snapshot and next packages — 2026-10-20

The current integrated working tree has52,152 source senses:5,027 independently fully reviewed and47,125 pending. The combined applied release adds765 full reviews,including11 restored senses. Its1,469 focused repairs,source caches and candidate packages are separate measures. Existing diagrams remain at854;no new verified exact media bindings are claimed for those reviews.

Two authors and one independent reviewer process complete terms in isolated output directories. The third packages contain636 exact display variants. After auxiliary-field revisions and independent final review,root integrated549 accepted variants:501field repairs and48retains. The installed snapshot adds213 full source reviews after787 actual display routes,8,657 individual-edit checks,187 typed-note route checks and480 generated-task checks. Seventy-four original whole-variant holds and13 indexed-only proposals remain outside the merge. Potential full-review teaching variants are not source reviews. An explicit independently sourced not-applicable decision can replace an optional collocation/distinction quota only when bound to the exact final material hash;definition and example/reading note remain required.

The [unified implementation ledger](unified-learning-implementation.md) is the release checklist. Packages continue internally and compatible accepted changes are combined; each small set of words does not trigger a deployment.

## Workflow

The issue workflow in [vocabulary-bulk-workflow.md](vocabulary-bulk-workflow.md) repairs particular fields. This workflow separately assigns complete dictionary terms to authors and independent semantic reviewers. A field repair does not complete a term review or increase the dictionary editorial ledger.

`scripts/vocabulary-review-jobs.ts` builds reusable work packages from the existing complete quality report. Every term retains all indexed and restored source senses, reviewed source context and exact teaching variants with their default/group references. Current learning terms come first; specialist and historical terms remain in the inventory. The default target is 300 pending **source senses** per package. Whole terms stay together, and an oversized term gets its own package. Teaching variants and already reviewed source senses do not inflate that target.

Create a current quality report using the existing workflow, then run:

```powershell
node node_modules/vite-node/vite-node.mjs scripts/manage-vocabulary-review-jobs.ts create --report local/audits/vocabulary-quality.json --output local/dictionary-review/job
node node_modules/vite-node/vite-node.mjs scripts/manage-vocabulary-review-jobs.ts claim --manifest local/dictionary-review/job/manifest.json --package review-0001 --actor author-a
```

Creation requires a new or empty directory inside ignored `local/`. It writes `manifest.json` and `review-*.json` packages with complete source/display work rows. The manifest binds the source snapshot, complete work inventory, package membership, every term and every exact work item to SHA-256 fingerprints. The CLI recomputes the current source snapshot before creating or changing a job. Changed source data, teaching content or teaching scopes require a fresh job; an old job remains evidence.

All authors claim through one central manifest. A package claim covers every term in that package and rejects an existing owner. Do not create separate manifests for authors handling the same inventory. The CLI takes an exclusive lock while updating and replaces the manifest atomically, preventing concurrent claims from overwriting one another. It never edits dictionary JSON, teaching supplements or the editorial ledger.

For subsequent actions, write a JSON request and supply it with:

```powershell
node node_modules/vite-node/vite-node.mjs scripts/manage-vocabulary-review-jobs.ts update --manifest local/dictionary-review/job/manifest.json --request local/dictionary-review/request.json
```

A request contains `term`, `actor`, the term's `workFingerprint` and `to`. Supported stages are:

| From | To | Required evidence |
| --- | --- | --- |
| unclaimed | claimed | Package claim with a named owner |
| claimed | draft | Optional structurally valid candidates |
| draft | draft | Additional candidates with previously unused work identities |
| claimed or draft | source-unresolved | A concrete source issue in `reason` |
| source-unresolved | draft | A source-resolution explanation in `reason` |
| draft | checked | Independent full-term semantic review |
| checked | integrated | Owner's `integrationReference` identifying the applied change |

Only the owner can draft, record source issues or integrate. A reviewer must differ from the owner. Claims are exclusive; states cannot skip review or leave integrated. `integrated` is a local workflow receipt, not proof that the published editorial ledger has changed. After integration changes the dictionary snapshot, create a fresh job for further work.

Draft requests optionally contain `candidates`, using the existing full or focused quality-candidate format. The tool reuses the existing candidate validator and rejects stale fingerprints, repeated work identities, candidates outside the owned term and unsupported approval fields. Receipts preserve each candidate's fingerprint and classify focused `changes` as `field-repair`. Full-format candidate content is still a draft and receives no automatic semantic approval.

For `checked`, the request contains `reviews`: one record for **every** work item of that term, including source context and separate teaching variants. Each record needs `workItemId`, its exact `workFingerprint`, `decision` (`retain` or `change`), a nonblank `rationale`, an HTTPS `referenceUrl`, and all `reviewedAreas`: `meaning-pos`, `example`, `collocations`, `distinctions`, `usage-register`, `teaching-context`, `optional-material`. `change` must have a submitted candidate; `retain` must not. Checking an area means assessing existing material and whether any addition is useful; it does not impose a quota for collocations, exercises or diagrams. Confirm specialist and historical register, headings, references, restored children, meaning selection and optional tasks against the exact source meaning.

The independent receipt binds the current candidate set as well as the complete work inventory. Missing work items, unresolved sources, partial field-only checks, duplicate review identities and stale fingerprints cannot reach checked. A changed source or displayed variant cannot inherit another variant's review. Structural checks cannot establish that a citation supports a meaning or that an authored sentence is semantically sound; reviewers must inspect that evidence themselves.

Validation is targeted during authoring. Combine compatible reviewed content before the existing final data/source/identity/resource checks and release pipeline. The job tool makes no external request, uses no model API and does not publish content.
