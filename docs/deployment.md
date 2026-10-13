# Deployment Runbook

## Configuration

The production frontend is https://ielts-fieldbook.pages.dev, connected to the `master` branch of `EnosElinsa/ielts-fieldbook`. GitHub Check runs `npm ci`, `npm test` and `npm run build`; Cloudflare Pages independently builds and publishes `dist`.

Browser builds use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Administrative seed scripts use `SUPABASE_SERVICE_ROLE_KEY`, plus `SUPABASE_URL` or the configured Vite URL. Keep administrator keys out of public assets, logs and Git.

## Release Order

1. Back up affected personal tables and the current public catalogue into gitignored `local/`.
2. Apply the timestamped SQL migrations in one transaction. Verify tables, policies and RPCs before frontend deployment.
   Register applied versions in `supabase_migrations.schema_migrations` when migrations are executed through the database management API. An empty history causes the Supabase GitHub integration to recreate existing tables. Verify each migration's objects before registering it; never mark an unexecuted migration as applied.
3. Seed the public question/vocabulary catalogue. Never publish personal source snapshots or answer history.
4. Import personal vocabulary through `commit_vocabulary_import` as the destination account. The batch ID makes retries idempotent and every row is committed in one transaction.
5. Commit reviewed source changes, merge to `master` and push. For the October 12 release, migration `20261011120000_exam_practice` is applied and registered, the final catalog is `local/exam-bank-final-v4/catalog.json` (SHA-256 `8dd491d4e0770336e7b529218af562ccdc1b76e77923e659597a88ff8bc82da0`), and the administrator seed has uploaded 248 private assets plus 56 papers, 392 sections, 168 passages and 4,339 question groups. The final v4 timing catalog has 120 generated intervals, 26 computationally reviewed corrections and zero unavailable timing; the final digest-skip reseed completed and was verified. The seed dry run reports only the two preserved source word-limit conflicts.
6. Inspect GitHub Check and the Cloudflare Pages check for that exact commit. Confirm the production HTML/assets and primary account workflows.

## Vocabulary Schema

Schema 10 adds public `word_entries`, `word_senses`, `word_relations`, `word_enrichments`, `wordbooks`, `wordbook_units` and `wordbook_memberships`. User-owned collections are `vocabulary`, `vocabulary_states`, `vocabulary_evidence`, `vocabulary_reviews`, `vocabulary_activities`, `wordbook_progress`, `wordbook_enrollments` and `vocabulary_import_batches`.

History tables are immutable. Mutable state uses the newer row timestamp. The legacy `lexicon` table remains readable only for migration and is not written by new clients. Every private table cascades with account deletion.

The practice upgrade adds `vocabulary_sessions` and `commit_vocabulary_session(jsonb)` through `20261010170000_vocabulary_sessions.sql`. Apply this additive migration before deploying the new client: account hydration reads the new table. Submission commits the session marker, reviews, evidence, activities and wordbook progress together; a retry uses the same session ID and immutable payload. Practice preferences are stored in profile settings, while unfinished responses remain in account-scoped browser recovery.

## Verification

Schema 11 adds shared read-only `exam_papers`, `exam_sections`, `exam_passages`, `exam_questions`, `exam_assets`; private `exam_attempts` and `intensive_sessions`; and a private `exam-assets` bucket. Apply `20261011120000_exam_practice.sql` before this frontend because account hydration reads both new private tables. Existing writing, speaking and vocabulary tables remain available.

Run `npm run seed:exams -- --dry-run` to inspect the catalog and asset manifest, then seed with `--apply` using administrator credentials. Confirm 56 papers, 224 listening parts, 168 reading passages and 4,480 answer slots. Sample one listening and reading section from every book; verify signed media, source answers, explanations and alignment provenance. Inspect the explicit source gap report. See [exam content runbook](exam-content.md) for acquisition and alignment. Frontend rollback preserves these additive tables and account history.

Verify source membership totals per book, public English content/provenance, the number of private imported answers, batch identity and wrong-word counts. Test account isolation with authenticated credentials. For UI checks, verify dictionary details, concealed dictation, review save/retry, wordbook chapter progress and mobile overflow.

Unknown source dates remain null with the original history identity and label. They must not be converted to fake dated review or FSRS events.

## Workflow And Identity Release

State v12 adds explicit planned targets and fixed vocabulary batches. The six book IDs, 206 unit IDs and 9,205 membership IDs are fixed in `src/domain/vocabulary/identityMapping.json`; entry and sense IDs retain their original identities. Provider names and licenses remain attribution.

Before the identity migration, create a complete administrator backup with `node scripts/backup-workspace.mjs <private-directory>`. The script checks all 35 tables and records row counts and SHA256 digests. Keep it outside the checkout used for cleanup. Run `npm run test:identities`, then `node scripts/build-identity-rehearsal.mjs` and execute the generated private SQL using the database management API. The rehearsal applies the migration twice, compares full-row SHA256 multisets with field-normalized originals, checks immutable triggers, and rolls back. It must pass before applying `20261013160000_neutral_vocabulary_identities.sql` and registering that version.

The migration takes workspace and table locks, aborts identity collisions, converts only identifier references, and restores the original history constraints. Legacy direct writes and import/session/workspace RPCs normalize identifiers before validation. RLS remains in force. Exact legacy PostgREST filters cannot find canonical rows; coordinate frontend publication with the migration and retain the prior released resource packs for old clients. Do not insert duplicate alias catalog rows.

After release, run `supabase/verify-neutral-vocabulary.sql`, compare account counts and preserved content/timestamps against the private backup, verify signed media and desktop/mobile workflows, and create a post-release backup. Keep the pre-release database snapshot, original Git bundle, commit SHA mapping and previous Pages resources available for rollback. A frontend rollback must retain the identity compatibility functions and the old resource packs.

The one-time Git title migration uses an isolated mirror and verifies every commit tree, author, dates and mapped parent graph. Publish only after checking the remote expected SHA, using `--force-with-lease=refs/heads/master:<expected-old-sha>`. Future pull requests use English Conventional Commit titles and squash merge.

## Recovery

A failed import RPC rolls back its entire batch. Retry the same batch ID after resolving the cause. Do not manually delete immutable history to retry.

If frontend release verification fails, roll back to the previous Cloudflare Pages deployment. Keep the additive vocabulary schema and its backup; do not drop populated private tables as a frontend rollback. The legacy table and the pre-release snapshot permit recovery of old data.

The October 12 release verified 602 passing tests, a passing production build, live account RLS isolation, 28 per-book catalog samples, database counts and all 248 private media sizes/checksum metadata with signed audio. The final v4 catalog seed completed. Commit `ff3462b` was merged into `master`, pushed and successfully deployed by Cloudflare Pages; GitHub Check and Supabase Preview also passed. Production smoke checks using a temporary account verified reading/listening submission and pause/resume, signed audio playback, wrong-answer navigation to the correct intensive sentence, dictation comparison, saved intensive progress and mobile listening statistics. The temporary accounts were deleted and cascading cleanup was verified. The sole flagged adjacent pair is an intentionally retained duplicate narrator substring.
