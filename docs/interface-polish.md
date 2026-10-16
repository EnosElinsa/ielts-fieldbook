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

## Global layout and loading consistency — October 13

Shared responsive toolbars give search the remaining desktop space and put filters into readable mobile rows. Exam cards align their primary practice action and secondary intensive action at the bottom; narrow cards stack actions. All shared buttons retain visible keyboard focus and mobile touch targets. Reading source height and submission clearance prevent the footer from covering answers.

`AsyncState` provides page/panel skeletons, decorative card skeletons, inline loading, and consistent empty/error/retry containers. It is used for route loading, exam catalog/material/images/audio, intensive listening, vocabulary catalogs/dictionary/pronunciation and account recordings. Slow requests offer a real retry after ten seconds, expired replies do not replace newer dictionary/media results, and reduced-motion disables placeholder animation. Catalog reads time out without retaining a poisoned promise.

Main-module navigation resumes each account's latest URL, filters, history context and window scroll. Writing and Speaking desks additionally restore selected tasks from the actual history entry; Reading retains internal passage scroll. Ordinary exam practice pauses on departure and resumes its answers; full-mock deadlines continue. Recording callbacks cannot open a finished modal after leaving or changing account.

Vocabulary learning navigation updates immediately. Account-scoped device drafts precede an 800 ms background save, one request runs at a time, and only the latest snapshot can clear recovery. Failed saves keep the latest position and expose Retry without disabling navigation. Reviewed sense-bound images are used where available, with selected food illustrations and a meaning/context map fallback. Third-party dictionary images were not scraped or hotlinked. Original-source action links are removed across modules; source attribution and necessary image credits remain.

Validation: all 96 suites / 769 tests pass; TypeScript and production build pass. Playwright checked 320, 390 and 1440px in light and dark themes, filtering, equal card actions, last-answer/footer clearance, loading/failure/retry/reduced-motion, rapid navigation with delayed/failed save, module recovery, and passage-panel scroll recovery. Fourteen additional navigation checks cover learning → assessment → results → details → return, history filters, reload, browser Back/Forward, source switching, chapter/scroll restoration and keyboard operation. No horizontal overflow or browser errors were observed in these checks.

These checks use the real application with an isolated local account harness and read-only authorized catalogs. Network responses, audio and device speech are test substitutes; they do not verify a production account, microphone permissions or original media playback quality. Same-path desk history is covered by the hook regression test (the local writing fixture offers only one question). Existing large main-bundle warning remains; no broad dependency restructuring or data/schema/catalog rewrite is part of this release.

## Vocabulary learning card clarity — October 13

Learning cards lead with IPA, explicit UK/US listening controls, the learning definition, example and reliable combinations. Audio metadata and meaning provenance remain available in closed, word-specific disclosures. Theme recommendations are distinguished from interpretations checked against the source; unknown recording accents remain unverified.

Older saved senses that omit optional dictionary metadata can receive the existing reviewed definition and example. Explicitly cleared fields and personal edits remain protected. This is a display-resolution fix, without rewriting stored history or the production catalog.

The decorative definition/context map is removed. Suitable reviewed photos or sense-guarded concrete illustrations remain, including a bowl-of-mixture illustration for the noun “paste”; unsupported meanings use the full card width. Failed photos retain Retry. Missing examples explain the next action without inventing content.

Validation: 96 suites / 774 tests, TypeScript and production build passed. Eight browser checks cover 320/390/1440px in both themes, a historical paste snapshot, explicit UK/US playback selection, disclosure reset, details return and a card without artwork. No horizontal overflow or browser errors were observed. These use the isolated local account and substituted speech/audio described above, not an authenticated production account.

## Vocabulary action integrity — October 13

Already-viewed words show a disabled Viewed action; Previous/Next remain usable. Choosing the current batch does not reset its position or write progress. The sync queue compares viewed IDs and position, ignoring timestamp-only changes while pending and after acknowledgment. Plain navigation uses a 2.5-second debounce; new viewed progress uses 800 ms. Device recovery is immediate, departure flushes pending progress, and older responses respect a newer debounce. Pending device progress, actual syncing and server acknowledgment have distinct messages; failures retain Retry.

Learning assessment links and group practice menus share task availability, source-ordered queues and mode names, also used in settings and results. Modes without usable tasks are omitted; legacy empty-mode links select an available mode with an explanation. Counts describe actual launchable questions, including specialist subsets. Audio loop is identified as a listening activity. Use in context retains sentence submission and self-review, explicitly distinguished from assessed usage evidence.

The Audio options & sources disclosure and its explanatory text are removed. UK/US controls remain; playback errors retain retry and explicit alternative recordings when needed, including a Stop action during alternative playback.

Validation: 96 suites / 781 tests, TypeScript and production build passed, covering idempotent marking, current-batch clicks, debounce and older responses, failed saves, recovery, account boundaries, unavailable modes, group-specific notices and actual assessment sizes. Thirteen browser checks use the same isolated local account harness, including 320/390/1440px in both themes, all four offered assessment launches, dictation submission and return. Production account data and real speech/audio quality are not validated by that harness.

## Production workflow completion - October 14

Writing and Speaking timers now follow elapsed time while learners edit or autosave, pause on departure, and remain scoped to the account/question. Both banks display twelve questions per page, preserve filters on page changes and browser return, and provide a clear-filter action for empty results. Speaking uses separate mobile Prompt/Practice panels, shows the current prompt beside the transcript, and collapses preparation notes when answering. Workspace and Part tabs support arrow, Home and End keys with one tab stop.

Feedback file and pasted-text imports share the awaited importer. Failed imports keep the text and filename for retry; busy dialogs prevent duplicate submissions and accidental dismissal. The global save error offers a real retry of the latest snapshot. Continuing from review, feedback, history or the desk uses one guarded draft entry: confirm meaningful replacement, preserve mode/Part/source/errors/structured writing sections, and save before reporting success or navigating. Recording and deferred vocabulary departure guards run before draft mutation. Delayed feedback imports cannot write after an account switch. Feedback pages return to the correct skill, link previous feedback and offer a request for an unmarked rewrite/retake. Filtered-empty review distinguishes no matches from no attempts.

New/default accounts can set their study time, weekdays, skills and optional band/date directly on Today. Completion is durable; a failed save keeps the chosen values and Retry. Existing learning and customized accounts retain the normal Today view. Setup uses the same profile and plan save as Settings.

Progress covers the selected seven, thirty, ninety days or all history instead of a fixed four weeks. It uses local calendar-day bounds, retains recent feedback attached to an older attempt, and displays unclassified comparable task/Part feedback. Vocabulary due counts share the actual learned-word review queue; ranged activity deduplicates a review's dimension evidence, excludes future results, and labels all-time current totals separately. Undated imports remain explicitly undated in all-time history.

Search opens immediately with loading/failure/retry inside the dialog; it remains closable while account modules load and supports combobox keyboard selection and visible active results. Microphone initialization distinguishes permission/device/startup failures, locks pending requests, releases failed streams and keeps the previous recording if re-recording cannot start. Writing toasts clear the sticky mobile draft actions. Route errors retain workspace navigation and provide retry/reload.

The vocabulary identity runtime resource is generated from the full authoring mapping and verified against all 9,205 memberships. The shared preferences asset fell from 1,268,711 to 349,581 bytes. Final login JavaScript is 185,405 bytes gzip across three assets; the largest JavaScript file is 385,497 bytes. The build checks generated-data freshness; regression budgets limit login gzip to 300 KiB and an individual JS file to 500 KiB.

Validation: 116 test files, 975 tests passed and one skipped; TypeScript, production build, bundle budgets and `git diff --check` passed. Two Playwright harnesses passed twelve workflows against the final production preview, with no runtime errors. Saved screenshots were opened and inspected at 1440/390/320px in light/dark themes. Checks include setup save outage/retry/reload, feedback import recovery, rewrite links, draft replacement cancel/accept, range/source links, search, tab keys, microphone denial, bank pagination/return, due counts and lazy-page failure/reload. Mobile module targets meet 44x44 at 320px, and draft toasts do not obscure the save/finish actions.

These checks use synthetic accounts, intercepted cloud saves, test audio and injected microphone denial. Reassessment export, recorder initialization and failed re-record recovery have component coverage; real marker feedback, microphone hardware, original audio quality, large-account cloud persistence and deployment require their own environment acceptance. No production account records, migrations or deployment were changed in this round. Current performance measurements and their limits are recorded in `docs/performance-results.md`.

## First-load recovery and continued interface checks — October 16

Initial JavaScript or stylesheet download failures can reload once per build during the first thirty seconds, before user interaction and while the original URL is unchanged. Blocked session storage, offline status and later editing leave recovery explicit. Persistent failures cannot create a reload loop. Download errors explain reconnection, use a fresh document for recovery and preserve query/hash context. Ordinary page errors retain in-place retry. Recovery actions use a wrapping flex row and 44px targets. Lazy dialog failures remain closable within the workspace instead of replacing the whole application.

HTML routes explicitly revalidate while hashed assets retain immutable caching. Account and Backup omit unrelated global save controls when clean; pending settings from other categories remain saveable. Account confirmation has a usable mobile target, stacked account metrics lose desktop dividers, and the sidebar activity link occupies a separate row.

Validation: `npm test -- --maxWorkers=2 --testTimeout=15000` passed 144 files / 1,295 tests with one conditional skip; TypeScript, production build, bundle budgets and `git diff --check` passed. A generated-resource hashing test exceeded its default five-second limit during concurrent browser inspection; its isolated rerun and the final suite passed. Browser checks covered 24 routes in four viewport/theme combinations, six download-recovery flows, four account/settings flows and dialog failure/dismissal. Checks found no horizontal overflow, broken page images or unexpected console errors in those route combinations. Account/settings checks include saving a cross-category draft and last-action clearance above mobile navigation.

Production inspection found all 90 current JS/CSS assets available with matching contents. Injected connection resets reproduced the reported error, but the learner's persistent first-load network failure was not reproduced here. The browser account and saves are synthetic; these checks do not establish that learner's network/cache cause or verify a real cloud account. This round changes no account records or database schema and has not been deployed.

Follow-up shortcut polish gives all four vocabulary overview links a leading icon, aligned label and trailing arrow. Rows retain ordinary links while using consistent text, visited, hover and keyboard-focus styles; mobile keeps a single column. The sidebar activity link has a separate row, directional icon and visible focus. Forty-four relevant tests, the production build and bundle budgets pass. Playwright checked 320/390/1440px in light/dark combinations, keyboard entry and return for all four destinations, and the sidebar progress link, with no overflow or console errors.

## Vocabulary meaning, example and illustration clarity — October 16

Word details put the definition and example first, with one collapsed Meaning source disclosure. Topic recommendations use short topic-specific text. A historical or explicitly selected dictionary sense keeps its identity and has a direct View group meaning link that preserves the return route. Edited content is identified as saved notes; a same-ID group recommendation can be compared inside the source disclosure. Editorial selection rationale no longer appears as an English usage rule. Dictionary meanings without examples omit repetitive pending placeholders.

An empty saved example can display a separately labelled Learning example only when a public baseline has the same sense ID, cleaned definition and part of speech. Its attribution joins the existing sources collection. Stored notes, intentional empty values, task content and learning history remain unchanged. A changed definition cannot borrow an example from another meaning. Fresh default and explicit botanical pea meanings both already resolve examples; the original learner's saved account state was not read, so the exact cause of that screenshot's missing example remains unconfirmed.

Details and learning cards now share the same sense-aware visuals and image recovery. Additional original SVGs explain foods, utensils, cooking, changes of state and changes in quantity. Rules check the selected meaning and part of speech: a skin boil, road fork, figurative carrot, company apple, reproductive ovum or rice plant cannot inherit an unrelated food illustration. Current runtime coverage rises from 12 to 54 distinct words; Food and health rises from 9 to 36 of 173 chapter entries. This is targeted illustration coverage, not a claim that all 7,021 words have artwork. Narrow-screen vocabulary tabs also reveal their focused link while keeping document scroll unchanged.

Validation: the full suite passes 144 files / 1,315 tests with one conditional skip. Production build, identity/SQL checks, bundle budgets and whitespace checks pass. A runtime scan resolves nonempty display examples for all 9,205 default group positions across 7,021 entries; this structural scan does not establish the quality of every example or cover all supplementary dictionary meanings. With the Browser plugin unavailable, bundled Playwright/Chrome checked 42 states at 1440px light/dark, 390px dark and 320px light against the production preview. Checks include page identity, nonempty content, framework overlays, console health, screenshots, dictionary-to-group switching, preserved return routes, learning-card navigation/details/return, loaded photos and attribution, keyboard tabs, and unchanged personal fixtures. Intentional horizontal tab scrolling is checked separately from document overflow. Cloud account data and saves are intercepted synthetic fixtures; no production account records or schema changes are required.
