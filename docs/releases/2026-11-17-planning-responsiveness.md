# Planning foreground responsiveness

Opening Planning and returning from another tab could make the entire workspace unresponsive. Large account snapshots were copied and normalized during a plan-only save, and the scheduler repeatedly resolved every learned meaning and built unrelated practice tasks. A synthetic account with 7,000 saved words and 20,000 review records produced a 34.5-second main-thread task at 4× CPU slowdown.

Schedule refresh now copies only plans and settings and saves only those collections. Account identity normalization runs in bounded batches, with browser opportunities between hydration copies. Vocabulary planning resolves each meaning once, generates foundation questions and any active distinction-error verification it needs, and scans meanings as background tasks. Background priority is deliberate: a long chain of boosted `scheduler.yield()` continuations could still delay timers and visible updates. Browsers without the scheduling API use a timer fallback.

The asynchronous scan reads a stable evidence snapshot. If local state changes while it yields, the refresh rebases before saving; an account switch discards the result. Manual and started tasks, frozen vocabulary selections, due dates, confirmed mistake checks and spacing priorities retain the existing rules. Synchronous domain consumers share the same candidate generator and recommendation logic.

## Browser verification

The Browser plugin was not exposed in this session. Existing Playwright and Chromium drove the production build with intercepted synthetic Supabase responses; no personal account was inspected or changed. Each scenario hid the page during initial loading, returned to Planning, then repeated five foreground returns and History → Schedule clicks. Keyboard probes continued throughout loading and refresh. Screenshots, CPU profiles, long tasks, timer gaps and interaction timings were captured outside the repository.

| Viewport / CPU | Saved words / reviews | Initial schedule ready | Foreground view-switch range | Longest main-thread task | Longest keyboard probe |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1440 × 1000 / normal | 7,000 / 20,000 | 5.10 s | 168–345 ms | 170 ms | 108 ms |
| 1440 × 1000 / 4× slowdown | 7,000 / 20,000 | 9.28 s | 368–475 ms | 664 ms | 636 ms |
| 390 × 1000 / 4× slowdown | 500 / 1,500 | 2.48 s | 314–571 ms | 148 ms | 117 ms |

The account fixture allocated 15 minutes of vocabulary work per day. These are local synthetic measurements, not production network or user-account latency guarantees. The desktop verification also checked the route/title, nonblank Planning content, selected Schedule state, absence of framework overlays and an empty console/runtime error log. The mobile screenshot showed the calendar and bottom navigation without clipping.

Regression tests cover migration parity and unchanged source data, browser task opportunities, full-resolver versus foundation-planner parity, frozen distinction mistake validation, unused vocabulary work, scoped snapshots, concurrent settings edits and account switches. No database migration is required.
