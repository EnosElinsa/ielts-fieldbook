# Vocabulary content and provenance

The catalogue in `src/domain/vocabulary/catalog.ts` contains original English starter material for IELTS writing, reading and listening practice. The definitions, examples and collocations are editorial work under CC-BY-4.0, attributed to “Fieldbook editorial”. They are not represented as human-reviewed or as copied from a commercial book.

`public/vocabulary-dictionary.json` contains separately attributed English Wiktionary multi-sense definitions fetched through its public REST API. It loads on demand in the entry view. Selecting a dictionary sense adds that sense to personal learning without recording a successful retrieval. Refresh using `npm run fetch:vocabulary-dictionary`; unavailable terms remain explicit, and successful prior records are retained on retry. The definitions are English-only, with CC-BY-SA-4.0 attribution and source URLs per sense.

System-derived `familiar` requires at least three successful retrievals in every dimension over at least 24 hours. System-derived `mastered` requires five in every dimension over at least 24 hours and two externally assessed production successes over at least 24 hours. Rapid drills and self-reported sentence use cannot establish stable mastery. The user's manual label remains independent.

The six Guixue books contain 9,205 verified source memberships: 10174 (3,632), 10176 (376), 11320 (3,051), 10177 (1,399), 21953 (361), and 10216 (386). The release catalogue in `public/vocabulary-catalog.json` contains all 7,021 unique terms and their exact source groups. Book coverage is complete and separately reported from dictionary coverage. The small embedded TypeScript catalogue remains an original editorial fallback, rather than a replacement for the released source lists.

The release includes 5,853 open English dictionary entries and 51,354 senses. Per-term JSON files in `public/dictionary/` load through a hashed filename index, keeping large dictionaries out of the initial page bundle. Audio, IPA, word families and relations use their retained source attribution. The 1,168 unmatched terms are mainly phrases or unusual forms; they stay available for dictation with definitions marked pending. `public/vocabulary-content-manifest.json` records source totals and dictionary coverage.

The public importer accepts CSV vocabulary files. `src/domain/vocabulary/import.ts` retains internal legacy snapshot parsing for existing backups and migrated account data. It preserves source identity and dated evidence without fabricating scheduling events from undated summaries. CSV entries remain personal notes. Chinese definitions/examples are excluded from the runtime vocabulary and batch fingerprints.

`scripts/enrich-vocabulary.mjs` streams a locally downloaded Kaikki.org/Wiktionary English JSONL export, or an HTTPS JSONL URL on the official `kaikki.org` host, filters a supplied term list, and atomically writes a small attribution-bearing enrichment file. It records definitions, usage examples, IPA and available synonyms/antonyms with source/license per sense. Review generated content before publishing; Wiktionary-derived content must retain its CC-BY-SA-4.0 attribution and share-alike terms. Do not commit dictionary dumps, provider credentials, or raw authenticated exports.

```text
node scripts/enrich-vocabulary.mjs --input dictionary.jsonl --terms terms.txt --output enrichments.json
node scripts/enrich-vocabulary.mjs --input dictionary.jsonl --terms guixue-snapshot.json --output enrichments.json
```

`scripts/seed-vocabulary.mjs` seeds the released JSON catalogue when present, otherwise the TypeScript editorial fallback. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in the deployment environment after applying the vocabulary migration. Keys never appear in output. The script checks content licenses, rejects personal history in the public catalogue, and seeds entries, senses, relations, enrichment provenance, books, units and memberships in repeatable upsert batches. It never seeds an authenticated personal snapshot.

The `reviewed-2026-10-10.1` learning supplement is applied at read time. It preserves original entry and dictionary sense identities, learner notes, historical marks and scheduling. Its dictionary priority audit checks all 7,021 catalogue terms and 51,354 dictionary senses; conservative automated ranking corrects 143 default senses, including medical care for *treat* and cooking instructions for *recipe*. Automated ranking is not an exhaustive human review. Dictionary-derived additions retain their CC-BY-SA-4.0 license and attribution. Original contextual exercises are Fieldbook editorial material under CC-BY-4.0.

Synonym/paraphrase and confusing-word exercises use explicit contextual answers, independently of raw dictionary synonym lists. Cloze tasks use complete word boundaries and explicit sentence forms, such as *began*. Counts below describe primary learning content before personal edits or archival; the application reports the actual available subset for each group.

| Wordbook | Unique words | Cloze | Synonym/paraphrase | Confusing words |
| --- | ---: | ---: | ---: | ---: |
| IELTS Vocabulary | 3,592 | 2,210 | 68 | 8 |
| IELTS Reading Keywords | 376 | 240 | 59 | 1 |
| IELTS Listening Vocabulary | 3,012 | 1,217 | 26 | 6 |
| IELTS Listening Essentials | 1,351 | 591 | 16 | 4 |
| IELTS Listening Practice 21 | 344 | 224 | 10 | 2 |
| IELTS Listening Practice 20 | 375 | 218 | 6 | 2 |

Authored task coverage is incomplete. Unsupported words remain available for dictation; an explicitly started specialist subset never completes the whole group. New sessions freeze prompts, accepted answers, explanations and content version. Legacy drafts retain their original scoring behavior.
