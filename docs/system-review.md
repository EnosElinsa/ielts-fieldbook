# System review — 18 November 2026

This review starts at `c2843f57` and uses synthetic intercepted accounts. Earlier
release reports are context, not verification of this change. Detailed generated
reports belong in ignored `local/audits/`; browser scripts and screenshots are
outside the checkout in this chat's Codex visualization directory.

## Users and tasks

Learners first sign in, configure available days/time and their target, and choose
skills and vocabulary sources. Daily work starts at Today or Planning, continues
an exact assigned task, saves practice, and returns to its source. Independent
practice starts from a question bank or vocabulary group. Mistake diagnosis and
due retrieval are separate from submission, score and mastery. Returning learners
need draft recovery, retryable saves and missed-day planning. Maintainers need
reproducible content checks, compatible schema changes and reversible releases.

## Stages and acceptance

1. Read routes, state v13, module loading/save queues, product and release rules;
   establish tests/build/budget and inspect real pages in both themes and sizes.
2. Fix confirmed blockers first. Add regressions that fail on the original code,
   then verify keyboard, mobile, error and retry behavior with synthetic accounts.
3. Review changes independently; run full tests, build, budget, dictionary,
   quality and identity/SQL checks. Prepare a Conventional Commit and pull request.
   Production and real-device checks remain explicit external acceptance tasks.

## Findings

| ID / class | Trigger and evidence | Impact / confidence | Action, cost and risk | Acceptance |
| --- | --- | --- | --- | --- |
| N1 / confirmed, P2 | `CommandSearch` handles Enter and arrows during composition; reading/listening answer shortcuts miss Safari's process key in `ExamPracticePage.tsx`. | IME confirmation can open an unrelated page or move to another answer; high. | Guard native composition and Safari process key; small, low risk. | Composition Enter/arrows preserve dialog/answer and selection; ordinary Enter still works. |
| N2 / confirmed, P2 | Search stores an index that can exceed the results after async account/bank updates. | No active option and Enter silently stops working; high. | Bound the active index to current results; small, low risk. | Shrinking results retain one valid active descendant and Enter activates it; no results remain inert. |
| N3 / confirmed, P2 | `Shell.tsx` has repeated sidebar navigation without a bypass link. | Keyboard learners must traverse navigation before every task; high. | Add a focus-visible skip link and programmatic main target; small, low risk. | First Tab exposes the link; Enter focuses main; query/hash and unsaved work are preserved; both themes and 320px fit. |
| A1 / confirmed, P2 | Axe on 24 routes in both themes finds light muted text at 4.26:1 and dark primary white text at 4.03:1, below 4.5:1. Light red labels/avatars also fail. | Small supporting text and actions are harder to read; high. | Adjust existing theme tokens, without new color machinery; small, low risk. | Recheck rendered contrast in both themes and existing semantic error/selection labels. |
| A2 / confirmed, P2 | Toolbar `SelectField` buttons inherit Radix's `aria-autocomplete`; Planning replaces its `dl` role with `group`. | Unsupported button attributes and orphan terms impair assistive technology interpretation; high. | Remove the combobox-only attribute from button triggers; wrap the native description list in its named group; small, low risk. | Axe no longer flags these errors; selection, Escape, returned focus, statistics and mobile layout still pass. |
| S1 / confirmed advisory, developer tooling | Full `npm audit` reports 5 affected packages: Vitest/mocker, tinypool, Vite and source-map-js. Production-only audit reports zero. | Dev/test server exposure and dependency maintenance; advisory severity ranges moderate–critical, deployment exploitability not established. | Keep Vite 6, update its patch; move Vitest to patched 4.1.12 because 3.x retains flagged mocker/tinypool; patch source-map-js. Moderate compatibility cost, controlled by full tests/build/CI. | Full audit reports zero; Node 22 CI configuration, all assertions, quality scripts and build remain functional. |

## Review coverage and limits

- Data: v13 contracts, immutable histories, read-only planning summaries,
  schedule-only snapshots, account epochs, queueing and backup completeness are
  explicit existing boundaries. Keep their regression coverage; do not change
  schema or infer task completion as part of navigation repairs.
- Architecture: route and dialog chunks and module-specific account hydration
  already exist. Large context files are maintenance candidates, not sufficient
  evidence for a broad refactor. Prefer measured, isolated changes.
- Performance: earlier large-account and network benchmarks describe their own
  fixtures. Measure this version before making new speed claims.
- Security/operations: inspect auth boundaries, SQL compatibility, resource
  retention and dependency audit. CSP rollout requires testing actual signed
  audio, recording and resource origins; avoid enabling an unverified policy.
- Content: English UI and source attribution remain required. Synthetic UI
  checks cannot establish the accuracy or license of every imported question or
  dictionary example; editorial sampling is separate acceptance work.
- External acceptance: real mobile keyboard/IME, microphone permissions and
  audio quality; calibrated screen reader/browser pairs; live RLS isolation,
  durable cross-device saves and backup restoration in an isolated staging
  account. Record exact steps and results before claiming those environments pass.

## Items requiring more evidence

| Item / class | Evidence and relevance | Next acceptance / cost and risk |
| --- | --- | --- |
| M1 / measurement | Empty-account route timings cannot establish long-history search, backup or save capacity. Module hydration, account-generation guards and plan stamps exist in `src/storage/remote.ts`; changing them without a measured bottleneck risks data correctness. | Benchmark synthetic 1k/10k/50k histories, input latency, requests and save payloads; record p75 and memory on a fixed device. Moderate fixture/measurement cost; no speculative rewrite. |
| M2 / production evidence | `public/_headers` sets document revalidation and immutable hashed assets. A strict CSP would also affect signed audio, microphone recordings and resource origins. | Inventory actual staging origins, exercise allowed media and report-only violations without user content, then propose the smallest compatible policy. Moderate operational cost; premature enforcement could block practice. |
| M3 / human verification | Attribution and source metadata exist, but neither schema checks nor synthetic UI visits certify every answer, dictionary example or license. | Stratify editorial samples by source/book/type; record source, answer, authorization and corrections. Ongoing editorial cost; retain immutable learning history and historical resource URLs. |
| P1 / preference | Existing desktop/mobile screenshots have a coherent task hierarchy; no measured task failure justifies a new visual language. | Keep the current layout while correcting measured contrast/semantics. Consider broader redesign only with learner task observations and a measurable success criterion. |

Local unit and SQL checks cover concurrency, immutable-history and identity
contracts; the external staging steps below remain necessary evidence for the
deployed policies. This review does not assert a complete security assessment or
production performance certification.

## Baseline and implementation notes

- Baseline `npm test`: 250 files passed; vocabulary resource generation exceeded
  its unchanged 45-second setup allowance under four workers. 18,387 tests passed,
  17 were skipped by the failed setup. Isolated rerun passed all 16 resource tests,
  with only the existing external-archive conditional skip. Do not count that
  rerun as a green full suite. Final verification uses one worker to avoid resource
  contention rather than weakening assertions or increasing deadlines.
- Baseline production build passed in 43.50 seconds. Login JS: 193,585 bytes gzip
  across three assets; largest JS: 387,815 bytes. Both budgets passed.
- Baseline rendered checks captured 144 route states at 1440/390/320px in both
  themes, plus composition checks and workspace loading/failure/recovery. Normal
  route states had no document overflow, framework overlays or console errors.
  A first search-failure script run incorrectly waited for Today behind a failed
  productive-data boundary; the fixture is corrected to open search from Reading.
- Search/skip regressions first failed four tests, then passed 34 relevant tests.
  Reading and listening Safari cases first failed after flushing the actual
  animation-frame focus change. The button-role regression first failed on its
  unsupported attribute. These failures are retained in local logs.
- Vitest 4 removes the `minWorkers` option; retain `maxWorkers` and existing test
  limits. The existing quality scripts call `vite-node`, which Vitest 3 supplied
  transitively. It is now an explicit development dependency (3.2.4, compatible
  with Vite 6). There are no new runtime dependencies or data migrations.

## Independent review

The independent reviewer found that the new skip link initially reached the
active vocabulary session's document-level departure guard. The link now carries
the existing internal-practice marker: its only action is moving focus. A real
session regression checks retained answers, the unchanged URL, no exit dialog and
no session submission. Re-review found no remaining actionable issues, subject
to final verification. No persistence contract or schema changed.

## External acceptance still required

1. On iOS Safari and Android Chrome with a Chinese IME, compose in workspace
   search and in reading/listening text answers. Confirm a candidate with Enter:
   keep the page, answer focus and selected search result. A subsequent ordinary
   Enter should open the selected result or advance to the next answer. Repeat
   with the on-screen keyboard open and device rotation.
2. With NVDA/Firefox and VoiceOver/Safari, Tab from page entry to the skip link,
   activate it, then traverse the task. Check the single main landmark, filter
   name/options, daily-plan terms/values, modal focus return and error messages.
   Automated axe checks do not establish a screen-reader conformance result.
3. In two isolated staging accounts, throttle an A-account read/save, switch to B
   before it resolves, and verify no A rows or drafts appear in B. Open two A
   tabs, change a schedule and save stale work from the other tab; verify conflict
   feedback and preserved histories. Interrupt a practice save, reconnect and
   retry; check one immutable completed record and the exact planned target.
4. Create a staging administrator backup using the deployment runbook. Verify
   the 36-table manifest, counts and digests, restore into an isolated project,
   compare rows and test signed media and retained resource URLs. This review
   does not exercise a production restore or modify live account data.
5. Sample source questions/dictionary examples for answer accuracy, attribution
   and authorization. Test actual microphone recording, permission denial,
   playback and recording recovery on mobile. The synthetic fixture has no
   real microphone or licensed source audio.

## Verification of this change

- `npm test -- --maxWorkers=1`: 251 files passed; 18,410 tests passed and one
  existing external-archive conditional test skipped. Duration: 699.37 seconds.
  Two existing jsdom `window.scrollTo` diagnostics remain in the log; no test
  failed. Affected component tests also passed before the full run.
- `npm run build`: passed; Vite production bundling took 42.83 seconds.
  `node scripts/check-bundle-budget.mjs`: passed. Login JS gzip is 193,587 bytes
  across three assets (baseline 193,585); largest JS remains 387,815 bytes. This
  batch makes no bundle-size improvement claim.
- Dictionary audit, vocabulary quality snapshot and `npm run test:identities`
  passed. SQL rehearsal verified twice-run conversion, preserved timestamps,
  content/provenance, immutable triggers, RPC replay/deletion and RLS. Detailed
  generated reports remain ignored. Editorial coverage gaps reported by the
  existing quality snapshot are not claimed resolved by these interface fixes.
- Full `npm audit`: zero advisories, down from five affected packages in the
  baseline. Local checks use Node 24.14.0; the repository CI uses Node 22.
- Axe 4.10.3 on 24 routes in light/dark at 390px: 48 states, zero violations for
  its WCAG 2 A/AA, 2.1 AA and 2.2 AA tags. Baseline had contrast violations in
  35 states, invalid ARIA attributes in 14 and description-list errors in two.
  Incomplete/manual checks remain outside an automated conformance claim.
- Chromium 153: 24 routes at 1440/390/320px in both themes (144 route states),
  six keyboard skip states, six first-use/loading/failure/recovery states and
  24 reading/listening practice/results states. All 180 snapshots fit the
  viewport; six additional search-composition checks passed. Checks verified ordinary
  Enter navigation, Safari process-key answer focus, persisted 0/2 results and
  return to each bank. No unexpected console/page errors or overlays.
- Firefox 159 and WebKit 27.2: five routes at 1440/390px in both themes, 20
  snapshots each. Composition, normal search navigation, answer focus and a
  settings preset passed. These are desktop engine checks, not physical iOS
  keyboard or Android device certification.

### Local route measurement

Five samples per route/viewport, the same intercepted empty-history fixture and
local preview server, light theme, no network throttling. Desktop uses normal
CPU; 390px uses Chromium's 4× CPU throttle. Measure navigation until the route's
active view is visible, independently of full tests, builds and other browser
checks. p75 is the nearest-rank fourth of five samples.

| Route | Desktop baseline → final p75 (ms) | 390px / CPU 4× baseline → final p75 (ms) |
| --- | --- | --- |
| Today | 887 → 888 | 1480 → 1450 |
| Planning | 883 → 896 | 1513 → 1512 |
| Writing | 893 → 891 | 1482 → 1454 |
| Vocabulary | 894 → 886 | 1481 → 1472 |

The changes range from −2.0% to +1.5%; no performance gain is established. The
small sample, selector polling, local network and synthetic account limit this
comparison. It is not production LCP/INP or a large-account capacity benchmark.

The browser harness uses intercepted synthetic Supabase responses, sample
writing/speaking banks, an empty-history account and two original gap questions
for each exam skill. Audio is one second of synthetic silence. No real user
account, source recording or production database is accessed. The initial
extended-flow script lacked a listening asset and did not switch the mobile
reading panel; those fixture issues were corrected before rerunning. WebKit
also required a matching installed driver and proper mock CORS preflights.
These harness failures are not counted as product defects or passing flows.
