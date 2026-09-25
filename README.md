# IELTS Fieldbook

Local-first IELTS writing and speaking practice notebook. No account. Scoring stays in a markdown file you mark outside the app and import back.

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

- React, TypeScript, Vite
- Study records use schema **v8**

With `npm run dev` or `npm run preview`, the study file is `local/fieldbook-state.json` and recordings are files in `local/audio/`. `http://localhost:8000` and `http://127.0.0.1:8000` share those files because both hit the same process. The browser also keeps a `localStorage` copy under `ielts-writing-fieldbook`.

Open the address that already has your work once so that copy is merged into the file. After that, the other address sees it. If the dev server is not running, the app uses only that browser’s `localStorage`, and recordings fall back to IndexedDB on that address.

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

`public/sample` is the original sample bank shipped with this repo. A fresh clone can run against that bank alone.

If any of these files exist on your machine, they are **gitignored** and preferred over the sample bank when the app loads:

- `local/questions.json`
- `local/question-assets/`
- `local/speaking-questions.json`
- `local/speaking-samples.json`

The study file and recordings are also gitignored:

- `local/fieldbook-state.json`
- `local/audio/`

Personal score files, assessment drafts, and reference PDFs live under `local/` (`assessments/`, `reference/`). Do **not** commit Cambridge papers, third-party PDFs, or personal score files.

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
- User accounts
- Multi-device sync

Changing computers still needs the in-app backup. That JSON does not include recordings. Copy `local/audio/` yourself if you need the files.

## License

MIT. See [LICENSE](LICENSE).
