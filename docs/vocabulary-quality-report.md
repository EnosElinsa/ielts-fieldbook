# Vocabulary quality and bulk work queue

Generated with `npm run vocabulary:quality` from checked-in public data and the actual learning-context and exercise resolvers. No account data or external services are read.

Source snapshot: `b33f1045664664573005c71a5d367826f5748aca2cb64892a0e7c4aadf0b00af`.

## Coverage

| Measure | Count |
| --- | ---: |
| Catalogue words | 7021 |
| Source dictionary terms | 5853 |
| Source and restored dictionary senses | 52108 |
| Existing editorial reviews | 4262 |
| Dictionary senses still pending | 47846 |
| Words with a resolved learning meaning | 7021 |
| Distinct learning-content variants | 9088 |
| Default/group learning contexts, including multiple-meaning lessons | 16296 |
| Learning variants with a displayed example or reading note | 9088 |
| Learning variants with collocations or reading cues | 3449 |
| Learning variants with distinction notes | 1307 |
| Learning variants supporting sentence gaps | 7702 |
| Learning variants supporting distinction questions | 304 |
| Learning variants with content-review signals | 0 |
| Learning variants without content-review signals | 9088 |
| Learning variants with enrichment opportunities | 8792 |
| Exact-content decisions retaining valid examples | 312 |
| Source groups sharing a normalised definition and POS within one word | 10 |

Learning variants preserve exact content and provenance. A word can have a default, topic-specific content and additional multiple-meaning lessons. Shared text is counted once per exact variant, with every default/group scope retained. Dictionary counts exclude separate teaching variants. Context-review-required does not reverse or add an editorial dictionary review.

## Issue queue

| Automatic signal | Work category | Pending learning variants | Raw learning signals | Pending dictionary variants |
| --- | --- | ---: | ---: | ---: |
| missing-definition | content-review | 0 | 0 | 0 |
| missing-pos | content-review | 0 | 0 | 0 |
| missing-example | content-review | 0 | 0 | 17779 |
| source-markup | content-review | 0 | 0 | 1 |
| relation-example | content-review | 0 | 0 | 320 |
| reference-example | content-review | 0 | 0 | 23 |
| truncated-example | content-review | 0 | 0 | 2330 |
| archaic-example | content-review | 0 | 0 | 1515 |
| example-fragment-signal | content-review | 0 | 310 | 4106 |
| missing-collocations | enrichment | 5639 | 5639 | 47603 |
| missing-distinctions | enrichment | 7781 | 7781 | 47603 |
| duplicate-gloss | content-review | 0 | 0 | 20 |
| no-cloze-task | enrichment | 1375 | 1375 | Not scanned |
| no-distinction-task | enrichment | 8773 | 8773 | Not scanned |

These signals are candidates for review, not proven linguistic defects. A phrase can be a valid example; an old quotation can be appropriate reading material; two glosses can belong to distinct source identities. Typed reading notes and reference records do not require sentence gaps. Exercise availability is scanned for learning variants only, not every reference meaning. The availability of a question is not proof of its semantic quality. No missing-diagram signal is generated.

Explicit retain-example decisions suppress only the sentence-fragment heuristic for an exact source and displayed-content fingerprint. Raw signals remain visible above and in each work item. Changed source data or teaching text makes an old decision fail validation; same-ID topic variants do not inherit it. These decisions neither approve other fields nor add dictionary editorial reviews.

Content-review signals precede enrichment opportunities in the visible work queue. Missing collocations, distinctions or a particular exercise are enrichment opportunities, not a claim that every meaning needs every field. Having no content-review signal is not semantic approval. The original per-signal counts and complete pending dictionary ledger are retained. Group reuse is a tie-breaker, not a word-frequency claim; it cannot put enrichment ahead of a content-review signal. Remaining dictionary work follows visible work, with explicitly authored specialist/historical/proper-name records last. Unclassified dictionary meanings remain in the complete queue.

## First visible work items

| Word | Sense | Signals | Default/group contexts |
| --- | --- | --- | ---: |
| accommodation | general | missing-distinctions, no-distinction-task | 6 |
| allergy | kaikki:5bab1eaa2c07fe9e96 | no-distinction-task | 6 |
| castle | kaikki:9b1faf9c08383fd9b6 | no-distinction-task | 6 |
| exhibition | kaikki:6b92dc693fb1b189fa | no-distinction-task | 6 |
| laptop | kaikki:168124cf624619cd5f | no-distinction-task | 6 |
| practical | kaikki:56ce9fe1b5cbf58f7d | no-distinction-task | 6 |
| visa | kaikki:149963eda68ac77d9a | no-distinction-task | 6 |
| ancient | kaikki:3a4eff8c3f3e3233f9 | missing-distinctions, no-distinction-task | 5 |
| blanket | kaikki:53413b231d64bb2e87 | no-distinction-task | 5 |
| business | kaikki:1ae0c45ba6013ba8ec | no-distinction-task | 5 |
| coffee | kaikki:89f2915edc21b0c662 | no-distinction-task | 5 |
| customer | kaikki:75baca29b1545f7a35 | no-distinction-task | 5 |
| depression | kaikki:9ef42cf9e4e4ef2611 | no-distinction-task | 5 |
| drought | general | missing-distinctions, no-distinction-task | 5 |
| drum | kaikki:49fa3250de7cd11e4f | no-cloze-task, no-distinction-task | 5 |
| exchange | kaikki:a0380dbcf881c102a9 | no-distinction-task | 5 |
| exploit | kaikki:4a2aeed70f747bd282 | no-cloze-task, no-distinction-task | 5 |
| faculty | kaikki:1a7888a33c08b8e60c | no-distinction-task | 5 |
| ferry | kaikki:bdb67cb1cf9fe4b097 | no-distinction-task | 5 |
| freeze | kaikki:d088feb15fadbd8685 | no-cloze-task, no-distinction-task | 5 |

The complete fingerprinted queue is generated at `local/audits/vocabulary-quality.json`. It is an offline work artifact, not a published dictionary or an approval ledger. Export bounded packages by problem type using the workflow in [vocabulary-bulk-workflow.md](vocabulary-bulk-workflow.md).
