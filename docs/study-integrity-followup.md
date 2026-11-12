# Study integrity follow-up, 12 November 2026

The follow-up checks the adjacent reading, listening, vocabulary learning and planning flows after the full-passage repair. Five reproducible defects receive targeted fixes:

- An unfinished listening task with a previously shortened question selection now offers **Continue full part**, using the same durable expansion operation as reading. A failed expansion keeps the original answers and scope. Successful expansion retains notes, elapsed time and recording position; wrong-answer retries and completed sessions keep their original scope.
- A direct learning link that selects a particular meaning now uses that displayed meaning in its batch assessment. Assigned plans retain their frozen meanings.
- Changing a custom word selection in the same learning page no longer reuses assessment cards from the previous selection. Batch caches include the ordered word selection as well as the account and group.
- A stalled recording-URL request times out after 15 seconds, allowing another read to retry. Retrying a failed mock recording obtains a fresh signed URL and retains its position on the exam timeline.
- Phone listening navigation wraps its question numbers. A source table that exceeds the available width has a horizontal-scroll hint and a keyboard-focusable scroll region. Its cell structure, answer identifiers and annotation block identifiers remain intact.

Regression tests first reproduced the missing listening expansion, mismatched direct-link meaning, stale custom selection, stalled asset request and cached mock retry. Related coverage exercises failed saves, account changes, fixed plans, historic meanings, notes and source annotations.

Browser validation uses Playwright because the Browser plugin is unavailable. It exercises a five-to-ten-question listening expansion, retained answers and recording position, wrapped navigation, keyboard table scrolling, navigation to an offscreen answer and launching practice for an explicitly selected vocabulary meaning. Desktop and phone smoke checks include reading, listening, word details, group learning, planning and the question bank. Audio seeking uses a synthetic recording with byte-range support; the older no-range harness recording cannot validate seeking.

No source catalogue, dictionary teaching content, account schema or scoring rules change in this follow-up. Linguistic review of the rest of the dictionary remains separate from these interaction repairs.
