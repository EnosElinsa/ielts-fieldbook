# Vocabulary quality and bulk work queue

Generated with `npm run vocabulary:quality` from checked-in public data and the actual learning-context and exercise resolvers. No account data or external services are read.

Source snapshot: `e35f01040be1c92c9edc5162e57642f9f403db7d33523b48d0e56929d9e70caa`.

## Coverage

| Measure | Count |
| --- | ---: |
| Catalogue words | 7021 |
| Source dictionary terms | 5853 |
| Source and restored dictionary senses | 52009 |
| Existing editorial reviews | 3506 |
| Dictionary senses still pending | 48503 |
| Words with a resolved learning meaning | 7021 |
| Distinct learning-content variants | 9092 |
| Default/group learning contexts, including multiple-meaning lessons | 16296 |
| Learning variants with a displayed example or reading note | 9092 |
| Learning variants with collocations or reading cues | 2584 |
| Learning variants with distinction notes | 437 |
| Learning variants supporting sentence gaps | 7662 |
| Learning variants supporting distinction questions | 265 |
| Learning variants with content-review signals | 614 |
| Learning variants without content-review signals | 8478 |
| Learning variants with enrichment opportunities | 8838 |
| Source groups sharing a normalised definition and POS within one word | 11 |

Learning variants preserve exact content and provenance. A word can have a default, topic-specific content and additional multiple-meaning lessons. Shared text is counted once per exact variant, with every default/group scope retained. Dictionary counts exclude separate teaching variants. Context-review-required does not reverse or add an editorial dictionary review.

## Issue queue

| Automatic signal | Work category | Learning variants | Dictionary variants |
| --- | --- | ---: | ---: |
| missing-definition | content-review | 0 | 0 |
| missing-pos | content-review | 0 | 0 |
| missing-example | content-review | 0 | 17786 |
| source-markup | content-review | 0 | 1 |
| relation-example | content-review | 0 | 323 |
| reference-example | content-review | 0 | 23 |
| truncated-example | content-review | 0 | 2333 |
| archaic-example | content-review | 100 | 1619 |
| example-fragment-signal | content-review | 530 | 4641 |
| missing-collocations | enrichment | 6508 | 48503 |
| missing-distinctions | enrichment | 8655 | 48503 |
| duplicate-gloss | content-review | 1 | 22 |
| no-cloze-task | enrichment | 1426 | Not scanned |
| no-distinction-task | enrichment | 8823 | Not scanned |

These signals are candidates for review, not proven linguistic defects. A phrase can be a valid example; an old quotation can be appropriate reading material; two glosses can belong to distinct source identities. Typed reading notes and reference records do not require sentence gaps. Exercise availability is scanned for learning variants only, not every reference meaning. The availability of a question is not proof of its semantic quality. No missing-diagram signal is generated.

Content-review signals precede enrichment opportunities in the visible work queue. Missing collocations, distinctions or a particular exercise are enrichment opportunities, not a claim that every meaning needs every field. Having no content-review signal is not semantic approval. The original per-signal counts and complete pending dictionary ledger are retained. Group reuse is a tie-breaker, not a word-frequency claim; it cannot put enrichment ahead of a content-review signal. Remaining dictionary work follows visible work, with explicitly authored specialist/historical/proper-name records last. Unclassified dictionary meanings remain in the complete queue.

## First visible work items

| Word | Sense | Signals | Default/group contexts |
| --- | --- | --- | ---: |
| exploit | kaikki:4a2aeed70f747bd282 | archaic-example, missing-collocations, missing-distinctions, no-cloze-task, no-distinction-task | 5 |
| age | kaikki:1e26b79f328f4d76e4 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 3 |
| classical | kaikki:272793d037f2232287 | archaic-example, missing-collocations, missing-distinctions, no-distinction-task | 3 |
| delight | kaikki:d9b1165c26f9faad3a | archaic-example, missing-collocations, missing-distinctions, no-distinction-task | 3 |
| gardener | kaikki:995e2098b0eb7142e6 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 3 |
| intermediate | kaikki:78f1620fb910f83558 | archaic-example, missing-collocations, missing-distinctions, no-distinction-task | 3 |
| maximum | kaikki:725a1867b758583865 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 3 |
| medication | kaikki:5094bb744df0a411c9 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 3 |
| panic | kaikki:d2409acfe603d5b307 | archaic-example, missing-collocations, missing-distinctions, no-cloze-task, no-distinction-task | 3 |
| Russia | kaikki:fac2a8f37738b25817 | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 2 |
| agent | kaikki:8e153db8ce2a9141db | example-fragment-signal, missing-collocations, missing-distinctions, no-cloze-task, no-distinction-task | 2 |
| ashamed | kaikki:3343cebc1de6ecdeac | archaic-example, missing-collocations, missing-distinctions, no-distinction-task | 2 |
| berth | kaikki:df571578fb7b489b32 | archaic-example, missing-collocations, missing-distinctions, no-cloze-task, no-distinction-task | 2 |
| blight | kaikki:566b82cfc529e10fb2 | archaic-example, missing-collocations, missing-distinctions, no-cloze-task, no-distinction-task | 2 |
| blow | kaikki:a3f01b66593921f667 | archaic-example, example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 2 |
| calamity | kaikki:880becfdcb99b3632a | archaic-example, missing-collocations, missing-distinctions, no-distinction-task | 2 |
| catalogue | kaikki:6b9528573a451047e8 | archaic-example, missing-collocations, missing-distinctions, no-distinction-task | 2 |
| cheerful | kaikki:44a29f803802e6fec9 | archaic-example, missing-collocations, missing-distinctions, no-cloze-task, no-distinction-task | 2 |
| donkey | kaikki:0563adb1617892685c | example-fragment-signal, missing-collocations, missing-distinctions, no-distinction-task | 2 |
| everlasting | kaikki:9519cc534df40585ba | archaic-example, missing-collocations, missing-distinctions, no-cloze-task, no-distinction-task | 2 |

The complete fingerprinted queue is generated at `local/audits/vocabulary-quality.json`. It is an offline work artifact, not a published dictionary or an approval ledger. Export bounded packages by problem type using the workflow in [vocabulary-bulk-workflow.md](vocabulary-bulk-workflow.md).
