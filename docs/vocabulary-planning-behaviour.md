# Vocabulary planning behaviour

These rules describe the current implementation, rather than a proposed roadmap.

- Daily vocabulary time comes from Plan settings: either fixed minutes or a percentage of the study day's total. The current percentage default is 20%; legacy settings may retain a fixed allocation. A carried, started or manually edited task retains its existing commitment.
- Within the available vocabulary time, review candidates take priority over new learning: confirmed errors, mistake recovery, due recall, missing foundational evidence, then spaced foundational practice. Review tasks estimate one minute per prompt and split by the configured block length.
- Automatic reviews use previously attempted, saved meanings and foundation modes (definition recall or dictation). Scheduling respects each mode's due date; an unfinished meaning or spelling dimension can also create a learning opportunity. A selected specialist review can retain its explicit assessed mode.
- New words are allocated only after the available review candidates have been assigned and time remains. They follow enrolled wordbooks, group order and the next unsubmitted learning batch. The configured batch (default ten) must fit as a whole; a short final batch can fit by its actual size. With sustained review backlog, new-word tasks can be absent for several days.
- Upcoming dynamic reviews freeze their exact words when started. New learning and frozen reviews preserve their identities. They are not silently replaced when the available queue changes.

A planned recall task is complete after a submitted session matches its task ID, exact entry/sense set and assessed mode, has a valid start/submission time and includes nonblank, graded answers for every prompt. Incorrect answers count as attempts. Audio-only listening, self-rated production, unrelated sessions and incomplete submissions do not meet this condition. Learning batches must additionally match the selected book, group, batch index and size.

Completing a task does not mean the words are mastered. Incorrect answers remain subject to the mode-specific FSRS schedule and mistake recovery. The UI's existing recovery rule requires three correct retries in the same mode, with at least 24 hours between the first and last. Saving a review and saving its plan status are separate account operations; the submission now waits for both and supports replaying the same session ID if the plan write fails.

Implementation: `src/lib/planTemplates.ts`, `src/domain/planningPreferences.ts`, `src/domain/vocabulary/planning.ts`, `src/domain/vocabulary/nextPractice.ts`, `src/domain/plans.ts` and `src/context/FieldbookContext.tsx`.
