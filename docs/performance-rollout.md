# Performance rollout

This change keeps Cloudflare Pages, Supabase, schema v11, and the existing backup format. The new workspace RPC is a deployment prerequisite. No production migration or deployment is performed by the local verification scripts.

## Release order

1. Apply `supabase/migrations/20261013120000_workspace_commits.sql` to a staging database containing all earlier migrations. The migration adds account-scoped replay receipts, the `commit_workspace_changes(batch)` transaction, catalog indexes, and server-clock wrappers around the existing vocabulary transactions. Run the SQL regression harness against a fresh local database first. Confirm staged RPC availability with a disposable account before deploying the frontend.
2. Release the login split and vocabulary resources. Verify login requests contain no teaching, graph, or audio modules. Open a complete group, including a large group, and verify source order, word count, original/editable senses, licensing, manual familiarity, wrong-word recovery, and frozen assessments. A directory loads metadata; group and entry scopes download content only when needed.
3. Release catalog reuse and atomic saves. Verify repeated navigation, stale background refresh and failure retry, signed audio expiry, and account change isolation. A normal changed save makes one write RPC. A repeated operation ID confirms the prior transaction; different content under that ID is rejected.
4. Release account modules. Base startup loads profile, plans, and drafts; routes wait only for required histories. Export/merge/repair waits for a complete account. Validate late module hydration alongside new edits, including vocabulary teaching metadata still loading during autosave.

The implementation is integrated on `codex/performance`; the three intermediate release candidates have not been assembled or published. Assemble and test those candidates in the order above before starting a phased production rollout. Do not publish the final frontend ahead of the RPC migration. Keep each deployment's source SHA, generated resource URLs, JS/CSS hashes, test results, and benchmark report together. See `performance-results.md` for measured acceptance gaps.

## Verification commands

```sh
npm test
npm run build
node scripts/check-bundle-budget.mjs
PGLITE_MODULE=/path/to/@electric-sql/pglite node tests/storage/workspace-commit-sql.cjs
node scripts/performance-benchmark.mjs --runs=15 --url=http://127.0.0.1:8002 --source-ref=working-tree --env=.env --out=local/performance/optimized.json --screenshots=local/performance/screenshots
```

The browser script supports `--playwright=/absolute/path/to/playwright/index.mjs` and uses installed Chrome. It needs the build's Supabase URL to derive a storage key. It creates a synthetic session and intercepts every external request; it never reads account content or writes to a real database. Desktop is 1440×900 at normal CPU speed; mobile is 390×844 at 4× CPU slowdown. Both use 10 Mbps and 150 ms latency, 15 samples, and nearest-rank p75. Intercepted backend responses include the equivalent latency and transfer cost. Record local fixture results separately from online results, which include real routing and connection delays.

Reports include fixture/source/served-asset hashes, requests, transfers, main-thread long tasks, and intercepted write counts. Auth-relative time starts when Supabase consumes the injected session; it excludes a real server token-validation round trip. First-group and direct-practice measurements include a cold document load. Group revisit uses client navigation in the same session. The script verifies all 55 group members and persisted settings before recording success. A screenshot is saved for the first run of each scenario.

## Cache and recovery

Catalog reads share concurrent requests and have a five-minute TTL. Expired content remains visible during refresh and after refresh failure. Explicit retry requests fresh data. Identity generation and cache clearing reject old results on reset; private content lives only in session memory. Audio URLs refresh 60 seconds before expiry; full audio is not cached by this layer.

Vocabulary manifests and teaching indexes must revalidate. Hashed groups, entry shards, and teaching resources cache for one year. The loader allows at most four simultaneous downloads and bounds failed requests. Static failure falls back to the same Supabase scope while independent teaching resources preserve reviewed content. Original public files and earlier RPC signatures remain available for seed scripts and rollback.

Autosave waits 800 ms and replaces consecutive unsent automatic snapshots. Explicit saves form ordering barriers. Only collections already merged into the workspace participate in differences; fetched-but-unmerged collections are excluded. Acknowledgement updates only the committed baseline. Failed drafts remain recoverable and identical retries reuse the operation ID. Vocabulary import and assessment history retain specialized transactions and immutable-history rules.

## Online validation and rollback

After each staged publication, verify the exact deployment's asset hashes and run the same six scenarios on desktop and mobile. Also verify a real account's signed audio renewal, backup histories, ordinary saves, and specialized vocabulary submissions. Compare errors and write/request counts alongside timings.

If a frontend regression appears, restore the previous Cloudflare deployment. Retain additive tables, commit receipts, and personal records; do not reverse the migration by deleting data. Keep the original source data and previous deployment artifacts available. After building each new release, carry forward the previous release's hashed resources before publishing:

```sh
node scripts/retain-vocabulary-resources.mjs --from=/absolute/path/to/previous-release/dist --to=dist
```

Archive that combined artifact for the next release. This additive command verifies every content hash, rejects symlinks/collisions, preserves the current manifest, and retains older manifests and packs for clients across deployments. The first release has no prior hashed packs to retain. Do not silently skip retention after that first release.

`fieldbook:performance` events contain only a fixed operation label, duration, and failure flag. `performanceSummary()` returns a bounded recent timing list and aggregate request/transfer/long-task counters; it stores no account identifiers, URLs, answers, or prompts and sends nothing externally. An analytics consumer must keep those same limits. Production error-rate collection requires wiring an approved anonymous sink before claiming centralized monitoring.

If real connection establishment remains dominant after these changes, investigate service region and routing separately. Offline editing and cross-device edit reconciliation are outside this change.
