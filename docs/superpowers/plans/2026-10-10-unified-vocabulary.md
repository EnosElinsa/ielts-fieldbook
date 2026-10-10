# Unified Vocabulary Implementation Record

Goal: replace Phrases with an English-only vocabulary domain shared by wordbooks and writing/speaking, with extensible listening/reading evidence.

Branch: `codex/unified-vocabulary`, based on `6ea58c0`.

## Completed

- [x] Schema 10 vocabulary entries, independent senses, source occurrences and learning state.
- [x] FSRS scheduling, independent manual familiarity and spaced recovery of wrong words.
- [x] Dictation, definition recall, contextual cloze, distinction selection, audio loops and sentence production.
- [x] New routes, navigation, review/wordbook/detail/error/progress views and transactional import dialog.
- [x] Writing/speaking pending usage evidence; externally assessed exact quotations confirm production.
- [x] Reading/listening evidence contracts and source filters.
- [x] Legacy data migration, backup merging, RLS personal collections, immutable history and atomic import RPC.
- [x] Six verified public source-book hierarchies, 72 original editorial starter terms and attributed English dictionary data.
- [x] Authenticated Guixue exporter, idempotent JSON/CSV imports, licensed dictionary enrichment and public seed script.
- [x] Regression fixes for persistent identities, sense collisions, source-sense bindings, placeholder enrichment and concurrent import saves.
- [x] Desktop/mobile browser checks with an intercepted test backend; full unit and component test suite.

## Release On 2026-10-10

- [x] Apply `20261010090000_unified_vocabulary.sql` to production after backing up existing vocabulary/profile data. Verified all 15 new tables.
- [x] Capture the authorised Guixue session and verify all six books: 9,205 source memberships and 7,021 unique terms, with no failed source reads.
- [x] Import 6,175 personal historical answers, 51 current wrong words, 67 studied groups and six enrollments through an atomic account-scoped transaction. Source answers have no trustworthy dates; retain null dates and source identities without fabricated FSRS history.
- [x] Publish 5,853 attributed open-dictionary entries with 51,354 senses, independent of source-book metadata. Keep 1,168 unmatched phrases/forms explicitly pending.
- [x] Update repository positioning, topics, homepage, README and deployment documentation.
- [x] Merge the verified implementation to `master` and push `e3c8b2f`. GitHub Check and Cloudflare Pages succeeded. Production real-account checks passed.
- [x] Repair Supabase migration history after its preview integration attempted to recreate existing tables. Verify and register all four migrations; apply the previously missing account-delete function without deleting any account data.

## Validation

Baseline: 164 tests passed. Release suite: 214 tests passed in 41 files. Production build and real-account browser checks passed after the identity, source-filter, concurrent-import and large-account hydration fixes. Build retains the existing large-chunk warning. Linear normalization of all 7,021 terms measured 133 ms.

PostgreSQL validation exercised transactional rollback, idempotency, immutable history, account ownership, catalogue/legacy read-only policies and account cascades through PGlite. The verified migration was applied to production on 2026-10-10.

Playwright used installed Chrome because the Browser plugin was unavailable. Desktop 1440x1000 and mobile 390x844 rendered without framework errors or horizontal overflow. Real-account checks against the migrated production database showed 7,021 entries, 51 active wrong words, 100 visible paginated rows, 89 vocabulary-book chapter/group rows, working dictionary details and no failed requests. Earlier interactive checks covered concealed dictation and saved distinction results against an intercepted backend.

Production release: https://ielts-fieldbook.pages.dev. Real account verification confirmed 7,021 entries, 51 wrong words, complete source-book structure, working dictionary details and 100-row pagination. The 6,175 undated source answers remain privately stored with original identity. Production database migration preceded frontend release.
