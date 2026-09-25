# IELTS Fieldbook

IELTS writing and speaking practice notebook. Sign in with an email account. Scoring stays in a markdown file you mark outside the app and import back.

Public repository: [EnosElinsa/ielts-fieldbook](https://github.com/EnosElinsa/ielts-fieldbook).

## Features

- **Today** — a daily plan from exam date, minutes per day, and skill focus. Within two weeks of the exam, more days are timed practice or review. At 60 minutes or more, writing and speaking slots are full timed tasks.
- **Writing desk** — the plan decides the desk. Overview, outline, comparison, and body tasks use short fields with word limits. Timed and full essays require the checklist. Drafts and rewrite history stay on the question.
- **Speaking practice** — timed Part 1 / 2 / 3, plus a three-part mock. You can record; the app stores the audio and you still type the transcript. Blind practice hides notes, sample answers, stories, and earlier transcripts.
- **Stories** — a story plan can attach an unused Part 2 card.
- **Phrase review** — words, phrases, and sentence patterns. Due cards hide the answer; sentence patterns ask you to write them first.
- **Progress** — recent criterion scores, a target-band line when you set one, and study-day streaks.
- **Backup merge** — export/import a JSON archive. Import previews, then merges instead of overwriting. The JSON does not include recordings.
- **Score files** — save and export a markdown scoring request, score it outside the app, then import the markdown back.

## Stack

- React, TypeScript, Vite, Supabase
- Study records use schema **v8**

Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Apply `supabase/migrations/20260925120000_fieldbook.sql` in the Supabase SQL editor, then seed the shared question catalog:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key npm run seed:bank
```

The service role key stays on the machine that runs the seed. The browser only receives the anon key. Sign in with email. Each account has its own attempts, drafts, phrases, plans, stories, scores, and recordings. The question catalog is shared and read-only in the app.

## Getting started

```bash
npm install
npm run dev
```

The Vite dev server runs at `http://localhost:8000`. Other common commands:

```bash
npm test
npm run build
```

## Data layout

`public/sample` is the public question catalog. `npm run seed:bank` writes it into the shared tables. Question images under `public/sample` are served with the app.

Personal score files and reference notes can still live under gitignored `local/`. Do not commit `.env`.

## Scoring flow

1. Finish a writing or speaking attempt in the app.
2. Save and export a markdown scoring request.
3. Score that file outside the app (any process you choose).
4. Import the scored markdown back into Fieldbook.

Import linking order:

1. Match `session_id` in the file to an existing attempt.
2. Else match on body hash.
3. Else create a new attempt from the import.
4. Else report `missing_essay`.

Speaking pronunciation is **not** scored from a transcript or a recording inside the app. A speaking request includes `audio_present: true` or `false`. Pronunciation stays `unscored (transcript only)` unless you hand the audio to whatever scores the file outside the app.

## What this version does not do

- Service worker / offline install
- Live collaboration on the same row

Two devices on one account each write their own rows. If both edit the same row, the later `updated_at` is kept. A new account starts empty. A backup JSON still omits recordings; the audio stays in the account’s storage bucket.

## License

MIT. See [LICENSE](LICENSE).
