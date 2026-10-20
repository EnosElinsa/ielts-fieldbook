# Unified learning implementation ledger

Approved 2026-10-20. This replaces both preceding plans. A release never closes remaining dictionary or platform work. Product copy remains English.

Implemented means code exists; final release verification is recorded separately. Partial and pending requirements remain in scope.

| Requirement | Current implementation / evidence | Remaining acceptance or dependency |
| --- | --- | --- |
| Daily/week time, weekday overrides, module weights, vocabulary-only plans, legacy fixed allocation | planningPreferences / PlanningSettings / unified planner regressions; full suite passed | Verified build is deployed |
| New-word goal default10 including0; reserve after protected tasks before review; actual/shortfall | planTemplates / PlanningPage; budget and partial-list regressions passed | Dedicated short-budget browser case remains |
| Book order, rotation, pause, group/member order, cross-book dedup, shared Home selector | nextLearningTarget / nextHomeLearning | Distinct-meaning guidance is limited to exact sense labels |
| Exact partial lists; existing fixed/start/history contracts preserved | exact targets / binder / GroupLearnPage regression; full suite passed | Verified runtime release |
| Review reasons and priority, independent mode schedules | persisted selectionReason / review selectors; full suite passed | Verified runtime release |
| Incorrect but complete graded submission finishes task; mastery/recovery separate | plans / plannedAssessment / Context regressions; production-build browser retry flow passed | Verified runtime release |
| Schedule/Waiting/History, week/day navigation; allocated/unfinished/completed estimates | PlanningPage; production-build browser and screenshots passed | Verified runtime release |
| Carryover default30%, module/rest-day/whole-task limits, oversized waiting reasons | planner/backlog regressions; full suite passed | Verified runtime release |
| Waiting today/date/replan/hold/resume/skip; started opt-in; page/all selection; impact preview | TaskCollection / previewBacklogChange | Preview includes related generated task changes |
| Only unstarted automatic dynamic review merges; manual/fixed/started retained | planner regressions; full suite passed | Verified runtime release |
| Structured cards, separate material/reschedule/condition/instructions | PlanningPage / selectable-task wrapper; screenshots inspected at1440/390/320 | Verified runtime release |
| History filters,20/page,deep links,explicit selection scope,archive/unarchive | TaskCollection / mutations | Server paging of plans still pending |
| Archive preserves identity, prevents regeneration; restore visibility separate from scheduling | planner/task regressions; full suite passed | Verified runtime release |
| Six settings groups,planning vs self-practice scope,account save,drafts/leave guard/reset/retry/account switch | SettingsPage / settingsDraft; six-group and legacy URL regressions; responsive browser passed | Verified runtime release |
| Cached180ms preview,fresh recompute before save,baseline conflict handling | settingsPlanPreview / remote / SQL; SQL and full suite passed | Production guards installed |
| Planned/Self-directed review,origin/date/mode/count/source/condition,one explicit association | ReviewPlanning / Setup | Final association browser check |
| One-time fixed/dynamic appointment;freeze on start;future empty due appointment | reviewPlanning / typed targets | Recurrence outside this round |
| Unlinked practice updates evidence;empty automatic task separate from completion | startPlan / submissionOutcome; full suite passed | Verified runtime release |
| Visible type/source/count/order/feedback/layout;1–100;per-word/per-sense selection | Setup / CustomVocabularySelection; production-build browser at1440/390/320 passed | Verified runtime release |
| Strict valid mode-card due;retry independent of due;3 successes spanning24h | strict-due / progress regressions | Legacy timestamps retained as history, not schedules |
| Dictation one word unless explicit meaning selection;planned fixed counts;saved/book order;frozen shuffle;due-first | reviewOrder / session; full suite passed | Verified runtime release |
| After submission/After each answer;selected states;reduced motion | controls / CSS; production-build browser passed | Verified runtime release |
| Owner/session IndexedDB,verified migration,multiple drafts,revision conflicts,source snapshot,parentSessionId | vocabularySessionDrafts / controller; regression and production-build two-tab confirmation flow passed | Verified runtime release |
| Immediate input,250ms save,no queue rebuild;pause/navigation await persistence | controller regressions; production-build beforeinput-to-frame median3.1ms/max10.1ms | Browser shutdown cannot guarantee async pagehide |
| Discard does not skip;frozen task restart;same-ID retry;separate learning/task results | Context / submissionOutcome; production-build failure/retry flow passed | Verified runtime release |
| Cross-device atomic baselines,receipts,conflict refresh | remote +12:00/14:00 migrations | Guards installed before frontend |
| Load only needed scheduling/history data | Planning,Settings and Today use projected planning evidence instead of full productive/receptive histories;vocabularyCore excludes frozen history and loads light group-attempt metadata | Base still loads all plans/drafts;Planning History still needs server paging |
| Vocabulary history server20/page,individual result load,unloaded records never deleted | remote history/detail / readiness | Planning History still client-paged over loaded plans |
| Frozen wrong-cause evidence/actionable recommendations/exact-sense audio | Preserved | Broader independently verified pronunciation coverage ongoing |
| Whole-term packages,two authors+independent reviewer,isolated outputs,one-snapshot integration | review jobs +two applied snapshot receipts | Continue47,125 pending source senses;13 indexed-only proposals remain excluded |
| Source versions/licences,all-field review,teaching/media,selective diagrams,no paid model API | Partial:765 independent full reviews;1,469 focused repairs | Remaining dictionary and unresolved cases stay open |
| Raw identities,personal edits,course variants,frozen history,old resource bytes | Identity/SQL checks passed;all4,418 old dist URLs retain their SHA256;1,143,969,737 bytes | All4,418 production hashes passed |
| 1440/390/320,themes,keyboard,long materials,transitions,input | All11 production-build isolated browser flows passed;beforeinput-to-frame median3.1ms/max10.1ms | Production11-flow verification passed |
| Full tests,build,identity/SQL/content/resources,commit/push/Cloudflare Git deployment | Full suite,production build,identity,SQL,content,bundle,Cloudflare,production browser and retained-resource gates passed | Runtime release1d0081196d595cfdaac6b3a9ff7ad57116cc2480;remaining scope stays open |

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

Runtime release: [1d0081196d595cfdaac6b3a9ff7ad57116cc2480](https://github.com/EnosElinsa/ielts-fieldbook/commit/1d0081196d595cfdaac6b3a9ff7ad57116cc2480), normally pushed from codex/unified-learning-system to master. The exact commit passed Cloudflare Pages,Supabase Preview,four GitHub test shards and the final Check build/audit job. Cloudflare deployment:6b72638b-9109-4811-89a9-f4c0069282f6. This documentation-only follow-up does not change runtime content.

Production at https://ielts-fieldbook.pages.dev passed all11 isolated browser flows with0console/page errors,including the two-tab confirmation flow. Production beforeinput-to-next-frame was median6.2ms/max15.7ms for26letters on this machine;local preview was median3.1ms/max10.1ms. The production entry JS/CSS SHA256 match the locally verified build,and Planning,Settings and Review direct routes return that build. All4,418 historical resource URLs retain their original SHA256,covering1,143,969,737 bytes with0errors. Evidence:local/unified-testing/browser-production.json,deployed-build.json,resources-production.json. Real learner rows were not used for these flows.

The table's production gates are satisfied by this exact-build and11-flow verification. A pending dedicated browser case or loading/content gap remains pending as specified;the release does not complete the entire approved plan.

## Next retained work

1. Scope initial plan/draft hydration and move Planning History to server paging while preserving unloaded records,task identities,atomic baselines and bulk impact previews.
2. Add the dedicated short-budget and explicit planned-association browser cases;current domain regressions cover those rules.
3. Expand independently verified exact-sense pronunciation and distinct-meaning guidance beyond sense labels.
4. Continue47,125 pending source-sense reviews and preserve unresolved cases. A fresh fourth job binds the final89f20983e75abc20ff8c862ee2257184c176b5f484075323c87ee43c2d1419ff snapshot into163complete-term packages. Packages0001/0002 are exclusively assigned to the two authors:118terms/582pending senses. Preparation,candidates and claims are not new approvals.
