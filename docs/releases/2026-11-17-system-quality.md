# System quality improvements — 17 November 2026

## Scope

This change implements the concrete product and engineering fixes from the system audit. It does not deploy a release, certify content rights or replace editorial and device testing.

| Area | Result |
| --- | --- |
| Progress history | Independent, account-scoped, paginated read-only summaries. Direct entry no longer depends on visiting Planning History. Date, skill and status filters, errors and retry are explicit. Summary rows never enter writable collections or save baselines. |
| Today | Each unfinished task has its own start/resume action. Completed minutes are explicitly estimates from planned durations. Exact planned targets and practice guards remain in force. |
| Mobile navigation | One Study menu exposes listening, reading, writing and speaking equally; active selections and cancelled practice transitions retain focus. |
| Vocabulary onboarding | A new learner gets one wordbook choice and a next step before the existing learning dashboard appears. |
| Accessibility | Native date inputs, correct combobox and description-list semantics, a skip link, route heading focus, IME-safe search, readable muted text and mobile input sizes. Light and dark layouts receive automated browser checks. |
| Draft recovery | Input writes serialize the edited draft only. Version-aware acknowledgement preserves unacknowledged edits from another tab. Legacy full recovery snapshots remain readable. |
| Loading | Empty global search loads navigation results without hydrating every account module. |
| Engineering | Three legacy TypeScript suppression files restored; a baseline gate prevents suppression growth. Browser and axe checks join CI. Dependencies with known advisories updated. |
| Security and diagnostics | Minimal enforced security headers plus a report-only script policy. Optional numeric diagnostics redact content and identifiers at the edge; see the deployment runbook before activation. |

Study state remains schema v13. No database migration or catalogue reseed is required. This delivery preserves account isolation, immutable histories, explicit completion evidence and content-addressed resources.

## Validation

Run the release checks in order: `npm test`, `npm run build`, then `node scripts/check-bundle-budget.mjs`. Also run `npm run check:types`, dictionary/quality reports and identity/SQL compatibility. Run `npm run test:browser` separately from the full unit suite and performance measurements.

Browser fixtures intercept every external request and use synthetic accounts. They cover direct history entry, search composition, mobile Study focus, and serious/critical axe violations, horizontal overflow and mobile input sizes on key pages in both themes. Screenshots and traces are written outside the checkout. Automated checks supplement real assistive technology and device testing.

Local acceptance on this branch: 255 test files passed, with 18,466 tests passed and one existing optional archive-resource test skipped. The production build, type-suppression gate, dictionary/quality snapshot and identity/SQL checks passed. Login JavaScript is 134,538 bytes gzip against a 300 KiB budget; the largest JavaScript asset is 391,237 bytes against a 500 KiB budget. Chrome, Firefox and WebKit each passed nine browser scenarios covering both themes at 320px, 390px and 1440px. The dependency audit reported zero known advisories, including development dependencies. These checks do not establish live deployment or operational acceptance.

## Operational follow-ups

- **Content quality and rights:** Review the current catalogue against source permissions, attribution and editorial rules. Keep detailed evidence in ignored `local/audits/`; record a concise acceptance decision in the content review log. An automated content report cannot grant distribution rights or validate every explanation.
- **Recovery rehearsal:** Application JSON exports preserve study records but do not embed recorded audio. Before a release, run `scripts/backup-workspace.mjs` into a private release directory and separately preserve storage objects plus a path/size/checksum manifest. Restore both into an isolated test project, compare table counts and hashes, and verify playback and account isolation. Retain originals until the restore is verified; never test by overwriting a learner account.
- **Capacity:** Profile the existing full-history planning stamp and account hydration on synthetic 1k/10k history fixtures. Record query plans, payload size, p95 latency and input responsiveness before choosing a SQL/index or domain-context split. This delivery reduces per-keystroke recovery work; it does not replace that measurement or rewrite the whole context.
- **Devices and access:** Rehearse native date entry, IME, keyboard navigation, VoiceOver/NVDA, 320px layouts, 200% zoom, recording permissions and signed audio recovery on real devices. The browser matrix is repeatable coverage, not a claim of complete assistive-technology compatibility.
- **Policy rollout:** Validate report-only CSP against preview and production traffic before enforcing script restrictions. Configure diagnostic retention and sampling at the platform before enabling optional client collection. Verify the exact deployed headers and function routing after release.

These items require explicit evidence before they are marked complete. Production publication follows the existing pull request, squash merge and exact-commit checks in the deployment runbook.
