# Unified learning implementation ledger

Approved 2026-10-20. This replaces both preceding plans. A release never closes remaining dictionary or platform work. Product copy remains English.

Implemented means code exists; final release verification is recorded separately. Partial and pending requirements remain in scope.

| Requirement | Current implementation / evidence | Remaining acceptance or dependency |
| --- | --- | --- |
| Daily/week time, weekday overrides, module weights, vocabulary-only plans, legacy fixed allocation | planningPreferences / PlanningSettings / unified planner regressions; full suite passed | Verified build is deployed |
| New-word goal default10 including0; reserve after protected tasks before review; actual/shortfall | planTemplates / PlanningPage; budget and partial-list regressions and combined production-build short-budget browser case passed | Production15-flow continuation passed |
| Book order, rotation, pause, group/member order, cross-book dedup, shared Home selector | nextLearningTarget / nextHomeLearning | Distinct-meaning guidance is limited to exact sense labels |
| Exact partial lists; existing fixed/start/history contracts preserved | exact targets / binder / GroupLearnPage regression; full suite passed | Verified runtime release |
| Review reasons and priority, independent mode schedules | persisted selectionReason / review selectors; full suite passed | Verified runtime release |
| Incorrect but complete graded submission finishes task; mastery/recovery separate | plans / plannedAssessment / Context regressions; production-build browser retry flow passed | Verified runtime release |
| Schedule/Waiting/History, week/day navigation; allocated/unfinished/completed estimates | PlanningPage; production-build browser and screenshots passed | Verified runtime release |
| Carryover default30%, module/rest-day/whole-task limits, oversized waiting reasons | planner/backlog regressions; full suite passed | Verified runtime release |
| Waiting today/date/replan/hold/resume/skip; started opt-in; page/all selection; impact preview | TaskCollection / previewBacklogChange | Preview includes related generated task changes |
| Only unstarted automatic dynamic review merges; manual/fixed/started retained | planner regressions; full suite passed | Verified runtime release |
| Structured cards, separate material/reschedule/condition/instructions | PlanningPage / selectable-task wrapper; screenshots inspected at1440/390/320 | Verified runtime release |
| History filters,20/page,deep links,explicit selection scope,archive/unarchive | Server-paged TaskCollection; SQL pagination/filter/rank and cross-page selection regressions; combined browser archive/unarchive and unloaded archived deep link passed | Production migration and15-flow frontend acceptance passed |
| Archive preserves identity, prevents regeneration; restore visibility separate from scheduling | planner/task regressions; full suite passed | Verified runtime release |
| Six settings groups,planning vs self-practice scope,account save,drafts/leave guard/reset/retry/account switch | SettingsPage / settingsDraft; six-group and legacy URL regressions; responsive browser passed | Verified runtime release |
| Cached180ms preview,fresh recompute before save,baseline conflict handling | settingsPlanPreview / remote / SQL; SQL and full suite passed | Production guards installed |
| Planned/Self-directed review,origin/date/mode/count/source/condition,one explicit association | ReviewPlanning / Setup; association dialog clears after navigating; full planned requirements verified in combined production-build browser | Production15-flow continuation passed |
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
| Load only needed scheduling/history data | Base uses coherent scoped plan/profile RPC; productive drafts load on module entry and merge fieldwise; Planning,Settings and Today use projected evidence;vocabularyCore excludes frozen history | Compact whole-plan stamp guards scoped writes; production15-flow acceptance passed |
| Vocabulary and Planning history server20/page,individual detail load,unloaded records never deleted | remote history/detail; Planning target-page ranking,IDs-only selection and explicit row acceptance; backups request full plans | Production migration,archive/cold-link and15-flow acceptance passed |
| Frozen wrong-cause evidence/actionable recommendations/exact-sense audio | Preserved | Broader independently verified pronunciation coverage ongoing |
| Whole-term packages,two authors+independent reviewer,isolated outputs,one-snapshot integration | Four applied snapshot receipts; fourth packages independently checked again after installation | Continue46,573 pending source senses; unresolved and indexed-only proposals remain excluded |
| Source versions/licences,all-field review,teaching/media,selective diagrams,no paid model API | Partial:1,317 new independent full reviews;2,036 focused repairs since initial baseline | Remaining dictionary and unresolved cases stay open |
| Raw identities,personal edits,course variants,frozen history,old resource bytes | Identity/SQL checks passed;all4,418 old dist URLs retain their SHA256;1,143,969,737 bytes | All4,418 production hashes passed |
| 1440/390/320,themes,keyboard,long materials,transitions,input | All11 production-build isolated browser flows passed;beforeinput-to-frame median3.1ms/max10.1ms | Production11-flow verification passed |
| Full tests,build,identity/SQL/content/resources,commit/push/Cloudflare Git deployment | Full suite,production build,identity,SQL,content,bundle,Cloudflare,production browser and retained-resource gates passed | Runtime release1d0081196d595cfdaac6b3a9ff7ad57116cc2480;remaining scope stays open |

## Dictionary accounting

Initial baseline:52,108 total /4,262 fully reviewed /47,846 pending.

Current integrated working tree: **52,152 total /5,579 fully reviewed /46,573 pending**. Added1,317 independent full reviews include11 restored senses. Cumulatively there are44 restored sources,2,036 focused repairs,139 exact-retain materializations,eight structural heading variants,one selection-only variant and30 selection changes. These overlapping categories must not be added to claim more full reviews. All854 existing diagrams remain unchanged. No new verified source-specific media bindings are claimed for these reviews.

The first frozen proposal covered1,315 variants /192terms,968fix /180retain /167hold. The revised third packages add549 accepted variants:501field repairs and48retain materializations. They add213 full source reviews after exact installed-route checks. Seventy-four whole-variant holds and13 AM indexed-only semantic proposals remain outside the merge. Source collection,automatic checks,candidate packages,focused repairs and teaching variants never count as full source reviews.

Ignored evidence: local/unified-dictionary/release-proposal/applied-receipt.json, actual-source-gates.json, runtime-attestation.actual.json, release-independent-review.json, resources-stage-comparison.json and third-release/applied-receipt.json. The third snapshot passed787 actual display routes,8,657 individual-edit sentinels,187 typed-note route checks and480 generated-task checks. festival's historical adjective has an independently sourced explicit inapplicable-collocations decision bound to its final material hash; no fabricated collocations satisfy a quota. Distinguish pre-merge evidence from installed-runtime evidence; changed manifest inputs require new checks.

## Verification evidence

The247-suite acceptance below belongs to runtime release1d008119. The scoped-loading/fourth-content continuation has a fresh249-suite run:11,191 passed,0failed,1optional skipped (local/unified-testing/full-fourth-release-confirmed.json). Its build also type-checks new test fixtures; explicit StudyPlan annotations and complete fixture contracts were corrected after that run,with targeted checks repeated. Production build,identity compatibility and bundle budgets passed. All4,418 older dist resource hashes remain identical,covering1,143,969,737bytes. Fresh combined browser and production publication evidence is recorded in the continuation section when complete.

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

1. Expand independently verified exact-sense pronunciation and distinct-meaning guidance beyond sense labels.
2. Independently review and merge the frozen fifth packages,with exact task/media predicates and original/final source-sibling coverage. Neither author potential nor source preparation increases the ledger.
3. Continue46,573 pending source-sense reviews and preserve unresolved cases. Create subsequent whole-term packages from the new quality snapshot; the fourth snapshot is frozen historical evidence. Preparation,candidates and claims are not new approvals.

## Fourth content integration and scoped-loading continuation

The fourth author packages contain638 exact display variants. Independent review accepted585 (567 field proposals and18 retains) and held53 whole variants outside the merge. Checking all exact source siblings yields552 new complete source reviews; eight existing source identities were rechecked without increasing the total. No new raw source identities or diagram bindings were introduced.

Root checked752 installed display routes,8,272 personal-field edit sentinels,373 typed-note routes and342 staged task cases. A further independent installed-release audit checked585 final materials,53 held variants,560 complete sibling sets,552 new ledger records and5,855 source/restored hashes. It passed with only the expected readiness version change to core-2026-10-20.4. Evidence:local/unified-dictionary/fourth-release/applied-receipt.json,actual-installed-gates.json and fourth-independent-release-review.json (SHA256165c8e04cad93e55ab23ccdb5f67d7267b347b5c4485152fedf6c76699c180fd).

Scoped plan loading keeps open tasks,today/future history,the active task and planner rotation/learning anchors. Full backups load all plans before accepting their writable baselines. History reads return20 payloads plus a total and whole-plan stamp; all-result selection loads IDs first and selected rows before the impact preview. A read alone never advances the writable snapshot. Productive drafts load with their module; delayed hydration merges local field changes with untouched cloud sections/responses. Unloaded drafts and historical plans cannot become deletions.

Migration20261020220000_planning_history_pages adds coherent workspace/history RPCs and a compact planStamp guard inside the existing account lock. Receipts retain the original committed stamp on retry, so replay cannot silently accept an intervening edit. Legacy unstamped/planSet clients remain compatible. This compatibility layer was installed before frontend publication. Its predecessor function DDL is saved in the migration registry; restore latest first and preserve learner records and receipts during rollback.

Independent code review found and fixed an acceptance/save race: newly loaded historical baselines could make an older queued snapshot look like a deletion. Planning reads and acceptance now occupy the same save queue. Queued snapshots rebase only rows accepted after they were frozen,using per-acceptance object versions; later explicit deletions retain their meaning. Full backups use this path too. Refresh is serialized,clears accepted rows and increments a planning revision; an older queued profile/plan snapshot fails explicitly rather than overwriting the refreshed baseline. Deferred regressions cover all three loading entry points,reacceptance after refresh and saves queued during refresh. Filter controls are locked while selecting all results or preparing/saving their preview,preventing a late response from restoring the previous filter's IDs.

Related verification before the final release run:182 combined context/storage/Planning regressions passed,followed by two refresh-boundary checks. The new race regressions first failed before the fix. Isolated PostgreSQL pagination,filters,target ranking,IDs-only selection,legacy-client conflict,atomic/replay and RLS checks passed. Independent static fix recheck:local/unified-dictionary/review-fifth/history-fix-recheck.md. Final whole-suite,build and browser evidence will be recorded separately.

Production compatibility migration20261020220000 is installed before frontend publication. Its registered source MD5 matches the checked-in SQL:0f1ec8b18baa2cfc80aecafb7345037d. Registry stores two statements,including predecessor DDL; all three read/stamp functions remain security invoker,anon execution is denied,authenticated history is allowed,and replay retains the original receipt stamp. Schema-only verification:local/unified-testing/history-migration-result.json. Learner rows were not modified by installation.

The regenerated quality report binds source snapshot2955979ce5a1d92dcf18ba1f57fb586646c0bdb18fe2ecd276021e3f47df5d36. Three superseded punctuation-review receipts (Arabic,Historic,Italian) were archived; their new variants no longer trigger that signal,so no replacement approvals were invented. Active exact-example receipts:309. All9,087 learning variants have an example or typed reading note and no outstanding automated content-review signals; this is not semantic approval. Fifth packages0003/0004 are claimed by the two authors:107whole terms,577pending source senses and794exact variants. Their candidates do not increase the5,579complete-review total.

The continuation production build passed all15 combined isolated browser flows with0console/page errors (local/unified-testing/browser-fourth-preview.json). New checks cover on-demand productive drafts,explicit one-task association,one-word remaining budget,cross-page25-task archive/unarchive and an unloaded archived deep link that opens page2. Previewing makes no changes; unarchive preserves skipped status,date and identity. Input-to-next-frame for26letters measured median4.0ms/max6.2ms on this machine. Screenshots cover1440/390/320,dark/light,keyboard and reduced motion. The final four new component regressions passed after build-only fixture type corrections. These are local-build results; frontend publication and exact production verification remain pending at this commit.

## Continuation production acceptance

Runtime commit15411b6d78e444038a962324c1bb63f3ef1441f5 is pushed to master and deployed through Cloudflare Git integration (deployment3bc15d7f-0a79-4877-b87e-07a8f8f6a0f6). Cloudflare Pages,Supabase Preview,four test shards and Check build/audit all passed for that exact commit. The production entry JS/CSS SHA256 match the locally accepted build,and Planning,Settings and Review direct routes return it (local/unified-testing/deployed-build.json).

All15 production isolated browser flows passed with0console/page errors (local/unified-testing/browser-fourth-production.json). The archived deep-link flow reloads the app before asserting the target's individual fetch and page2 placement; its result does not rely on rows loaded by the preceding bulk action. Production beforeinput-to-next-frame for26letters measured median3.8ms/max5.8ms on this machine. This is a controlled observation,not a guarantee for other devices.

All4,418 historical production resource URLs retain their SHA256,covering1,143,969,737bytes with0remaining errors (local/unified-testing/resources-fourth-production.json). Six requests initially timed out through the local proxy; five succeeded on narrow retries and the last succeeded as HTTP200 with a per-request direct connection. No historical file was replaced or removed. Browser fixtures intercepted synthetic account data and did not modify real learner rows. The full dictionary and the retained guidance/pronunciation work remain open.
