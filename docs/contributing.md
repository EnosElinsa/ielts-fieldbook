# Contributing

Use English Conventional Commit titles: `feat(vocabulary): guide daily learning`, `fix(planning): preserve started tasks`, or `docs: update deployment steps`.

Open a pull request and use squash merge. Its title becomes the resulting commit title; the Pull Request Title workflow checks its format. The historical merge graph is preserved separately by the one-time history migration, whose merge titles use `chore(merge): ...`.

Before publishing, run `npm test`, `npm run build` and `node scripts/check-bundle-budget.mjs`. Apply required database migrations before publishing a compatible frontend.

Generated detailed audits live in gitignored `local/audits/`. Regenerate vocabulary reports with:

```sh
python scripts/audit-vocabulary-content.py
python scripts/audit-vocabulary-readiness.py
python scripts/audit-vocabulary-curriculum.py
```

The media audit also needs its private cached Commons metadata. Run it after the content audit. Concise Markdown reports remain in `docs/`; fonts, dictionaries, media, catalogues, SQL migrations and tests remain source-controlled.
