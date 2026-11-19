# Deployment Runbook

## Configuration

The production frontend is https://ielts-fieldbook.pages.dev, connected to the `master` branch of `EnosElinsa/ielts-fieldbook`. GitHub Check runs `npm ci`, `npm test` and `npm run build`; Cloudflare Pages independently builds and publishes `dist`.

Browser builds use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Administrative seed scripts use `SUPABASE_SERVICE_ROLE_KEY`, plus `SUPABASE_URL` or the configured Vite URL. Keep administrator keys out of public assets, logs and Git.

## Diagnostics and security policy rollout

Client diagnostics are disabled by default. Only the exact build setting `VITE_DIAGNOSTICS_ENABLED=true` enables collection; a browser's Do Not Track (`1`) or Global Privacy Control disables it. Set `VITE_RELEASE_SHA` to the released Git commit (7–40 hexadecimal characters) to attribute measurements. For Cloudflare Pages, a build command such as `VITE_RELEASE_SHA="$CF_PAGES_COMMIT_SHA" npm run build` supplies that value; absent or invalid values become `unknown`. These are public build settings and require a rebuild to change.

Enabled clients send up to 20 allowlisted numeric events per batch after ten seconds, when the page becomes hidden, or on page exit. Events cover LCP, INP, CLS, operation timings and coarse failure counts. Requests omit credentials and referrers. No account IDs, study content, error messages, stack traces, arbitrary labels or URLs are included. Collection is best effort and failures never block study saves or navigation; it is not a reliable audit trail. The same-origin Pages Function `/api/diagnostics` bounds request bodies to 4 KiB, validates values again and logs only the sanitized event shape. `public/_routes.json` invokes the function only for this endpoint.

The optional `DIAGNOSTICS` Analytics Engine binding receives release/event labels and numeric values. Without that binding, sanitized events still go to Cloudflare function logs. Before enabling client diagnostics, review access and retention for both logs and the optional dataset in the Cloudflare project; use the shortest available retention needed for release investigation. Provider request/access logs may contain network metadata independently of these application payloads. Do not log raw diagnostic bodies or add URLs, identifiers, messages or samples to analytics. Verify the exact deployed commit, send a synthetic event, and confirm only allowlisted fields appear. Remove the opt-in build setting and rebuild to stop client collection.

`public/_headers` enforces frame, base and object restrictions, MIME protection, referrer policy and feature permissions; microphone access remains available for recording. The broader script/style/connect policy is report-only. Its browser-generated `report-uri` CSP reports operate independently of client diagnostic opt-in and browser DNT/GPC handling; the edge discards document URLs, blocked URLs and source samples and retains only a coarse directive category. Keep raw reports out of logs. The report-only policy can report development tooling and browser-extension activity, so review real preview and production workflows before changing enforcement.

Roll out stricter CSP in a preview first, covering authentication, lazy routes, dictionaries, signed audio, recording and all three browser engines. Observe legitimate traffic across several days, identify required sources, then promote only verified directives to the enforced header. Inline styles currently need the report-only style allowance. A future nonce/hash or Trusted Types policy needs a separate compatibility review; do not enforce it blindly. HSTS starts with a five-minute lifetime; increase it only after HTTPS and relevant subdomains are verified. Roll back the affected header deployment if legitimate resources are blocked.

CI runs the unit-test shards before the build, type-suppression baseline, dictionary/quality, identity/SQL and bundle checks. The dedicated `tsconfig.checks.json` also checks the Pages Function, Playwright config, browser fixtures/specs and diagnostics tests as part of `tsc -b`. Chromium, Firefox and WebKit each run synthetic intercepted-account regressions with axe accessibility checks in a dedicated CI job. Each job retains its failure screenshots and traces for seven days. Local browser output goes outside the checkout. `npm run check:types` prevents new production `@ts-nocheck` files, including function and browser sources.

See the [17 November system quality record](releases/2026-11-17-system-quality.md) for this delivery's scope, recovery rehearsal and outstanding content, capacity and real-device acceptance work.

## Release Order

1. Back up affected personal tables and the current public catalogue into gitignored `local/backups/releases/<release>/`.
2. Apply the timestamped SQL migrations in one transaction. Verify tables, policies and RPCs before frontend deployment.
   Register applied versions in `supabase_migrations.schema_migrations` when migrations are executed through the database management API. An empty history causes the Supabase GitHub integration to recreate existing tables. Verify each migration's objects before registering it; never mark an unexecuted migration as applied.
3. Seed the public question/vocabulary catalogue. Never publish personal source snapshots or answer history.
4. Import personal vocabulary through `commit_vocabulary_import` as the destination account. The batch ID makes retries idempotent and every row is committed in one transaction.
5. Commit reviewed source changes, merge to `master` and push. For the October 12 release, migration `20261011120000_exam_practice` is applied and registered, the final catalog is `local/data/exams/bank-final-v4/catalog.json` (SHA-256 `8dd491d4e0770336e7b529218af562ccdc1b76e77923e659597a88ff8bc82da0`), and the administrator seed has uploaded 248 private assets plus 56 papers, 392 sections, 168 passages and 4,339 question groups. The final v4 timing catalog has 120 generated intervals, 26 computationally reviewed corrections and zero unavailable timing; the final digest-skip reseed completed and was verified. The seed dry run reports only the two preserved source word-limit conflicts.
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

If finished tasks reappear in Planning, open the updated planner and allow its schedule save to finish. It reconciles exact saved work before carryover and preserves the work's completion time; no data migration or history deletion is needed. Work without a reliable task association, partial reviews and productive mock stages remain unfinished rather than being guessed complete. A failed save stays retryable. Check the plan, linked record, start/completion timestamps and any explicit restoration before diagnosing a remaining case. See [planning rules](actionable-planning.md#recover-missed-days).

Local cleanup must retain private backups and historical public resource URLs. Keep active private banks under `local/data/`, compressed historical evidence under `local/archive/`, original backup data under `local/backups/`, cleanup manifests under `local/evidence/maintenance/` and final release logs under `local/logs/`. A raw historical directory can be removed only after every archived member passes checksum verification. See [workspace conventions](contributing.md#local-workspace).

The October 14 manual-test upgrade adds state v13 and the compatible
`exam_annotations` table through `20261014120000_exam_annotations.sql`.
Apply and register it before the frontend; verify its RLS, account cascade and
`commit_workspace_changes_neutral_rows` allowlist. The existing public explanations
require no catalogue reimport. Run complete tests, production build, identity/SQL
checks and bundle budget checks for each delivery. Confirm actual recorded audio,
per-prompt saves, annotation recovery and exact-source vocabulary review in a
preview and production. The administrator backup now verifies 36 tables. Preserve
the additive annotation table and user data when rolling back the frontend.
See [manual-test release record](releases/2026-10-14-manual-test-fixes.md).

A failed import RPC rolls back its entire batch. Retry the same batch ID after resolving the cause. Do not manually delete immutable history to retry.

If frontend release verification fails, roll back to the previous Cloudflare Pages deployment. Keep the additive vocabulary schema and its backup; do not drop populated private tables as a frontend rollback. The legacy table and the pre-release snapshot permit recovery of old data.

The October 12 release verified 602 passing tests, a passing production build, live account RLS isolation, 28 per-book catalog samples, database counts and all 248 private media sizes/checksum metadata with signed audio. The final v4 catalog seed completed. Commit `ff3462b` was merged into `master`, pushed and successfully deployed by Cloudflare Pages; GitHub Check and Supabase Preview also passed. Production smoke checks using a temporary account verified reading/listening submission and pause/resume, signed audio playback, wrong-answer navigation to the correct intensive sentence, dictation comparison, saved intensive progress and mobile listening statistics. The temporary accounts were deleted and cascading cleanup was verified. The sole flagged adjacent pair is an intentionally retained duplicate narrator substring.
