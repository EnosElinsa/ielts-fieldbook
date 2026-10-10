# Deployment Runbook

## Configuration

The production frontend is https://ielts-fieldbook.pages.dev, connected to the `master` branch of `EnosElinsa/ielts-fieldbook`. GitHub Check runs `npm ci`, `npm test` and `npm run build`; Cloudflare Pages independently builds and publishes `dist`.

Browser builds use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Administrative seed scripts use `SUPABASE_SERVICE_ROLE_KEY`, plus `SUPABASE_URL` or the configured Vite URL. Keep administrator keys out of public assets, logs and Git.

## Release Order

1. Back up affected personal tables and the current public catalogue into gitignored `local/`.
2. Apply the timestamped SQL migrations in one transaction. Verify tables, policies and RPCs before frontend deployment.
3. Seed the public question/vocabulary catalogue. Never publish personal source snapshots or answer history.
4. Import personal vocabulary through `commit_vocabulary_import` as the destination account. The batch ID makes retries idempotent and every row is committed in one transaction.
5. Commit reviewed source changes, merge to `master` and push.
6. Inspect GitHub Check and the Cloudflare Pages check for that exact commit. Confirm the production HTML/assets and primary account workflows.

## Vocabulary Schema

Schema 10 adds public `word_entries`, `word_senses`, `word_relations`, `word_enrichments`, `wordbooks`, `wordbook_units` and `wordbook_memberships`. User-owned collections are `vocabulary`, `vocabulary_states`, `vocabulary_evidence`, `vocabulary_reviews`, `vocabulary_activities`, `wordbook_progress`, `wordbook_enrollments` and `vocabulary_import_batches`.

History tables are immutable. Mutable state uses the newer row timestamp. The legacy `lexicon` table remains readable only for migration and is not written by new clients. Every private table cascades with account deletion.

## Verification

Verify source membership totals per book, public English content/provenance, the number of private imported answers, batch identity and wrong-word counts. Test account isolation with authenticated credentials. For UI checks, verify dictionary details, concealed dictation, review save/retry, wordbook chapter progress and mobile overflow.

Unknown source dates remain null with the original history identity and label. They must not be converted to fake dated review or FSRS events.

## Recovery

A failed import RPC rolls back its entire batch. Retry the same batch ID after resolving the cause. Do not manually delete immutable history to retry.

If frontend release verification fails, roll back to the previous Cloudflare Pages deployment. Keep the additive vocabulary schema and its backup; do not drop populated private tables as a frontend rollback. The legacy table and the pre-release snapshot permit recovery of old data.
