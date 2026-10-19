# Vocabulary quality and bulk work queue

Generated with `npm run vocabulary:quality` from checked-in public data and the actual learning-context and exercise resolvers. No account data or external services are read.

Source snapshot: `c3af6f5767943ab339310caa2afd904a552b2c373b12ddafb4f86b98aa91bc11`.

## Coverage

| Measure | Count |
| --- | ---: |
| Catalogue words | 7021 |
| Source dictionary terms | 5853 |
| Source and restored dictionary senses | 51988 |
| Existing editorial reviews | 3281 |
| Dictionary senses still pending | 48707 |
| Words with a resolved learning meaning | 7021 |
| Distinct learning-content variants | 9095 |
| Default/group learning contexts, including multiple-meaning lessons | 16296 |
| Learning variants with a displayed example or reading note | 9095 |
| Learning variants with collocations or reading cues | 2388 |
| Learning variants with distinction notes | 238 |
| Learning variants supporting sentence gaps | 7596 |
| Learning variants supporting distinction questions | 220 |
| Learning variants with none of these automatic signals | 206 |
| Source groups sharing a normalised definition and POS within one word | 11 |

Learning variants preserve exact content and provenance. A word can have a default, topic-specific content and additional multiple-meaning lessons. Shared text is counted once per exact variant, with every default/group scope retained. Dictionary counts exclude separate teaching variants. Context-review-required does not reverse or add an editorial dictionary review.

## Issue queue

| Automatic signal | Learning variants | Dictionary variants |
| --- | ---: | ---: |
| missing-definition | 0 | 0 |
| missing-pos | 0 | 0 |
| missing-example | 0 | 17786 |
| source-markup | 0 | 1 |
| relation-example | 0 | 323 |
| reference-example | 0 | 23 |
| truncated-example | 199 | 2534 |
| archaic-example | 148 | 1667 |
| example-fragment-signal | 540 | 4651 |
| missing-collocations | 6707 | 48707 |
| missing-distinctions | 8857 | 48707 |
| duplicate-gloss | 1 | 22 |
| no-cloze-task | 1498 | Not scanned |
| no-distinction-task | 8874 | Not scanned |

These signals are candidates for review, not proven linguistic defects. A phrase can be a valid example; an old quotation can be appropriate reading material; two glosses can belong to distinct source identities. Typed reading notes and reference records do not require sentence gaps. Exercise availability is scanned for learning variants only, not every reference meaning. The availability of a question is not proof of its semantic quality. No missing-diagram signal is generated.

Priority is visible structural/source-text issues, other visible learning gaps, remaining dictionary work, then explicitly authored specialist/historical/proper-name records. Group reuse is a tie-breaker, not a word-frequency claim. Unclassified dictionary meanings remain in the complete queue.

## First visible work items

| Word | Sense | Signals | Default/group contexts |
| --- | --- | --- | ---: |
| accommodation | general | missing-distinctions, no-distinction-task | 6 |
| allergy | kaikki:5bab1eaa2c07fe9e96 | missing-collocations, missing-distinctions, no-distinction-task | 6 |
| castle | kaikki:9b1faf9c08383fd9b6 | missing-collocations, missing-distinctions, no-distinction-task | 6 |
| exhibition | kaikki:6b92dc693fb1b189fa | missing-collocations, missing-distinctions, no-distinction-task | 6 |
| laptop | kaikki:168124cf624619cd5f | missing-collocations, missing-distinctions, no-distinction-task | 6 |
| practical | kaikki:56ce9fe1b5cbf58f7d | missing-collocations, missing-distinctions, no-distinction-task | 6 |
| visa | kaikki:149963eda68ac77d9a | missing-collocations, missing-distinctions, no-distinction-task | 6 |
| ancient | kaikki:3a4eff8c3f3e3233f9 | missing-distinctions, no-distinction-task | 5 |
| blanket | kaikki:53413b231d64bb2e87 | missing-collocations, missing-distinctions, no-distinction-task | 5 |
| business | kaikki:1ae0c45ba6013ba8ec | missing-collocations, missing-distinctions, no-distinction-task | 5 |
| coffee | kaikki:89f2915edc21b0c662 | missing-collocations, missing-distinctions, no-distinction-task | 5 |
| customer | kaikki:75baca29b1545f7a35 | missing-collocations, missing-distinctions, no-distinction-task | 5 |
| depression | kaikki:9ef42cf9e4e4ef2611 | missing-collocations, missing-distinctions, no-distinction-task | 5 |
| drought | general | missing-distinctions, no-distinction-task | 5 |
| drum | kaikki:49fa3250de7cd11e4f | missing-collocations, missing-distinctions, no-cloze-task, no-distinction-task | 5 |
| exchange | kaikki:a0380dbcf881c102a9 | missing-collocations, missing-distinctions, no-distinction-task | 5 |
| exploit | kaikki:4a2aeed70f747bd282 | archaic-example, missing-collocations, missing-distinctions, no-cloze-task, no-distinction-task | 5 |
| faculty | kaikki:1a7888a33c08b8e60c | missing-collocations, missing-distinctions, no-distinction-task | 5 |
| ferry | kaikki:bdb67cb1cf9fe4b097 | missing-collocations, missing-distinctions, no-distinction-task | 5 |
| freeze | kaikki:d088feb15fadbd8685 | missing-collocations, missing-distinctions, no-cloze-task, no-distinction-task | 5 |

The complete fingerprinted queue is generated at `local/audits/vocabulary-quality.json`. It is an offline work artifact, not a published dictionary or an approval ledger. Export bounded packages by problem type using the workflow in [vocabulary-bulk-workflow.md](vocabulary-bulk-workflow.md).
