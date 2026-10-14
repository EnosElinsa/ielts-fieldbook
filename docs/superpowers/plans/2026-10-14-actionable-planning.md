# Actionable planning implementation

**Goal:** Implement the approved automatic scheduling plus freely editable plan, weekly settings and consistent selects.
**Architecture:** Pure scheduling preferences and task factories feed the existing transactional account save queue. Reuse the task editor for creation/replacement/duplication; share one Radix select across fields and filters.
**Stack:** React 19, TypeScript, Radix, Vitest, Vite.
**Spec:** User-approved plan in this chat, October 14, 2026.

## Constraints
- Preserve started/completed/manual tasks and exact completion bindings.
- Existing settings migrate to explicit legacy vocabulary minutes; fresh accounts use 20%.
- Over-budget manual changes require explicit confirmation. Automatic tasks never exceed the day budget.
- Use the existing account-owned save queue; no production deployment or database schema change.

## Steps
- [x] Add failing scheduling tests: 90-minute splitting, weights, weekday overrides, legacy migration, protection and idempotency.
- [x] Implement normalized preferences, day budgets and deterministic bounded task allocation; make those tests pass.
- [x] Add failing operation tests for add, duplicate, resize, explicit targets and confirmed overage. Implement typed actions and task validation, then bind targets before committing.
- [x] Add select/modal regression tests. Replace bespoke popup coordinates with a shared Radix select using viewport collision handling and a modal-safe portal.
- [x] Implement weekly settings, weights, vocabulary allocation and generated-plan preview from the same planner. Verify save/retry/account boundaries.
- [x] Implement the shared task editor, material search, day load display, add/duplicate/resize/move/order actions and Today ordering.
- [x] Migrate remaining native selects with value/event compatibility; verify each affected flow.
- [x] Run focused tests, full Vitest and production build. Browser-check 320/390/1440px and both themes using an isolated local account; record evidence and limitations.

Implementation and verification notes: [Actionable planning](../../actionable-planning.md).
