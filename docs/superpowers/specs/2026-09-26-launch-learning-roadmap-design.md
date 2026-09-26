# Launch learning roadmap

Four slices. An empty account sets an exam date, finishes one task, exports a scoring file, scores it outside the app, then imports it. After import, the next Start opens the weakness task. Scoring stays outside the app.

Slice 1 and slice 2 are the launch bar. Slice 3 (speaking evidence) and slice 4 (two devices, backup omits recordings) come after that path can already run end to end.

This file is the roadmap. The next spec implements only slice 1. Slices 2, 3, and 4 remain in this file and each gets its own spec later.

## Out of this roadmap

Listening, reading, in-app scoring, offline install, sample scores, and new pages.

## Slice 1 — finish once and hand off the score file

Surfaces: `src/features/today/TodayPage.tsx`, `src/features/modals/SaveModal.tsx`, the post-export toast in `src/context/FieldbookContext.tsx`. Import score stays in the header in `src/components/Shell.tsx`.

When the current skill has no saved attempt, Today shows under the lead: `Finish one task. Export the file, score it outside Fieldbook, then import the scored file.` The sentence disappears once that skill has an attempt. The existing empty-exam-date prompt stays as it is.

Writing Finished says: `This file is the essay to score. Score it outside Fieldbook, then import the scored file.`

Speaking Finished (interim; replaced in slice 3) says: `This file is what you said. The recording is not inside the file. Score it outside Fieldbook, then import the scored file.`

The primary button remains Save and export. Save only remains. What to watch, Next step, and Mistake tags may be left blank and still save.

Export still downloads Markdown. A normal attempt goes to Review, and that toast adds the instruction to score outside Fieldbook and import the scored file. When a writing mock or speaking mock continues to the next part, the toast still only names the next part.

Finished does not gain an import button.

Slice 1 is done when those sentences, buttons, and toast behaviours hold. Tests are fixed assertions in the existing page tests.

## Slice 2 — the score comes back and the next task follows the weak criterion

Import is `importAssessment` in `src/components/Shell.tsx`. Weakness and plan sync are `practiceFromWeakness` and `syncPendingPlan` in `src/domain/plans.ts`, and `src/lib/planTemplates.ts` which today only updates a plan that is pending and dated today.

A linked import with a weak criterion toasts: `Score linked to the essay. Practise task achievement first.` Speaking uses transcript instead of essay. The criterion name is the one just calculated, lowercased in the sentence the way Today already does (for example fluency).

A score saved with no attempt to link keeps the current no-link sentence and adds which criterion to practise first.

A duplicate import leaves the toast and plans unchanged.

A file with no overall, criteria, or summary keeps the current sentence that it looks like a request, not a marked script.

Only not-started plans change. If today's plan for that skill is pending, it becomes the weakness task. If today's plan is in progress or completed, the next pending plan of that skill changes instead. An in-progress plan keeps its task.

Start on Today opens that updated plan. The Today lead that names the first criterion keeps the existing `weakestCriterion` behaviour.

Slice 2 is done when those import toasts and plan states hold. Tests are fixed assertions in the existing page tests and domain tests.

## Slice 3 — speaking evidence

Recording area: `src/features/speaking/SpeakingDeskPage.tsx`. Slice 3 replaces the slice 1 speaking Finished sentence.

Beside the record controls: `The recording stays on this account. The score file has no audio. Pronunciation stays unscored unless you give the recording to whoever marks the file.`

Transcript placeholders stay as they are. The footnote still says the draft saves itself, and no longer repeats where the recording lives.

Speaking Finished (final) says: `This file is what you said. The recording stays on this account and is not inside the file. Pronunciation stays unscored unless you give the recording to whoever marks the file. Score it outside Fieldbook, then import the scored file.`

Slice 3 is done when those speaking sentences hold. Tests are fixed assertions in the existing page tests.

## Slice 4 — later write wins

`src/features/modals/SettingsModal.tsx` keeps the existing note that a backup JSON does not include recordings, and adds: `If this account is open on two devices and both change the same item, the later save is kept.`

`src/features/modals/BackupModal.tsx` says the import merges with what is already there, essays and transcripts stay, recordings are not in this file, and they stay on the account.

There is no UI to pick which version to keep.

Slice 4 is done when those backup and settings sentences hold. Tests are fixed assertions in the existing page tests.

## The next spec

The next spec implements only slice 1. Slices 2, 3, and 4 stay in this roadmap and each gets its own spec later.
