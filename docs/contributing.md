# Contributing

Use English Conventional Commit titles: `feat(vocabulary): guide daily learning`, `fix(planning): preserve started tasks`, or `docs: update deployment steps`.

Open a pull request and use squash merge. Its title becomes the resulting commit title; the Pull Request Title workflow checks its format. The historical merge graph is preserved separately by the one-time history migration, whose merge titles use `chore(merge): ...`.

Before publishing, run `npm test`, `npm run build` and `node scripts/check-bundle-budget.mjs`. Apply required database migrations before publishing a compatible frontend.

Run the full test suite separately from production builds and browser performance measurements. CI also checks dictionary reports, the vocabulary quality snapshot and identity/SQL compatibility. Use synthetic intercepted account fixtures for browser regressions; do not publish personal histories or authentication state.

## Local workspace

Keep source in `src/`, `tests/`, `scripts/`, `public/`, `supabase/` and `docs/`. Keep temporary browser scripts, screenshots and traces outside the checkout. `node_modules/` and `dist/` are generated; retained content-addressed vocabulary resources must remain available across releases.

Vite scans `index.html` for dependency entry points and excludes local archives, logs, backups and generated audits from file watching. Private reference HTML and retired source trees must not trigger dependency scans or application reloads.

The ignored `local/` directory groups files by purpose, not by whichever task created them:

- `data/banks/`: private writing/speaking banks and `question-assets/`; development URLs remain unchanged. `data/exams/` holds source exports and normalized exam banks. `data/personal/` holds assessments and notes; `data/reference/` holds reference books.
- `backups/exports/`, `backups/releases/` and `backups/storage/<date>/`: personal exports, database release snapshots and original storage objects. Keep manifests alongside the backup.
- `logs/<release>/`: final test/build logs; remove superseded diagnostic runs.
- `audits/`: regenerable detailed audit output; linked private JSON reports are not shipped in Git.
- `evidence/maintenance/<date>/`: file inventories, archive checksums and relocation/deletion manifests.
- `archive/vocabulary/` and `archive/qa/`: compressed historical authoring/review packages and structured acceptance evidence. Verify every archive member before removing its raw copy. Historical paths inside these packages describe their original layout.
- `work/<topic>/`: temporary active jobs and caches, created only when needed. Move unique completed evidence into an archive and remove reproducible intermediates when the job ends.

Do not add task-named folders or loose data files directly under `local/`. See `local/README.md` for the current machine's index, archive contents and restoration commands. Raw source audio, personal records and unique editorial decisions are retained; obsolete screenshots/logs, transcoding trials and reproducible current reports can be removed after classification.

Before removing a checkout, inspect both Git worktree registrations and its files. Preserve unique source, local data and build assets in a verified archive; delete only duplicates and reproducible dependencies after verification. Never recursively remove a junction or a computed path without checking its resolved target. See `local/README.md` when present for the machine's archive and relocation index.

## Content reports

Generated detailed audits live in gitignored `local/audits/`. Regenerate vocabulary reports with:

```sh
python scripts/audit-vocabulary-content.py
python scripts/audit-vocabulary-readiness.py
python scripts/audit-vocabulary-curriculum.py
```

The media audit also needs its private cached Commons metadata. Run it after the content audit. Concise Markdown reports remain in `docs/`; fonts, dictionaries, media, catalogues, SQL migrations and tests remain source-controlled.

Docs map:

- [vocabulary-content.md](vocabulary-content.md): sources, licensing and import formats.
- [vocabulary-learning-rules.md](vocabulary-learning-rules.md): learning, review and planning rules.
- [vocabulary-bulk-workflow.md](vocabulary-bulk-workflow.md): dictionary review workflow, plan and parallel review.
- [vocabulary-review-log.md](vocabulary-review-log.md): dated deliveries and batch reviews.
- The six generated `vocabulary-*-audit.md` and `vocabulary-quality-report.md` files: regenerate them with the scripts; do not edit them by hand.
