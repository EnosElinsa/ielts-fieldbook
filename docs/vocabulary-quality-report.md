# Vocabulary quality and bulk work queue

Generated with `npm run vocabulary:quality` from checked-in public data and the actual learning-context and exercise resolvers. No account data or external services are read.

Source snapshot: `49941667ae91f03fed8efe5e4fccc3776cfbc8b2c3fc99fcfcdeef59f5aaa710`.

## Coverage

| Measure | Count |
| --- | ---: |
| Catalogue words | 7021 |
| Source dictionary terms | 5853 |
| Source and restored dictionary senses | 52022 |
| Existing editorial reviews | 3633 |
| Dictionary senses still pending | 48389 |
| Words with a resolved learning meaning | 7021 |
| Distinct learning-content variants | 9091 |
| Default/group learning contexts, including multiple-meaning lessons | 16296 |
| Learning variants with a displayed example or reading note | 9091 |
| Learning variants with collocations or reading cues | 2683 |
| Learning variants with distinction notes | 537 |
| Learning variants supporting sentence gaps | 7698 |
| Learning variants supporting distinction questions | 288 |
| Learning variants with content-review signals | 514 |
| Learning variants without content-review signals | 8577 |
| Learning variants with enrichment opportunities | 8814 |
| Source groups sharing a normalised definition and POS within one word | 11 |

Learning variants preserve exact content and provenance. A word can have a default, topic-specific content and additional multiple-meaning lessons. Shared text is counted once per exact variant, with every default/group scope retained. Dictionary counts exclude separate teaching variants. Context-review-required does not reverse or add an editorial dictionary review.

## Issue queue

| Automatic signal | Work category | Learning variants | Dictionary variants |
| --- | --- | ---: | ---: |
| missing-definition | content-review | 0 | 0 |
| missing-pos | content-review | 0 | 0 |
| missing-example | content-review | 0 | 17784 |
| source-markup | content-review | 0 | 1 |
| relation-example | content-review | 0 | 322 |
| reference-example | content-review | 0 | 23 |
| truncated-example | content-review | 0 | 2330 |
| archaic-example | content-review | 0 | 1516 |
| example-fragment-signal | content-review | 513 | 4623 |
| missing-collocations | enrichment | 6408 | 48389 |
| missing-distinctions | enrichment | 8554 | 48389 |
| duplicate-gloss | content-review | 1 | 22 |
| no-cloze-task | enrichment | 1387 | Not scanned |
| no-distinction-task | enrichment | 8797 | Not scanned |

These signals are candidates for review, not proven linguistic defects. A phrase can be a valid example; an old quotation can be appropriate reading material; two glosses can belong to distinct source identities. Typed reading notes and reference records do not require sentence gaps. Exercise availability is scanned for learning variants only, not every reference meaning. The availability of a question is not proof of its semantic quality. No missing-diagram signal is generated.

Content-review signals precede enrichment opportunities in the visible work queue. Missing collocations, distinctions or a particular exercise are enrichment opportunities, not a claim that every meaning needs every field. Having no content-review signal is not semantic approval. The original per-signal counts and complete pending dictionary ledger are retained. Group reuse is a tie-breaker, not a word-frequency claim; it cannot put enrichment ahead of a content-review signal. Remaining dictionary work follows visible work, with explicitly authored specialist/historical/proper-name records last. Unclassified dictionary meanings remain in the complete queue.

## First visible work items

| Word | Sense | Signals | Default/group contexts |
| --- | --- | --- | ---: |
| age | kaikki:1e26b79f328f4d76e4 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 3 |
| gardener | kaikki:995e2098b0eb7142e6 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 3 |
| maximum | kaikki:725a1867b758583865 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 3 |
| medication | kaikki:5094bb744df0a411c9 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 3 |
| Russia | kaikki:fac2a8f37738b25817 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 2 |
| agent | kaikki:8e153db8ce2a9141db | example-fragment-signal, missing-collocations, missing-distinctions, no-cloze-task, no-distinction-task | 2 |
| donkey | kaikki:0563adb1617892685c | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 2 |
| latest | kaikki:a41576109b11c20e4b | missing-collocations, missing-distinctions, duplicate-gloss, no-distinction-task | 2 |
| skirt | kaikki:bb44219109567471c2 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 2 |
| time | kaikki:e89928c4c3b14947ac | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 2 |
| unkind | kaikki:38675469dceb1dab0c | example-fragment-signal, missing-collocations, missing-distinctions, no-cloze-task, no-distinction-task | 2 |
| virtually | kaikki:45c15fffd57f0c1f2e | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 2 |
| Arabic | kaikki:879e4ec3a960e1f734 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 1 |
| Bustle | kaikki:ff6b68b71369f1e2fa | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 1 |
| Central Park | kaikki:65eef89a7e3fd6e525 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 1 |
| Glasgow | kaikki:7c6369dce4b57c9685 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 1 |
| Historic | kaikki:3083755c61b8027f59 | example-fragment-signal, missing-collocations, missing-distinctions | 1 |
| Italian | kaikki:31dcf68e0840b890c6 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 1 |
| Olympic | kaikki:dba8f11d0e6b34134d | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 1 |
| Plausible | kaikki:a9f2df21918d7a5fcf | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 1 |

The complete fingerprinted queue is generated at `local/audits/vocabulary-quality.json`. It is an offline work artifact, not a published dictionary or an approval ledger. Export bounded packages by problem type using the workflow in [vocabulary-bulk-workflow.md](vocabulary-bulk-workflow.md).
