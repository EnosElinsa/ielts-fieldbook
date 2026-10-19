# Core study content review — 2026-10-19

This review addresses observed learning-card gaps across 12 words and 21 exact meanings. It does not complete the other meanings of these words or publish the preserved round50 draft. All imported source records and IDs remain unchanged.

The common cards now use short, independently authored examples, collocations, usage notes and a contextual distinction question. Copy and discount receive usable headword sentence gaps. Feedback and equipment explain ordinary uncountable use instead of displaying the extraction fragment `usually`. Assignment and survey prefer the student-task and respondent-study meanings on standalone entry pages. Authored source/group meanings keep their own identities and examples.

No new diagram is required for these language distinctions. Existing visual presentation rules continue to apply. No shape-count or field-completeness check is treated as evidence of learning value or language accuracy.

This is a text/exercise review, with no new pronunciation bindings. Browser inspection found that discount's noun still uses the entry-level pronunciation display; its noun/verb stress contrast and matched recordings remain a separate tracked review. Existing sense-pronunciation bindings are unchanged.

## Reviewed identities and fixed sources

Each selected raw sense was matched by exact original definition and part of speech to one English gloss in the cited source revision. The ledger fingerprints the complete original sense; the supplement retains that original separately from the authored learning text.

| Word | Reviewed source sense IDs (suffix after `kaikki:`) | Source revision | Learning focus |
| --- | --- | --- | --- |
| deadline | a541cd5a83d8ebff08 | [92132574](https://en.wiktionary.org/w/index.php?title=deadline&oldid=92132574) | Final permitted submission time; meet/miss a deadline. |
| essential | 7c95583dfa4ff01514 | [93513959](https://en.wiktionary.org/w/index.php?title=essential&oldid=93513959) | Necessity, with a modern example replacing the default poem. |
| feedback | a228205c0dbe3f4e63 | [93570057](https://en.wiktionary.org/w/index.php?title=feedback&oldid=93570057) | Comments on work; normally uncountable in this use. |
| assignment | d001f9fbce92236138, 972845ca1807c9a747 | [91970510](https://en.wiktionary.org/w/index.php?title=assignment&oldid=91970510) | Allocating work versus a student task; assignments versus homework. |
| survey | 828041b20d3ff09acf, 58e6bd082054859eeb, ae4427a1ea68c95495, 84c4e501a6bc8681da | [93468666](https://en.wiktionary.org/w/index.php?title=survey&oldid=93468666) | Overview, respondent study, questionnaire and asking respondents questions. |
| article | 51fde7909a602da5fe, 5327746118ce8e10cf | [93045264](https://en.wiktionary.org/w/index.php?title=article&oldid=93045264) | A piece of writing versus a grammatical article. |
| council | af522fc5fc9b051a89 | [93569176](https://en.wiktionary.org/w/index.php?title=council&oldid=93569176) | A governing/representative body; council versus counsel. |
| environment | 8c74df2a3f4aadff30, e561324756c4d5522b | [93548034](https://en.wiktionary.org/w/index.php?title=environment&oldid=93548034) | Surrounding conditions versus the natural world. |
| budget | 4b5d55fbe9da7fe5b2, a9b7f0c71fcf15cefb | [92810394](https://en.wiktionary.org/w/index.php?title=budget&oldid=92810394) | Available funds versus a financial plan; planned versus actual spending. |
| equipment | 8d82739194a584c438 | [93589550](https://en.wiktionary.org/w/index.php?title=equipment&oldid=93589550) | Tools/items; pieces of equipment in ordinary modern English. |
| copy | 8ebccf79b5c10f20cd | [93140524](https://en.wiktionary.org/w/index.php?title=copy&oldid=93140524) | Duplicate versus original; a countable copy/copies. |
| discount | d9dfbbdde5eccbbc0b, d741a2ffee17dc9a2d, 0f0c4d9616b9da6402 | [93072753](https://en.wiktionary.org/w/index.php?title=discount&oldid=93072753) | Selling at a reduced price, the reduction itself and disregarding information. |

Feedback and equipment are marked `en-noun|-|s` in their sources, so the learning notes say normally uncountable in the stated ordinary use. They do not claim that every plural in older or specialist writing is impossible. The equipment source itself preserves Longfellow's plural equipments.

Questions ask about an explicit meaning or ordinary construction. They do not declare interchangeable synonyms uniquely wrong. Each of the 21 questions has two distinct options, an explanation and its own exact sense identity. New examples demonstrate the selected meaning and permit a sentence gap without inventing a morphological binding for a different example.

## Boundaries and retained state

The editorial ledger advances from 3,210 to 3,231 reviewed meanings; 48,757 of the current 51,988 meanings remain pending. All 21 classifications are authored general learning priorities. This count does not include automated candidates, earlier default-only patches or source lines not examined here. There are no new restored records or diagrams.

The fixed pages also expose unimported source children, including council's UK local-authority use, assignment's sex-categorisation child, and copy's genetics and advertising children plus its radio acknowledgement. They require later independent reconciliation and attribution; this partial learning review does not silently count them as covered. The current imported/restored inventory is not a claim that those pages have no further lexical content.

`resourceCoreStudyContentBaseline.json` reverses only this delivery's corrections/defaults when rebuilding previous releases. Previously published teaching snapshots are retained for recognising untouched saved content. Personal replacements and frozen sessions keep their existing contracts. Source-specific group material is not rewritten into these general examples.

Browser validation exposed a second update boundary: an explicit standalone meaning could fall back to a group binding, then incorrectly be treated as if that group had been requested. Discount's noun therefore retained a group's swimming-lesson example and skipped its new review. Context-specific preservation now requires the requested book and unit to match that binding. Explicit standalone selection receives the exact-sense review; a matching group and an edited personal example retain their own text. The regression reproduced the old behavior before the fix, and the 53 context/core-content tests passed after it.

Eight regressions first reproduced the old poem, default-selection mismatch, unavailable copy/discount gaps and incomplete countability notes. A ninth reproduced the saved equipment default being mistaken for a personal edit: its previously published full snapshot is now recognised, while a learner's edited usage note remains intact. The focused readiness, dictionary review, priority and content suites passed 4,301 tests before that additional regression; the final complete validation is recorded below.

## Resource generation

The first full regression exposed a deterministic-resource rebuild exceeding its existing 15-second deadline. Profiling showed repeated serialization of unchanged nested JSON records across retained releases. The generator now caches those immutable fragments within each independent build. Measured generation fell from about 11.6 seconds to 8–9 seconds on the local machine; the deterministic rebuild regression passed in 9.8 seconds. The deadline and historical releases remain unchanged. Every one of the 2,676 generated resource URLs and SHA-256 values matches the unoptimized result, including all 2,566 previously published resources. A native JSON byte regression also checks the emitted manifest, discovery index, group and entry/teaching packs. This is build-time work and does not claim faster browser hydration.

Complete regression, build and browser/release results are recorded in the delivery evidence; field presence alone does not certify content quality or memory improvement.

## Final local validation

The final tree includes the preceding planning-recovery release (`67ef2e7`). All 202 test files pass: 7,330 tests pass and one conditional test is skipped. Type checking, production build, dictionary audit, compact/public identity checks, neutral-identity SQL and bundle budgets pass. Four serial Chrome layouts (1440/light, 1440/dark, 390/dark and 320/light) pass 140 states with no console errors or unexpected horizontal overflow. They cover all 21 reviewed meaning cards, notes, common/all dictionary search, a source-specific assignment example, four actual submissions and returns to the exact practiced sense. Synthetic accounts intercept persistence writes. Representative desktop and mobile captures were visually inspected. Production assets and the same browser flows are verified separately against the released commit.
