# Full dictionary editorial audit

Run: `node scripts/audit-vocabulary-dictionary.mjs`. Source records and stable identities are retained.

The complete index has **5,853 terms, 51,354 preserved raw senses and 34 restored submeanings** (51,388 total). This ledger verifies **356 senses** across definition, example, collocations and distinctions; **51,032 remain pending**. Earlier default-learning patches are not counted as full dictionary review. 48 reviewed distinction exercises and 38 exact-bound diagrams accompany this batch. Diagram coverage is additional to the four text areas, not implied for every reviewed sense.

| Term | Reviewed text senses | Raw + restored senses | Pending |
| --- | ---: | ---: | ---: |
| account | 13 | 13 | 0 |
| bank | 14 | 45 | 31 |
| capital | 11 | 18 | 7 |
| charge | 13 | 34 | 21 |
| condition | 17 | 17 | 0 |
| current | 6 | 9 | 3 |
| field | 33 | 33 | 0 |
| form | 32 | 32 | 0 |
| ground | 39 | 39 | 0 |
| interest | 8 | 14 | 6 |
| issue | 31 | 33 | 2 |
| matter | 12 | 12 | 0 |
| range | 38 | 38 | 0 |
| rate | 13 | 27 | 14 |
| scale | 34 | 34 | 0 |
| state | 11 | 11 | 0 |
| subject | 17 | 17 | 0 |
| value | 14 | 14 | 0 |

## Raw-source signals

19,292 raw senses lack examples; 51,354 lack collocations; 51,354 lack distinction notes. 3,855 examples trigger an archaic, truncated or relation-text signal. These counts describe preserved raw source data. They do not describe all currently displayed defaults, and flags do not prove linguistic errors.

## Review rules

Each ledger row binds a catalogue entry, dictionary sense and SHA-256 of its original record. The audit rejects stale hashes, missing identities, incomplete reviewed fields, invalid exercises and diagrams that do not match the exact reviewed definition and part of speech. Restored submeanings additionally require a preserved parent fingerprint, a revision-bound Wiktionary URL, the exact source definition line and independent source/evidence alignment. Their counts are separate from preserved raw-source signals. Personal edits and frozen sessions are outside this public editorial ledger. Specialised, historical and proper-name senses remain pending until examined; they are not silently excluded.

The ignored `local/audits/vocabulary-dictionary.json` contains every source identity, fingerprint, status and signal for subsequent batches. Run with `--check` to validate without rewriting reports. Passing this check verifies accounting and bindings, not completion of the dictionary.
