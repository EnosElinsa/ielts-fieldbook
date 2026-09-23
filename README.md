# IELTS Fieldbook

Local-first IELTS writing and speaking practice notebook. It runs entirely in the browser: no account, no server, and no audio recording.

Public repository: [EnosElinsa/ielts-fieldbook](https://github.com/EnosElinsa/ielts-fieldbook).

## Features

- **Today** — a daily plan based on exam date, study days, and skill focus
- **Writing desk** — timed practice with live word count, local drafts, and rewrite history
- **Speaking practice** — timed Part 1 / 2 / 3 sessions; you type a transcript (no microphone, no recording)
- **Phrase review** — vocabulary, phrases, and sentence patterns with spaced flip cards
- **Progress** — band trends and study-day streaks, not just attempt counts
- **Backup merge** — export/import a full archive; import previews, writes a rollback copy, then merges instead of overwriting
- **Score files** — save and export a markdown scoring request, score it outside the app, then import the markdown back

## Stack

- React, TypeScript, Vite
- All user data stays in `localStorage` under the key `ielts-writing-fieldbook` (schema **v7**)

## Getting started

```bash
npm install
npm run dev
```

The Vite dev server runs at `http://localhost:8000` (same port as the old local server, so existing `localStorage` stays available). Other common commands:

```bash
npm test
npm run build
```

## Data layout

`public/sample` is the original sample bank shipped with this repo. A fresh clone can run against that bank alone.

If any of these files exist on your machine, they are **gitignored** and preferred over the sample bank when the app loads:

- `questions.json`
- `question-assets/`
- `speaking-questions.json`
- `speaking-samples.json`

Do **not** commit Cambridge papers, third-party PDFs, or personal score files. Keep private banks and assessments on disk only.

## Scoring flow

1. Finish a writing or speaking attempt in the app.
2. Save and export a markdown scoring request.
3. Score that file outside the app (any process you choose).
4. Import the scored markdown back into Fieldbook.

Import linking order for writing:

1. Match `session_id` in the file to an existing attempt.
2. Else match on body hash.
3. Else create a new attempt from the import.
4. Else report `missing_essay`.

Speaking pronunciation is **not** scored from a transcript. You can still save transcripts and import other scored dimensions when present.

## What this version does not do

- IndexedDB
- Service worker / offline install
- Microphone recording
- User accounts
- Multi-device sync

Data lives in this browser’s `localStorage`. Back up with the in-app export if you change machines or clear site data.

## License

MIT. See [LICENSE](LICENSE).
