# Project guide

IELTS Fieldbook is a React 19 / TypeScript / Vite app backed by Supabase. Read `docs/contributing.md` and `docs/deployment.md` before releasing. Product behavior is documented in `docs/actionable-planning.md` and `docs/vocabulary-learning-rules.md`.

- Keep app UI copy in English. Use English Conventional Commits, a pull request and squash merge. Production follows `master` through Cloudflare Pages.
- Study state is schema v13 (`src/domain/state.ts`). Preserve account isolation, immutable histories, exact planned targets and content-addressed resource URLs.
- Planning summaries are read-only. They must never overwrite full history rows or become writable collections. Schedule-only saves clone and write plans/settings; preserve concurrent drafts and account-switch guards.
- Reconcile durable, explicitly bound completion evidence before carryover. Do not infer completion from titles, scores or unrelated practice, or replay productive mock stages.
- Run `npm test`, then `npm run build`, then `node scripts/check-bundle-budget.mjs`. CI additionally checks dictionary/quality reports and identity/SQL compatibility. Do not run full tests concurrently with builds or performance measurements.
- Use synthetic account fixtures for browser checks. Put temporary scripts, screenshots and traces outside the checkout. Follow the ignored local-directory conventions in `docs/contributing.md`; preserve private backups and unique work before cleanup.
- Never commit `.env`, credentials, browser sessions or personal study data. Generated detailed audit reports belong in ignored `local/audits/`.
