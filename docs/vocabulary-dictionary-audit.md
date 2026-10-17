# Full dictionary editorial audit

Run: `node scripts/audit-vocabulary-dictionary.mjs`. Source records and stable identities are retained.

The complete index has **5,853 terms, 51,354 preserved raw senses and 193 restored submeanings** (51,547 total). This ledger verifies **1137 records** across definition, examples or reading explanations, collocations and distinctions; **50,410 remain pending**. Earlier default-learning patches are not counted as full dictionary review. 247 reviewed distinction exercises and 100 exact-bound diagrams accompany this batch. Diagram coverage is additional to the four text areas, not implied for every reviewed sense. 5 reviewed records are spelling-error references, retained for reading and excluded from new practice queues. 180 explicitly classified reading explanations are labelled Reading note and excluded from new sentence-gap tasks. 7 reviewed records are source organisation headings, labelled Meaning group and excluded from the initial learning-notes list and all new practice modes. They are references, not individual lexical meanings. Source phrase-list references: 1. These are labelled Usage reference, accessible under All meanings and excluded from new practice. Earlier batches still need example-type annotation.

| Term | Reviewed records | Raw + restored records | Pending |
| --- | ---: | ---: | ---: |
| account | 13 | 13 | 0 |
| adapt | 5 | 5 | 0 |
| address | 30 | 31 | 1 |
| adopt | 9 | 9 | 0 |
| affect | 15 | 15 | 0 |
| bank | 45 | 45 | 0 |
| bear | 61 | 61 | 0 |
| capital | 19 | 19 | 0 |
| charge | 45 | 45 | 0 |
| condition | 17 | 17 | 0 |
| conduct | 14 | 14 | 0 |
| content | 17 | 18 | 1 |
| contract | 18 | 18 | 0 |
| current | 10 | 10 | 0 |
| effect | 14 | 14 | 0 |
| fair | 35 | 35 | 0 |
| field | 33 | 33 | 0 |
| fine | 44 | 44 | 0 |
| form | 32 | 32 | 0 |
| ground | 39 | 39 | 0 |
| interest | 14 | 14 | 0 |
| issue | 31 | 33 | 2 |
| lay | 46 | 46 | 0 |
| lead | 69 | 69 | 0 |
| lie | 23 | 23 | 0 |
| match | 21 | 21 | 0 |
| matter | 12 | 12 | 0 |
| mean | 34 | 35 | 1 |
| minute | 16 | 16 | 0 |
| object | 11 | 11 | 0 |
| patient | 7 | 7 | 0 |
| practice | 12 | 12 | 0 |
| present | 34 | 35 | 1 |
| principal | 18 | 18 | 0 |
| principle | 11 | 11 | 0 |
| produce | 11 | 11 | 0 |
| project | 16 | 18 | 2 |
| raise | 32 | 32 | 0 |
| range | 38 | 38 | 0 |
| rate | 27 | 27 | 0 |
| record | 16 | 17 | 1 |
| refuse | 9 | 9 | 0 |
| rise | 38 | 38 | 0 |
| scale | 34 | 34 | 0 |
| state | 11 | 11 | 0 |
| subject | 17 | 17 | 0 |
| value | 14 | 14 | 0 |

## Raw-source signals

19,292 raw senses lack examples; 51,354 lack collocations; 51,354 lack distinction notes. 3,855 examples trigger an archaic, truncated or relation-text signal. These counts describe preserved raw source data. They do not describe all currently displayed defaults, and flags do not prove linguistic errors.

## Review rules

Each ledger row binds a catalogue entry, dictionary sense and SHA-256 of its original record. The audit rejects stale hashes, missing identities, incomplete reviewed fields, invalid exercises and diagrams that do not match the exact reviewed definition and part of speech. Restored submeanings additionally require a preserved parent fingerprint, a revision-bound Wiktionary URL, the exact source definition line and independent source/evidence alignment. Grouping references require an exact top-level nongloss or explicitly labelled source heading, independently bound restored children at the same source revision, and no exercise or diagram. Usage references require a source phrasal-verb template with wording consistent with the original record, a revision-bound URL and no exercise or diagram. Their counts are separate from preserved raw-source signals. Personal edits and frozen sessions are outside this public editorial ledger. Specialised, historical and proper-name senses remain pending until examined; they are not silently excluded.

The ignored `local/audits/vocabulary-dictionary.json` contains every source identity, fingerprint, status and signal for subsequent batches. Run with `--check` to validate without rewriting reports. Passing this check verifies accounting and bindings, not completion of the dictionary.
