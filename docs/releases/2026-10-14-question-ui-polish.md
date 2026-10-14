# Today and question workspace cleanup

Follow-up to the deployed manual-test fixes (`ab84c6b`), prompted by screenshots of Today and listening questions 31–40.

- Today uses the existing theme border token, padded summary and task rows, aligned counts, and readable skill colours in dark mode.
- Group instructions, question type and a shared word limit appear once. Imported fallback prompts disappear only when the displayed source contains the corresponding numbered blank; real stems and diagrams remain visible.
- Both `#####-31-#####` and `[31 ____]` source markers support integrated answers. Split rows put the number beside the input; evidence notes use a compact expandable entry, and checks appear after an answer is entered. Integrated blanks show the selected question's tools rather than repeating every helper card.
- Embedded source diagrams are not repeated at the bottom. Old bracket-blank annotation IDs remain eligible for the notes list; an unresolved original position is explicitly reported.
- Answer state, checks, explanations, saved notes, layout preferences and mock restrictions use the existing attempt and storage paths. No database migration is required.

Validation: full local suite **1,101 passed, 1 existing skipped** across 130 files; the final question-material safety adjustment also passed all **47 exam-page tests**. Production build, vocabulary identity/SQL checks, bundle budget and whitespace checks passed.

Playwright rendered the actual Shell, Today and exam components with public exam content extracted from the existing local backup and an isolated in-memory account fixture. The rubber section, a map with multiple-choice questions, reading matching and heading questions, and an active reading mock were exercised. Desktop (1600px), phone widths (390px and 320px), light/dark themes and 200% CSS zoom were checked. Answers survived layout and mobile-view changes, source diagrams loaded once, the last answer remained reachable above the separate submission area, and mock selection exposed only permitted tools.

Browser artifacts are preserved locally under `local/ui-polish-2026-10-14/acceptance`. These checks do not simulate a physical phone keyboard or verify a new cloud-account save; the browser fixture uses a one-second local audio asset. The existing cloud data model and recording implementation are unchanged. Exact GitHub CI and Pages deployment evidence is recorded in the local acceptance report after publication.
