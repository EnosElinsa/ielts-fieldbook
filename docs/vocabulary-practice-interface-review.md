# Practice input and meaning hierarchy

The reported screenshots show two different saved meanings of catastrophic as separate rows in an old planned dictation result. Current ordinary dictation and newly selected plans already limit repeated words; frozen planned selections preserve their exact original questions. Historical rows now identify Meaning 1 of 2 and Meaning 2 of 2 and explain that the saved session tested separate meanings. Every repeated word also resolves its displayed definition and Details destination by the saved sense ID, including older ordinary sessions: previously those rows could both resolve to the same current default meaning. Results, grades, schedules and evidence are not merged or deleted to simplify the display.

Word details now reserve expanded progress for the selected meaning. Other saved meanings are compact links that select their own notes and progress. The duplicate word-class headings disappear from this list. Additional dictionary meanings remain accessible in their existing separate lookup section; a single additional meaning does not need search or part-of-speech controls. The generic A dictionary meaning of this word provenance panel is omitted. Personal-note and source-specific provenance remains available.

Learning progress separates the next action from the selected meaning's state and four skill summaries. Desktop uses two columns and narrow screens stack the sections. Manual familiarity adjustment and counting rules are secondary disclosures. Usage remains independently tracked, and the rules continue to be available without repeating them beneath every meaning.

## Input latency

The prior input handler synchronously validated, normalised, cloned and serialised the entire frozen session into localStorage on every letter. A synthetic 30-card local production-build trace recorded 27 complete draft writes for one 27-event typing sequence, with each stored draft around 66.5 thousand characters. This is avoidable main-thread work; it is not evidence of network latency or a claim that the local machine reproduces the learner's exact delay.

Answers and the active in-memory session still update immediately. Only draft persistence waits for 250 ms of typing inactivity. Blur, navigation between answers, hiding/leaving the page, unmounting and explicit session transitions flush the current answer. Account changes and discarding cancel queued writes. Successful submission clears the draft and cancels queued work, preventing an old timer from resurrecting it. Validation of stored and submitted content is retained.

The matching final-build trace records one idle save instead of 27 per-letter saves, with both 30-word and 200-word synthetic accounts. Local median beforeinput-to-next-frame samples are 4.2 and 3.9 ms after the change, versus 6.1 and 4.6 ms before. Maximum samples are 10.1 and 13.7 ms after, versus 13.2 and 6.3 ms before. Frame timings vary; these local samples support removing synchronous persistence from typing but do not quantify latency on the learner's device or establish a universal speedup.

Regression tests exercise immediate input, no per-letter writes, pagehide recovery, discard cancellation, selected-only progress, exact saved-meaning links, small dictionary controls and unchanged duplicate historical results. Browser measurements, screenshots and release checks are kept outside committed product sources.

## Validation

A full local run passed 7,376 tests with one conditional skip across 203 files. After the final repeated-row meaning-resolution adjustment, both affected UI suites passed all 144 tests. Compilation, the production build, dictionary audit, compact identity verification, identity/SQL checks and bundle budgets pass.

The production build passes 204 Chrome states across 1440/light, 1440/dark, 390/dark and 320/light using synthetic accounts and intercepted persistence. Checks include distinct legacy meaning labels and destinations, selected-only progress, dictionary controls, all 26 discount/survey meanings, 48 contextual exercise submissions and returns, 16 real audio decodes, and four type/pause/reload/resume/submit/retry journeys. Every checked state has meaningful content, correct page identity, no framework overlay, no console errors and no unexpected horizontal overflow. Desktop and mobile screenshots were inspected. Browser plugin not available; bundled Playwright and installed Chrome provide the validation.
