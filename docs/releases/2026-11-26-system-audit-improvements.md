# System audit improvements — 26 November 2026

## Scope

This delivery implements verified reliability, accessibility, input-method, visual-polish, and performance improvements from the 26 November system audit on branch `codex/system-audit-improvements` (ahead of `master` at `99cddce0`). It does not deploy to production, run a database migration, reseed catalogues, or replace real-device, assistive-technology, or editorial acceptance testing.

| Area | Result |
| --- | --- |
| Build & vocabulary resources | Reused shared scope slices, cached JSON serialization per pack slice, and stored retained historical resources as UTF-8 bytes in `scripts/vocabularyResources.ts`. Vite dev mode starts from the current-only catalog (`includeHistory: false`) and falls back lazily to the retained historical archive if an older URL is requested. |
| Bundle splitting | Separated React, Supabase, Radix, and Recharts (`charts`) vendor chunks, extracted `StandaloneErrorBoundary` so the login entry stays isolated from authenticated workspace error boundaries, and lazy-loaded account cleanup stores in `src/storage/accountCleanup.ts`. |
| Vocabulary practice responsiveness | Shared a single Radix `Tooltip.Provider` across `Shell` and `VocabularyPracticeSession` while keeping `IconButton` standalone-safe for isolated unit tests. Memoized `PracticeAnswerRow`, row play/flag icon buttons, and `PracticeNumberButton`, stabilized row callbacks/refs, guarded setup/results-only computations in `useVocabularyPracticeController`, avoided double IndexedDB draft writes on focus/page changes, isolated per-row layout/paint with `content-visibility: auto` (and `@supports` `contain: layout style paint` fallback), shared unit preparation in `availableUnitPracticeModes`, and indexed `VocabularyPracticeResults` lookups from O(N² + N·M) to O(N + M). |
| Auth, account isolation & async resilience | Added explicit request timeouts across `AuthGate`, `AccountPage`, `remote.ts`, and `audio.ts`. Hardened sign-out cleanup, cross-tab `SIGNED_OUT` / account-switch tab teardown (with an active-owner guard preventing an in-flight async cleanup from wiping a same-account re-sign-in), and deleted-account local session clearance when server deletion succeeds but remote sign-out fails. Added clear per-action busy labels, `aria-busy`, concurrent action disabling, and `<form>` landmark semantics for Delete account in `AccountPage`. |
| Visual craft, contrast & reduced motion | Fixed CSS specificity overrides with `:where(...)`, raised `--input-border` contrast to `>= 3:1` across surfaces in light and dark themes, repaired mobile Planning day heading hierarchy (`H2 -> H3 -> H4`), aligned dark-mode danger headings/dividers/toggles, set mobile search inputs to `>= 16px` to avoid iOS zoom, and disabled spatial transitions under `prefers-reduced-motion: reduce`. |
| IME composition & accessibility | Added `isComposing` + `keyCode === 229` guards to `ModalFrame` (`Escape`), `Shell` (`Ctrl/Cmd+K`, plus `altKey`/`shiftKey`/`defaultPrevented` guards), `Toast`, `WritingDeskPage`, `IntensiveAudio`, and `SourceAnnotations`. Added `AssessmentDetailPage` row `aria-describedby` links and reliable repeated toast announcements. |
| Type safety & browser regression coverage | Restored three grandfathered `@ts-nocheck` files (baseline reduced from 36 to 33 in `scripts/typecheck-baseline.json`), added unit regressions for all new fixes, and extended three-engine Playwright checks (`chromium`, `firefox`, `webkit`) for mobile planning headings, account forms/contrast, reduced motion, and IME Escape/Enter handling. |

Study state remains schema v13 (`src/domain/state.ts`). No database migration, catalogue reseed, or storage bucket change is required. Account isolation, immutable history rows, read-only planning summaries, exact planned targets, and all retained content-addressed vocabulary resource URLs remain unchanged.

## Before-vs-after measurements

Measured sequentially on the same Windows workstation against `master` (`99cddce0`) in an isolated detached worktree with no concurrent builds or test runs:

| Measurement | `master` (`99cddce0`) | Branch (`codex/system-audit-improvements`) | Change |
| --- | --- | --- | --- |
| Full retained vocabulary resource build (7,581 files) | `38,541.1 ms` | `16,938.7 ms` | `-56.1%` (`2.28×` faster) |
| Dev-server vocabulary resource startup (462 current files) | `38,541.1 ms` (full history required) | `2,278.3 ms` | `-94.1%` (`16.9×` faster) |
| Production `vite build` / total `npm run build` | `79 s` / `120.63 s` | `40.39 s` / `60.06 s` | `-48.9%` / `-50.2%` (`2.0×` faster) |
| Largest JS asset (budget: 512,000 bytes) | `ProgressPage` (`391,929 bytes`) | `charts` (`368,212 bytes`) | `-23,717 bytes` (`-6.1%`, Recharts split out) |
| Login JS gzip (budget: 307,200 bytes) | `134,660 bytes` (3 assets; `index` 284.4 kB / 90.0 kB gzip) | `153,111 bytes` (3 assets: `index` 24.7 kB + `react` 69.4 kB + `supabase` 59.0 kB gzip) | `+18,451 bytes` cold gzip (`49.8%` of budget; trades cross-chunk compression for cacheable vendor chunks) |
| 235-word practice typing & submit test (standalone, 3 runs) | `9,739 ms` median (`7,506` / `9,739` / `12,596 ms`) | `2,939 ms` median (`2,899` / `2,939` / `2,979 ms`) | `-69.8%` (`3.31×` faster; passes full parallel `npm test` in `~7.7 s` vs `>15 s` timeout) |

## Design trade-offs, compatibility & rollback

- **Login bundle cold gzip vs long-term cacheability:** Splitting `react` and `supabase` out of the `index` entry chunk increases cold-cache login JS gzip by `18,451 bytes` (`134,660` -> `153,111 bytes`, still under half the `300 KiB` budget) because separate gzip streams lose cross-library compression. In exchange, application releases invalidate only the `24.7 kB` gzip `index` chunk instead of forcing browsers to re-download React and Supabase, and Radix UI is kept out of the login entry path.
- **Dev-mode historical vocabulary fallback:** `vite dev` builds only the current 462-file catalog on startup (`~2.3 s`). If a dev session requests a retained historical manifest/resource URL (such as an older production manifest tested in `e2e/workspace.spec.ts`), the middleware lazily builds the full 7,581-file archive once and caches it for subsequent requests. Production builds (`vite build`) always emit the full retained 7,581-file corpus with unchanged hashes and headers.
- **Firefox 159 `getByRole('form')` + `axe-core` interaction:** Playwright 1.65.1's bundled Firefox 159 deterministically crashes its content process when both Playwright's `getByRole('form')` locator and `AxeBuilder.analyze()` execute on the same document (reproduced on a minimal static HTML `<form aria-labelledby>` page). `e2e/workspace.spec.ts` keeps the full light/dark axe scan on `/settings/account` in one test and verifies the `Delete account` form landmark on the separate `/settings/account` navigation in the following test, preserving both checks across all three engines.
- **Rollback impact:** Because schema v13, RLS policies, RPC contracts, and content-addressed vocabulary URLs are unchanged, rolling back to the previous Cloudflare Pages deployment is safe and requires no database or storage intervention.

## Validation

Release and CI checks are executed sequentially on the final commit in the required order:

1. `npm test` (full unit suite, 271 test files; 1 existing optional legacy-archive test skipped when `LEGACY_VOCABULARY_RESOURCE_DIRECTORY` is unset)
2. `npm run check:types` (`33` grandfathered files, zero new `@ts-nocheck`)
3. `npm run build` (identity check, `tsc -b`, production `vite build`)
4. `node scripts/check-bundle-budget.mjs`
5. `node scripts/audit-vocabulary-dictionary.mjs --check`
6. `npm run vocabulary:quality -- --check`
7. `npm run test:identities`
8. `npm audit` (`0` vulnerabilities)
9. `impeccable detect --json --changed` (`[]`, zero findings)
10. `npm run test:browser` across Chromium, Firefox, and WebKit (`63` tests total) with `FIELDBOOK_BROWSER_OUTPUT` outside the checkout.

Detailed eight-dimension audit evidence is kept in gitignored `local/audits/2026-11-26-system-audit.md`.

## Operational & manual acceptance follow-ups

These items cannot be certified by synthetic unit/Playwright checks alone and require explicit real-environment evidence before sign-off:

1. **Real devices, IME, and assistive technology:**
   - Test Chinese/Japanese/Korean IME composition in Safari (macOS/iOS), Chrome, and Firefox across `CommandSearch` (`Ctrl/Cmd+K`, `Enter`, `Escape`), modal dialogs (`ModalFrame`), `WritingDeskPage`, `IntensiveAudio`, `SourceAnnotations`, and `VocabularyPracticeSession`. Confirm canceling composition with `Escape` never dismisses modals or pauses sessions.
   - Verify keyboard-only navigation, focus restoration, and screen-reader announcements (NVDA + Firefox, VoiceOver + Safari) on `/settings/account` (4 named forms, busy button labels, Sign out section), `/planning` (mobile day headings), `/progress` (paginated history filters), and `/vocabulary/review` (50-row list typing + tooltips).
   - Check 320 px narrow viewports and 200% browser zoom on real mobile hardware (including iOS Safari auto-zoom prevention on search and account inputs) and verify real microphone recording and signed-audio playback recovery.
2. **Production auth & cross-tab rehearsal (staging/preview):**
   - Sign in on two tabs with a disposable test account, trigger sign-out or account deletion in Tab 1, and confirm Tab 2 clears session storage and returns to sign-in without leaking state.
   - Rehearse rapid sign-out followed by immediate sign-in of the same account in a single tab to confirm tab state and workspace hydration remain intact.
   - Delete the disposable account and confirm cascading cleanup and local session removal even if the follow-up remote sign-out fails.
3. **Capacity profiling on synthetic 1k / 10k history datasets:**
   - Profile full-history planning reconciliation, account hydration, and `FieldbookContext` render latency against 1k and 10k row fixtures; record query plans, payload bytes, p95 latency, and INP before splitting domain contexts or adding SQL indexes.
4. **Backup & restore rehearsal:**
   - Run `node scripts/backup-workspace.mjs <private-release-dir>` plus storage object archival (audio recordings are excluded from client JSON exports), restore into an isolated test project, compare all 36 table counts and SHA-256 digests, verify playback and account RLS isolation, and never overwrite a learner account.
5. **Security header & diagnostics rollout:**
   - Observe `Content-Security-Policy-Report-Only` reports in a Cloudflare Pages preview across auth, lazy routes, dictionaries, signed audio, and recording across Chromium, Firefox, and WebKit before tightening enforced CSP directives or raising HSTS `max-age`.
   - Confirm Cloudflare log/Analytics Engine retention policies before enabling `VITE_DIAGNOSTICS_ENABLED=true`, and verify `/api/diagnostics` logs only allowlisted numeric telemetry.
6. **Content provenance & editorial review:**
   - Automated dictionary/quality checks (`errors: []`) do not certify third-party content rights or editorial accuracy for unreviewed senses (`42,601` pending dictionary senses); continue tracked editorial review per `docs/vocabulary-bulk-workflow.md`.
