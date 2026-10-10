# IELTS Fieldbook

An English-only IELTS study workspace for writing, speaking and vocabulary. Practise with a plan, collect useful language from feedback, and review it across skills without losing its original context.

[Open the app](https://ielts-fieldbook.pages.dev) · [Report an issue](https://github.com/EnosElinsa/ielts-fieldbook/issues/new)

## Study Workflow

1. Set an exam date, target band, study days and daily time.
2. Complete a writing or speaking task. Save drafts, outlines, transcripts, recordings and rewrites to your account.
3. Export a Markdown scoring request, have it assessed outside Fieldbook, and import the feedback.
4. Save expressions from the feedback to your vocabulary. Review meanings, listening, spelling and usage separately.
5. Use the next practice task to apply corrections, then follow progress over time.

Fieldbook does not issue official IELTS scores. Pronunciation remains unscored without an external assessment using the recording.

## Vocabulary

Words, phrases and sentence patterns share a single vocabulary model across wordbooks and personal collections. Each meaning has its own learning state; writing and speaking occurrences retain their source task. Reading and listening evidence use the same contract for future practice modules.

- List or focused dictation with automatic UK/US audio and clearly identified browser speech fallback.
- Wordbook study uses each complete group's actual word count in source order; due and wrong-word review batches have their own size and filters.
- List practice shows 50 items per page without splitting the session. Arrow keys move between single-line answers, Ctrl/Command+Enter replays audio, and Escape pauses with progress recovery.
- Submit a whole session once, then see responses and answers together. Immediate feedback remains optional.
- Account-scoped answer recovery, exit/resume, saved session history and retrying mistakes.
- Practice preferences for review batch size, order, layout, feedback, accent, speed, volume and repetitions. Settings retain unsaved edits across tabs and failed saves.
- English definition recall, contextual cloze, synonym and confusing-word practice.
- Audio loops and sentence production. Playback does not count as a successful review; unassessed production remains pending.
- FSRS review scheduling with separate meaning, listening, spelling and usage evidence.
- Manual familiarity labels independent of system evidence.
- Permanent answer history and current wrong-word tracking. Recovery requires three successful reviews in the failed mode, including a delay of at least 24 hours.
- Wordbook chapter progress independent of vocabulary mastery.
- CSV import previews, repeated-import detection, and atomic saves.
- English Wiktionary definitions and examples with attribution and licensing per sense, alongside original IELTS teaching material.

The public catalogue covers six source wordbooks: IELTS Vocabulary (Liu Hongbo), IELTS Reading 538 Key Words, IELTS Listening Corpus (Core Chapters), IELTS Listening 179 Key Words, and Cambridge IELTS 20/21 Listening. Source membership counts, dictionary coverage and unavailable content are shown separately. Personal learning records are never included in the shared catalogue.

See [vocabulary content and provenance](docs/vocabulary-content.md) for source data, licensing and import formats.

## Writing And Speaking

Writing includes Task 1/2 question banks, chart assets, short exercises, timed/full essays, focused editing and draft history. Speaking includes Part 1/2/3 banks, blind practice, story planning, recording and three-part mocks.

Feedback links back to the original attempt. Vocabulary occurrences are initially pending; imported feedback can confirm correct usage only with an exact quotation from that attempt. Short exercises and historical attempts with unknown modes are excluded from comparable band trends.

The workspace includes Today, questions, practice, review, vocabulary, progress, account settings, search, favourites and light/dark/system appearance.

## Development

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev
```

The development server uses `http://localhost:8000`. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using `.env.example`. A Supabase account is required to save learning data.

```bash
npm test
npm run build
```

Stack: React 19, TypeScript, Vite, Supabase, FSRS, Radix UI and Cloudflare Pages. Study records use schema **v10**. Historical backups migrate to the current model; the old Phrases route is removed.

## Data And Privacy

Shared question and vocabulary catalogues are read-only to signed-in users. Attempts, drafts, feedback, vocabulary learning states, review history, plans, stories and recordings belong to the signed-in account and are protected by Supabase row-level security.

JSON backups include study data but omit recordings. Recordings remain in private account storage and can be downloaded separately. Account deletion removes owned records and recordings. Draft recovery and pending audio are scoped to the account in the current browser.

`local/` is gitignored and holds personal exports, source snapshots and deployment backups. Never commit `.env`, service credentials, login sessions or personal learning history. Code uses the MIT license; dictionary and other content retain their own source licenses.

## Deploy

Apply SQL migrations in `supabase/migrations` in timestamp order before releasing a frontend that depends on the new schema. Seed shared data with administrator credentials kept outside browser builds:

```bash
npm run seed:bank
npm run seed:vocabulary
```

Push `master`. The connected Cloudflare Pages project `ielts-fieldbook` builds with `npm run build`, publishes `dist`, and serves https://ielts-fieldbook.pages.dev. The GitHub Check workflow runs tests and a production build. Deployments are verified through the Cloudflare Pages check for the exact commit.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Pages build settings. Configure the production origin in Supabase authentication site/redirect URLs. `public/_redirects` serves application routes through `index.html`. Do not upload `dist` with Wrangler for routine releases.

See the [deployment runbook](docs/deployment.md) for migration, catalogue seeding, verification and recovery.

## Limits

Reading and listening practice modules are not yet implemented. There is no offline installation or concurrent editing of the same record. Open-dictionary coverage varies by term; missing definitions remain visible instead of being presented as verified content.

## License

Application code: [MIT](LICENSE). English Wiktionary content: CC-BY-SA-4.0 with contributors and source URLs. Original Fieldbook teaching content: CC-BY-4.0. Source wordbook names identify their providers and are not an endorsement or claim of ownership.
