# Production UX Completion Plan

> **For agentic workers:** Execute the tasks below in order, preserve the existing worktree, and record acceptance evidence here. The user's continuing implementation authorization covers routine local changes. No commit, account write, migration or deployment is part of this plan.

**Goal:** Complete the actionable UI and learning-workflow gaps found in the October 13 audit and subsequent source review.

**Architecture:** Reuse FieldbookContext saves, account boundaries, plan generation and existing Radix controls. Preserve personal drafts, historical vocabulary identities, external feedback attribution and account isolation.

**Tech Stack:** React 19, TypeScript, Vite, Supabase, Radix, lucide, Vitest and Playwright.

**Spec:** This document defines the remaining acceptance scope; previous completed work is documented in `docs/interface-polish.md`.

## Constraints

- Keep public/private question-bank boundaries and personal-data contracts intact.
- Target desktop 1440px and mobile 390px/320px, light/dark themes, keyboard operation and visible save recovery.
- Never present unsaved data as cloud-saved. Do not overwrite an existing practice draft without confirmation.
- Use the existing external feedback workflow; do not invent AI marking or pronunciation scores.
- Local browser tests use synthetic accounts and intercepted external requests. Real-account cloud, microphone permissions and deployment require separate validation.

## Task 1: Feedback And Draft Recovery

Files: `Shell.tsx`, `SaveFailure.tsx`, `AssessmentImportModal.tsx`, `ReviewPage.tsx`, `AssessmentDetailPage.tsx`, `FieldbookContext.tsx`, focused tests.

- [x] Reproduce import/save and draft-reuse failures with focused tests.
- [x] Route feedback file import through the awaited shared importer; retain file text and errors for retry, guard duplicate submits and account changes.
- [x] Add a real global retry for the latest recoverable save snapshot.
- [x] Protect existing drafts during targeted practice/reuse and preserve source attempt, mode, Part and errors. Require successful save before success/navigation or clearly recover a local failure.
- [x] Distinguish filtered-empty attempts from an account with no attempts. Preserve skill context on detail return and allow re-assessment from the latest unmarked rewrite.
- [x] Run feedback, context, review and recovery tests.

## Task 2: First Study Setup

Files: `features/today/StudySetup.tsx`, `TodayPage.tsx`, `styles/planning.css`, focused setup tests.

- [x] Add an inline first-study form on Today using existing settings and `saveStudySettings`.
- [x] Offer optional band/exam date, daily minutes, weekdays and skills; validate before saving.
- [x] Persist completion in profile settings, expose retry on failure and allow the current plan to be accepted.
- [x] Keep established accounts on their normal Today view; reuse settings rather than introducing a second settings system.
- [x] Verify successful/failed saves, validation and existing-account behavior.

## Task 3: Honest Progress Ranges

Files: `features/progress/practiceActivity.ts`, `ProgressPage.tsx`, tests.

- [x] Replace fixed four-week bars with range-sensitive activity buckets covering all selected practice.
- [x] Use local calendar-day bounds consistently; exclude future/invalid dates.
- [x] Retain linked feedback when the feedback date is in range even if the original attempt is older; apply skill/task filters correctly.
- [x] Show unclassified comparable feedback in the chart rather than an empty line.
- [x] Verify 7/30/90/all ranges and task/skill links.

## Task 4: Vocabulary Identity Payload

Files: `identities.ts`, compact identity resource, identity regression tests, bundle budget script.

- [x] Trace the large shared payload and retain all canonical structural conversions.
- [x] Generate a compact reversible identity representation; keep the full authoring mapping for scripts and migration verification.
- [x] Verify every legacy mapping and opaque source record, account recovery and route compatibility.
- [x] Build and measure shared/login assets; add a regression budget for the largest JS asset.

## Task 5: Browser And Accessibility Acceptance

- [x] Verify onboarding, feedback import/failure/retry, rewrite/reassessment, progress ranges and global search on the actual rendered app.
- [x] Check 1440/390/320px, both themes, no horizontal overflow, button/text fit, footer clearance and keyboard focus.
- [x] Verify navigation, bank pagination, empty/error/loading states and simulated microphone denial/recovery.
- [x] Capture screenshots and inspect the saved files. Record actual evidence limits.

## Task 6: Final Gates And Documentation

- [x] Run all tests, production build, bundle budgets and `git diff --check`.
- [x] Review the final diff for regressions and address material findings.
- [x] Update interface/performance docs with completed changes and measured results.
- [x] Keep real-cloud, original-audio and deployment validation explicitly separate from local acceptance.

## Inspection Decisions

- Global search already waits for all account modules and both productive banks through `AccountDataBoundary`; it is not restricted to whichever module was previously visited.
- The seven-item mobile navigation is intentional: all five learning modules, Today and More. Preserve these direct entries and verify touch targets at 320px.
- The 1.27 MB shared JS payload originates mainly from `identityMapping.json` (9,205 redundant membership rows), not from curriculum authoring data, which is already loaded by scope.
- Existing first-batch changes remain part of final verification: stable timers, due vocabulary counts, ranged vocabulary activity, pagination, mobile speaking and route error recovery.

## Acceptance Evidence

- Task 1: 78 focused tests passed across feedback, context, review, save recovery and writing constraints.
- Task 2: 9 setup/Today tests passed. TypeScript found the missing DateField id in the new form; the field now has an explicit associated label and id.
- Task 3: productive and receptive ranges have focused tests; browser checks cover seven daily, five weekly and thirteen weekly buckets and recent feedback linked to a 60-day-old attempt. All-time retention is covered by domain tests. Standalone and embedded vocabulary activity share local-day bounds and exclude future results; undated imports remain explicitly undated in all-time history.
- Task 4: all 9,205 membership rows reproduce the authoring mapping exactly. Compact resource: 236,673 bytes versus 1,527,050 bytes of authoring JSON. Final shared preferences asset: 349,581 bytes; largest JS: 385,497 bytes; login gzip: 185,405 bytes across three assets. Both 300 KiB login and 500 KiB largest-asset budgets pass.
- Task 5: six additional production-browser workflows passed with no runtime errors: setup/save outage/retry/reload; feedback import failure/retry and rewrite; cancel/accept existing-draft replacement; older-source feedback and ranges; search and keyboard navigation; injected microphone denial and tabs. Saved desktop/mobile light/dark screenshots were opened and inspected. Mobile navigation targets meet 44x44 at 320px. Writing toasts no longer cover sticky draft actions. Reassessment export and failed recorder initialization/re-record recovery are covered by component tests, not real marker/device tests.
- Final regression run: 116 files, 975 tests passed, one skipped. TypeScript, production build and bundle budgets passed. A delayed feedback import cannot save after account replacement; targeted practice supports canceled/deferred navigation before draft mutation.
- Task 6: both production-preview browser harnesses passed all twelve workflows with no runtime errors. Final performance measurement has fifteen samples for each of twelve desktop/mobile scenarios. Mobile p75: login 774 ms, save 925 ms, repeat group 215 ms, initial group 2,629 ms, first writing 2,100 ms, settings after local session confirmation 2,189 ms. Settings misses the prior two-second target; fixture hashes changed, so the script correctly rejected old-baseline percentage comparisons. These remaining performance and real-environment acceptance limits are recorded explicitly in `docs/performance-results.md`; this plan completes the scoped UI implementation and local verification, not a production deployment certification.
