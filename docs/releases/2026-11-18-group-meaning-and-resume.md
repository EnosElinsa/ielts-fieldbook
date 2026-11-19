# Group teaching and foreground responsiveness

## Confirmed problems

Old Guixue imports and wordbook enrolments could show dictionary extraction text
as their selected meaning even though the group already had reviewed teaching.
For example, parlour displayed a spelling-reference definition and an old poem,
while eaves displayed a Shakespeare quotation. The correct group definitions and
modern examples were already present; `49bf02a4` had repaired the archaic eaves
example. The former normalizer stored an absent
`distinctions` field as `[]`; content protection mistook that generated value for
a personal edit and blocked the teaching corrections.

Commit `c63f1c82` added explicit updates for frozen batches whose corrected
meanings have different identities. This case concerns unchanged sense IDs and
old public content snapshots, so changing the task's identity is unnecessary.
Display compatibility now recognizes recorded Guixue imports and wordbook
enrolments as well as the existing public dictionary import path. It matches
one complete public baseline, including the catalog's register and word-family
fields, before removing importer-generated empty defaults from a display copy.
It does not treat arbitrary empty fields as missing or persist a replacement.
Personal edits, deliberate clears, explicit different senses, saved assessment
snapshots and immutable histories retain their existing contracts.

The selected group meaning therefore supplies the learning card, word details
and practice. Parlour uses "A sitting room used for receiving guests or
relaxing." and "The family gathered in the parlour after dinner." Eaves uses
"Rainwater dripped from the eaves of the house." No separate conflicting group
meaning is needed for these untouched imports.

The foreground fix in `932fb613` already bounded hydration and candidate scans,
preserved background task priority, and limited saves to plans/settings. Its
browser fixture had saved words and review history but no due vocabulary states.
Adding 7,000 due states exposed another bottleneck: `getLearnedVocabularyIds`
filtered the entire review history for each scheduled meaning. CPU sampling
located almost all blocking work in that repeated scan. The same path is used
by Today and Planning on initial load and foreground return.

The function now indexes review presence and qualifying attempts once, then
checks scheduled states against those sets. Work grows with reviews plus states,
rather than their product. Blank answers, pending imports, valid schedules,
incorrect attempts, manual labels and unrelated entries keep the same learned
classification and insertion order. There is no cross-account cache. The prior
background scheduling and concurrent-save guards remain in use.

## Regression and acceptance

Domain regressions first reproduced the wrong parlour content and 401,000 review
identity reads for 400 schedules and 1,000 reviews. They now require the correct
group definitions/examples in display and practice, parity for every word in
the affected group, unchanged input rows, protected personal edits/clears and
bounded history inspection. Existing meaning-update and content-protection tests
cover frozen identity changes separately.

Browser checks use intercepted synthetic accounts only. Scripts, screenshots,
CPU profiles and reports are retained outside the checkout under the current
task's `meaning-and-resume/` evidence directory. Final command logs belong in
the ignored `local/logs/2026-11-18-meaning-resume/` directory.

To reproduce the load/resume case, use 7,000 saved entries, a valid due state for
each, 20,000 answered reviews and a 15-minute vocabulary budget. Throttle CPU
fourfold, hide the page while it loads, return, then repeat five background /
foreground cycles with view switches while probing keyboard input. Before this
fix, Planning needed 43.23 seconds to become ready, the longest main-thread task
was 34.55 seconds and later refreshes repeatedly blocked for 28–30 seconds.

Measured against the production build, with no full tests or builds running
alongside the browser profile:

| Scenario / viewport | Words / due states / reviews | Initial ready | Longest main-thread task | Longest keyboard probe | Five foreground interactions |
| --- | ---: | ---: | ---: | ---: | ---: |
| Planning before / 1440px, 4× CPU | 7,000 / 7,000 / 20,000 | 43.23 s | 34,550 ms | 34,484 ms | 386–502 ms, followed by 28–30 s blocking refreshes |
| Planning after / 1440px, 4× CPU | 7,000 / 7,000 / 20,000 | 8.79 s | 511 ms | 464 ms | 350–478 ms |
| Today after / 1440px, 4× CPU | 7,000 / 7,000 / 20,000 | 8.57 s | 555 ms | 451 ms | 393–1,007 ms |
| Planning, legacy imports / 1440px, 4× CPU | 7,000 / 7,000 / 20,000 | 9.28 s | 631 ms | 591 ms | 373–488 ms |
| Planning after / 390px, 4× CPU | 500 / 500 / 1,500 | 2.30 s | 91 ms | 88 ms | 262–341 ms |
| Today after / 390px, 4× CPU | 500 / 500 / 1,500 | 2.27 s | 94 ms | 89 ms | 319–887 ms |

Planning uses History → Schedule after each foreground return. Today uses
Planning → Today. Keyboard probes and long-task observation cover the complete
load and all refreshes, including time after the interaction itself. These are
local synthetic measurements rather than field INP or production latency.

The complete suite passed: 253 test files, 18,430 passing tests and one skipped.
The production build and bundle budgets passed (login JavaScript gzip 193,588
bytes; largest JavaScript asset 387,815 bytes). Independent read-only review found
no actionable issues.

Chromium, Firefox and WebKit each passed 48 page checks: two widths (1440 and
390px), light/dark, Guixue import/enrolment provenance, two affected words and
the card → details → practice-setup path. Each path requires the exact definition
and example, the original sense/group identity, an enabled practice start, no
conflicting Group/Selected meaning panels and no horizontal overflow or runtime
errors. Chromium and Firefox had no console warnings/errors. WebKit emitted an
entry-module preload advisory in each context; those eight advisories are
retained separately, with no other warnings or errors.

Chromium also passed eight Today/Planning failure-recovery scenarios at both
widths and themes: loading, a synthetic workspace RPC failure, and a successful
Retry (24 captured states). Dictionary and identity/SQL checks passed. The
generated vocabulary quality report changes only its source fingerprint; its
coverage counts and editorial ledger remain unchanged.

Device acceptance still requires a physical phone and the affected browser:
open Today and Planning with the same synthetic large account, switch to another
application during loading, return several times, and verify navigation and
keyboard/touch input throughout. Synthetic local measurements do not establish
production network latency or review every independently authored example.

No database migration, new dependency or public resource URL change is required.
Rollback uses the previous frontend deployment and preserves all account data.
