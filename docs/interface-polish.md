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

## Third-round component polish

Native scrollbars now use narrow, rounded, theme-aware thumbs while retaining dragging and keyboard scrolling. Shared buttons have consistent corners and pressed states. Exam back links use an icon and a visible touch target.

Intensive listening shows all six method steps without horizontal scrolling on mobile (three columns, or two below 360px). The sentence strip retains scrolling and the active sentence stays visible; a direct sentence selector avoids repeated swiping. Playback has a distinct primary button, grouped transport controls and a visible loop state. Waveform colors follow theme changes without restarting audio. Save status shares the compact progress header.

Validation: 82 files / 626 tests passed, followed by focused tests after the final header adjustment; production build passed. Playwright checked 320px, 390px and 1440px in both themes, sentence 1/40 selection, active sentence visibility, playback/pause, loop state, return navigation and all five module entry layouts. No page overflow or browser console errors/warnings were found. The browser checks use the local account harness described above.

## Fifth-round bank and review polish

Recent work prioritises unfinished attempts and identifies their Cambridge book and test, mode, status and marks. Bank pages offer direct review and intensive-practice navigation. Review filters show attempt counts; completed attempts without mistakes can be opened directly from the empty state. Review cards distinguish practice from full mocks and keep the original completion date.

Due intensive reviews identify the book, test, part and sentence. The queue loads full section details only for due sections because catalog metadata intentionally omits timelines. Source loading failures preserve saved review links and provide a retry. Cards, favourite controls and empty states use consistent corners, type and mobile touch targets.

Validation: 82 files / 632 tests passed and the production build passed. Browser checks cover bank and review pages at 320px, 390px and 1440px in both themes, unfinished-first navigation and a due-sentence jump. These use the real app and authorized catalog with local account records, without changing production study data.
