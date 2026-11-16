# Foreground recovery and reading workspace

This release addresses practice pages that remain in loading after a stalled account read or session refresh, duplicate Planning refreshes on foreground return, and practice clocks counting time spent in a hidden tab.

## Behavior

- Account reads and auth requests have bounded waits. Failed reads leave their shared cache so Retry can create a fresh request. Each account page has its own deadline, allowing large histories to finish over several pages. Media uploads retain a longer connection allowance.
- Planning navigation always opens Schedule, including a second click while already viewing History. Explicit task/history links still open their intended view. Foreground events share pending refreshes; actual learning activity still requests reconciliation. The calendar does not bind question banks or passages until Start, reducing work inside the save queue. Sync feedback has a reserved place beside the view tabs.
- Reading/listening part practice pauses on `visibilitychange` and `pagehide`, checkpoints answers and elapsed time, and waits for Resume. Listening practice pauses its recording too. Writing and speaking countdowns pause when hidden. A speaking recording stops into recoverable playback and remains in local pending audio. Full reading/listening mocks retain their clearly stated continuous exam clock.
- Vocabulary result rows identify the wordbook, chapter and group and link to group words with return context. Saved grading and frozen source snapshots remain intact. Results use page scrolling to avoid clipped rows beneath an internal sticky table header.
- Reading summary questions with choices are answered inline at the source blank. Empty imported judgment instructions receive useful guidance. Verified spacing/import typos in Cambridge 11 Test 4 Passage 1 are repaired in the read model; known old annotations across repaired passage copy remain locatable. Passage typography includes an actual regular serif font, and annotations use compact columns.
- Listening review explains that every completed intensive sentence is scheduled. The first interval uses dictation accuracy and understanding; later listening reviews use the new understanding rating. Ratings 1–2/3/4/5 schedule 1/2/4/7 days. Wrong initial dictation returns in one day; partial dictation within two days. Saving a rating previews the next date without replacing prior dictation or recordings.

## Validation

Regression coverage reproduces stalled reads and session acquisition, duplicate focus/visibility events, background practice timing, retained speaking recordings, inline summary answers, absent instructions, source grouping, and repaired annotations. Real browser verification uses an isolated temporary account and the actual twins passage at 320, 390, 900, 1024, 1440 and 2560 pixels, plus dark/light themes. It checks repeated foreground returns, delayed-read failure and Retry, deferred task binding on Start, answer retention after reload, and the full 10-word learning → dictation → mistake retry → learning return flow.

No database migration or public catalog write is required. Public text fixes are scoped in the client read model; historical attempts, results and evidence remain stored as originally submitted. Deployment follows the repository PR, squash-merge, exact-commit CI and production browser checks.
