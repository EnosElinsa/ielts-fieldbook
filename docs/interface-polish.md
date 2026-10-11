# Navigation and interface polish

The workspace uses IELTS test order: Listening, Reading, Writing, Speaking, then Vocabulary. Today stays first and Progress follows the learning modules. Sidebar, mobile navigation and workspace search share `workspaceModules`; study settings and Progress filters follow the same order.

The expanded sidebar puts study links immediately below their module. Collapsing the sidebar hides study links and keeps the module tooltips. Study selection includes route query parameters so intensive listening and the listening bank cannot both appear selected. Reading and Listening review commands open their dedicated review queues.

All five learning modules remain directly available on mobile. The Vocabulary label is shortened to Vocab while retaining its accessible name. More contains current-module study actions, Progress, study settings and Account. It does not repeat the five module entries.

Exam surfaces use the workspace theme variables for cards, inputs, methods, evidence, audio and answer review. Page headings use the workspace typeface; passages retain the reading typeface. Global navigation uses a consistent active color across modules, while Speaking retains its practice accent with a darker fill for readable white button text.

The exam bank searches section titles, paper titles, book numbers and tests. It shows result counts and eight tests per page. Filters reset pagination, pagination preserves filters, and clearing filters preserves intensive mode. Reading filters and badges use Passage. Recent work includes source context. Favorite writes are serialized and failed writes offer an explicit retry of the intended change.

Mobile intensive listening uses horizontal method and sentence strips. Its local heading identifies the selected paper and part rather than repeating the shell title, bringing audio controls into the first screen.

## Verification

- Behavioral coverage: module order, inline child ownership, exclusive study selection, correct review routes, More contents, bank search, pagination/filter behavior and optimistic favorite retry.
- Real browser checks: all five module entry pages at 1440px and 390px, both themes; Reading practice and review queues; Listening bank and intensive controls; sidebar collapse/expand; More and command navigation; 320px intensive layout.
- Browser plugin was unavailable, so these checks use Playwright against an ignored development harness with the real app and authorized exam catalog. Writing and Speaking use original app fixtures; Vocabulary checks cover the empty account view. These are interface checks, not a new production content audit or microphone permission test.
- No database migration, question catalog update or personal record conversion is required.

## Second-round polish

- Listening practice keeps the recording visible on mobile, defaults to Questions, restores position after metadata loads, and offers a retry when playback fails.
- Practice submission now identifies unanswered questions before confirmation; paused practice disables evidence edits and preserves the current position.
- Review pages open on wrong answers when available, keep stimulus context intact, and retain unsaved annotations for an explicit retry after a failed save.
- Intensive listening keeps the active sentence visible on narrow screens. Vocabulary filters follow URL history, clamp invalid pages, and retain failed bulk familiarity changes for retry.

Verification for this round: `npm test -- --maxWorkers=4 --minWorkers=1` (82 files, 624 tests), `npm run build`, and a fresh Playwright smoke run against the real app with the local authorized catalog. The browser run finished with zero console errors or warnings; it does not replace an authenticated production content audit or microphone permission test.
