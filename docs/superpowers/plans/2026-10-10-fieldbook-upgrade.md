# Fieldbook Workbench Upgrade

Approved by the user on 2026-10-10. English-first IELTS Academic writing and speaking; external marking remains the feedback source.

## Deliverables

- [ ] Modern neutral design system, light/dark/system themes, accessible shared controls, desktop rail, mobile navigation and command search.
- [ ] Honest save status, failure-safe completion, account-scoped local draft recovery and load retry.
- [ ] Schema v9, practice-mode isolation, English score contracts with legacy compatibility and feedback-driven pending plans.
- [ ] Writing focus/split/zoom/undo tools and mobile workflow; speaking recording recovery and real audio playback.
- [ ] Question favorites and filters; actionable feedback/rewrite comparison; phrase/story organization and filtered Recharts progress.
- [ ] Privacy/feedback/source surfaces, deployment checks, regression tests and responsive browser verification.

## Design Constraints

Manrope UI. Graphite text, neutral backgrounds, blue primary actions and teal speaking accents. No paper texture. Typography uses zero tracking. Controls have 6px corners; framed tools and repeated items have at most 8px corners. Motion respects reduced-motion settings. Mobile touch targets are at least 44px.

## Ownership

Root: context/storage, shared components, shell/themes/styles, Today, auth/account/legal, integration and browser QA.
Domain agent: state/scoring/plans and domain tests.
Practice agent: writing/speaking desks and audio player.
Feedback agent: review/progress/phrase/story pages and question banks.

## Verification

Run focused tests for changed contracts, then npm test and npm run build. Verify 390px, 768px and 1440px, dark theme and reduced motion. No push or production release during implementation. Production email delivery and real-user usability require real accounts/participants and are recorded separately from local verification.
