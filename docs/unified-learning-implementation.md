# Unified learning implementation ledger

Approved 2026-10-20. This replaces both preceding plans. A release never closes remaining dictionary or platform work. Product copy remains English.

Implemented means code exists; final release verification is recorded separately. Partial and pending requirements remain in scope.

| Requirement | Current implementation / evidence | Remaining acceptance or dependency |
| --- | --- | --- |
| Daily/week time, weekday overrides, module weights, vocabulary-only plans, legacy fixed allocation | planningPreferences / PlanningSettings / unified planner regressions; full suite passed | Production verification pending |
| New-word goal default10 including0; reserve after protected tasks before review; actual/shortfall | planTemplates / PlanningPage; budget and partial-list regressions passed | Dedicated short-budget browser case remains |
| Book order, rotation, pause, group/member order, cross-book dedup, shared Home selector | nextLearningTarget / nextHomeLearning | Distinct-meaning guidance is limited to exact sense labels |
| Exact partial lists; existing fixed/start/history contracts preserved | exact targets / binder / GroupLearnPage regression; full suite passed | Production verification pending |
| Review reasons and priority, independent mode schedules | persisted selectionReason / review selectors; full suite passed | Production verification pending |
| Incorrect but complete graded submission finishes task; mastery/recovery separate | plans / plannedAssessment / Context regressions; production-build browser retry flow passed | Production verification pending |
| Schedule/Waiting/History, week/day navigation; allocated/unfinished/completed estimates | PlanningPage; production-build browser and screenshots passed | Production verification pending |
| Carryover default30%, module/rest-day/whole-task limits, oversized waiting reasons | planner/backlog regressions; full suite passed | Production verification pending |
| Waiting today/date/replan/hold/resume/skip; started opt-in; page/all selection; impact preview | TaskCollection / previewBacklogChange | Preview includes related generated task changes |
| Only unstarted automatic dynamic review merges; manual/fixed/started retained | planner regressions; full suite passed | Production verification pending |
| Structured cards, separate material/reschedule/condition/instructions | PlanningPage / selectable-task wrapper; screenshots inspected at1440/390/320 | Production verification pending |
| History filters,20/page,deep links,explicit selection scope,archive/unarchive | TaskCollection / mutations | Server paging of plans still pending |
| Archive preserves identity, prevents regeneration; restore visibility separate from scheduling | planner/task regressions; full suite passed | Production verification pending |
| Six settings groups,planning vs self-practice scope,account save,drafts/leave guard/reset/retry/account switch | SettingsPage / settingsDraft; six-group and legacy URL regressions; responsive browser passed | Production verification pending |
| Cached180ms preview,fresh recompute before save,baseline conflict handling | settingsPlanPreview / remote / SQL; SQL and full suite passed | Production guards installed |
| Planned/Self-directed review,origin/date/mode/count/source/condition,one explicit association | ReviewPlanning / Setup | Final association browser check |
| One-time fixed/dynamic appointment;freeze on start;future empty due appointment | reviewPlanning / typed targets | Recurrence outside this round |
| Unlinked practice updates evidence;empty automatic task separate from completion | startPlan / submissionOutcome; full suite passed | Production verification pending |
| Visible type/source/count/order/feedback/layout;1–100;per-word/per-sense selection | Setup / CustomVocabularySelection; production-build browser at1440/390/320 passed | Production verification pending |
| Strict valid mode-card due;retry independent of due;3 successes spanning24h | strict-due / progress regressions | Legacy timestamps retained as history, not schedules |
| Dictation one word unless explicit meaning selection;planned fixed counts;saved/book order;frozen shuffle;due-first | reviewOrder / session; full suite passed | Production verification pending |
| After submission/After each answer;selected states;reduced motion | controls / CSS; production-build browser passed | Production verification pending |
| Owner/session IndexedDB,verified migration,multiple drafts,revision conflicts,source snapshot,parentSessionId | vocabularySessionDrafts / controller; regression and production-build two-tab confirmation flow passed | Production verification pending |
| Immediate input,250ms save,no queue rebuild;pause/navigation await persistence | controller regressions; production-build beforeinput-to-frame median3.1ms/max10.1ms | Browser shutdown cannot guarantee async pagehide |
| Discard does not skip;frozen task restart;same-ID retry;separate learning/task results | Context / submissionOutcome; production-build failure/retry flow passed | Production verification pending |
| Cross-device atomic baselines,receipts,conflict refresh | remote +12:00/14:00 migrations | Guards installed before frontend |
| Load only needed scheduling/history data | Planning,Settings and Today use projected planning evidence instead of full productive/receptive histories;vocabularyCore excludes frozen history and loads light group-attempt metadata | Base still loads all plans/drafts;Planning History still needs server paging |
| Vocabulary history server20/page,individual result load,unloaded records never deleted | remote history/detail / readiness | Planning History still client-paged over loaded plans |
| Frozen wrong-cause evidence/actionable recommendations/exact-sense audio | Preserved | Broader independently verified pronunciation coverage ongoing |
| Whole-term packages,two authors+independent reviewer,isolated outputs,one-snapshot integration | review jobs +two applied snapshot receipts | Continue47,125 pending source senses;13 indexed-only proposals remain excluded |
| Source versions/licences,all-field review,teaching/media,selective diagrams,no paid model API | Partial:765 independent full reviews;1,469 focused repairs | Remaining dictionary and unresolved cases stay open |
| Raw identities,personal edits,course variants,frozen history,old resource bytes | Identity/SQL checks passed;all4,418 old dist URLs retain their SHA256;1,143,969,737 bytes | Compare deployed resources |
| 1440/390/320,themes,keyboard,long materials,transitions,input | All11 production-build isolated browser flows passed;beforeinput-to-frame median3.1ms/max10.1ms | Exact deployment remains |
| Full tests,build,identity/SQL/content/resources,commit/push/Cloudflare Git deployment | Full suite,production build,identity,SQL,content,bundle and local retained-resource gates passed | Commit,push,exact Cloudflare and production verification remain |

## Dictionary accounting

Initial baseline:52,108 total /4,262 fully reviewed /47,846 pending.

Current integrated working tree: **52,152 total /5,027 fully reviewed /47,125 pending**. Added765 independent full reviews include11 restored senses. The combined release has44 restored sources,1,469 focused repairs,121 exact-retain materializations,eight structural heading variants,one selection-only variant and30 selection changes. These overlapping categories must not be added to claim more full reviews. All854 existing diagrams remain unchanged. No new verified source-specific media bindings are claimed for these765 reviews.

The first frozen proposal covered1,315 variants /192terms,968fix /180retain /167hold. The revised third packages add549 accepted variants:501field repairs and48retain materializations. They add213 full source reviews after exact installed-route checks. Seventy-four whole-variant holds and13 AM indexed-only semantic proposals remain outside the merge. Source collection,automatic checks,candidate packages,focused repairs and teaching variants never count as full source reviews.

Ignored evidence: local/unified-dictionary/release-proposal/applied-receipt.json, actual-source-gates.json, runtime-attestation.actual.json, release-independent-review.json, resources-stage-comparison.json and third-release/applied-receipt.json. The third snapshot passed787 actual display routes,8,657 individual-edit sentinels,187 typed-note route checks and480 generated-task checks. festival's historical adjective has an independently sourced explicit inapplicable-collocations decision bound to its final material hash; no fabricated collocations satisfy a quota. Distinguish pre-merge evidence from installed-runtime evidence; changed manifest inputs require new checks.

## Verification evidence

Fresh whole suite:247 suites,10,260 passed,0 failed,1 optional skipped check (the archived-directory fixture requires LEGACY_VOCABULARY_RESOURCE_DIRECTORY). The separate release gate compares all4,418 pre-release immutable resource URLs and bytes. Evidence:local/unified-testing/full-final-confirmed.json. Targeted regressions also covered131 remaining-failure checks,172 planning-summary checks,32 optional-withdrawal checks,and169 dictionary/material checks. The older first full run exposed the outdated festival collocation quota;the final run verifies its explicit independently sourced inapplicable decision instead.

The isolated browser fixture uses synthetic intercepted account data and does not write learner rows. Eleven flows passed against the production build on port8057:visible Review controls,responsive setup,input/refresh,dark practice,multiple drafts/keyboard,Schedule/Waiting/started-task protection/bulk preview,History pagination,Settings cross-category drafts/save/mobile navigation,reduced-motion navigation,incorrect-but-complete task submission with same-ID retry,and explicit two-tab saved-draft reload. Beforeinput-to-next-frame was median3.1ms/max10.1ms for26 characters on this run;this is not a guarantee for other devices. Screenshots cover1440/390/320. Planning and Settings requested projected planning evidence and no full productive/receptive histories. Evidence:local/unified-testing/browser-production-preview.json.

Production build,identity checks,atomic-workspace SQL checks,dictionary/readiness report checks and bundle budgets passed. All4,418 previous resource URLs match their pre-release SHA256 in dist,covering1,143,969,737 bytes (local/unified-testing/resources-dist.json). The final quality report has312 exact retained-example receipts and no current learning example-fragment signals. One obsolete flu receipt is preserved in exampleReviewDecisionsArchive.json;a newly independent reviewed receipt is bound to the current final display. These offline audit receipts do not alter runtime resources after the successful full suite/build.

## Database and release

Branch:codex/unified-learning-system; baseline:4b7f3a8040a43a7436a3d7d34339ab4595a193ee.

Production Supabase received20261020120000_planning_conflict_guards and20261020140000_planning_schedule_baseline before frontend publication. The latter checks the whole plan set for concurrent inserts and compares review timestamps as timestamps. Isolated PostgreSQL verification covers replay ordering,atomic rollback,account isolation,stale tasks/profile and two different new tasks against the same old schedule.

Each migration registry row stores its preceding function DDL in statements[2]. Retrieve and review the latest predecessor before rollback;restore latest first. Learner rows and idempotent receipts must remain. Older clients omit baselines and remain compatible.

Frontend publication remains pending commit,push and exact-commit Cloudflare/production verification. All local release gates above are complete. Remaining platform and dictionary requirements stay open after this release.
