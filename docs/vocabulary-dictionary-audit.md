# Full dictionary editorial audit

Run: `node scripts/audit-vocabulary-dictionary.mjs`. Source records and stable identities are retained.

The complete index has **5,853 terms, 51,354 preserved raw senses and 102 restored submeanings** (51,456 total). This ledger verifies **646 senses** across definition, example, collocations and distinctions; **50,810 remain pending**. Earlier default-learning patches are not counted as full dictionary review. 111 reviewed distinction exercises and 61 exact-bound diagrams accompany this batch. Diagram coverage is additional to the four text areas, not implied for every reviewed sense. 3 reviewed records are spelling-error references, retained for reading and excluded from new practice queues.

| Term | Reviewed text senses | Raw + restored senses | Pending |
| --- | ---: | ---: | ---: |
| account | 13 | 13 | 0 |
| adapt | 5 | 5 | 0 |
| adopt | 9 | 9 | 0 |
| affect | 15 | 15 | 0 |
| bank | 45 | 45 | 0 |
| capital | 19 | 19 | 0 |
| charge | 45 | 45 | 0 |
| condition | 17 | 17 | 0 |
| current | 10 | 10 | 0 |
| effect | 14 | 14 | 0 |
| field | 33 | 33 | 0 |
| form | 32 | 32 | 0 |
| ground | 39 | 39 | 0 |
| interest | 14 | 14 | 0 |
| issue | 31 | 33 | 2 |
| matter | 12 | 12 | 0 |
| mean | 34 | 35 | 1 |
| patient | 7 | 7 | 0 |
| practice | 12 | 12 | 0 |
| principal | 18 | 18 | 0 |
| principle | 11 | 11 | 0 |
| raise | 32 | 32 | 0 |
| range | 38 | 38 | 0 |
| rate | 27 | 27 | 0 |
| rise | 38 | 38 | 0 |
| scale | 34 | 34 | 0 |
| state | 11 | 11 | 0 |
| subject | 17 | 17 | 0 |
| value | 14 | 14 | 0 |

## Raw-source signals

19,292 raw senses lack examples; 51,354 lack collocations; 51,354 lack distinction notes. 3,855 examples trigger an archaic, truncated or relation-text signal. These counts describe preserved raw source data. They do not describe all currently displayed defaults, and flags do not prove linguistic errors.

## Review rules

Each ledger row binds a catalogue entry, dictionary sense and SHA-256 of its original record. The audit rejects stale hashes, missing identities, incomplete reviewed fields, invalid exercises and diagrams that do not match the exact reviewed definition and part of speech. Restored submeanings additionally require a preserved parent fingerprint, a revision-bound Wiktionary URL, the exact source definition line and independent source/evidence alignment. Their counts are separate from preserved raw-source signals. Personal edits and frozen sessions are outside this public editorial ledger. Specialised, historical and proper-name senses remain pending until examined; they are not silently excluded.

The ignored `local/audits/vocabulary-dictionary.json` contains every source identity, fingerprint, status and signal for subsequent batches. Run with `--check` to validate without rewriting reports. Passing this check verifies accounting and bindings, not completion of the dictionary.
