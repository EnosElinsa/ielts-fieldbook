# Current-learning fragment review

The complete 513-item `example-fragment-signal` queue from snapshot `49941667ae91f03fed8efe5e4fccc3776cfbc8b2c3fc99fcfcdeef59f5aaa710` is accounted for in one content release. This is an issue-based sweep across words, rather than a release for each small set of words or their entire rare-sense inventories.

## Content decisions

Of the 513 original records, 511 are lexical meanings. Their 312 valid examples are retained and 199 examples are rewritten. The other two records are source directories for **descend** and **turn**: their identities remain available, their actual children are restored, and the directories cannot become practice questions. Valid phrases, dialogues and short examples are not expanded merely to satisfy a punctuation heuristic.

The release adds 571 source-bound editorial records: the 511 lexical records, 21 separately reviewed existing default targets, 37 restored children, and two source directories. The restored meanings comprise 20 for **descend**, 11 for **turn**, and six for **decade**, including the ordinary ten-year meaning. Nested technical meanings keep their source scope and are not presented as interchangeable everyday readings.

Twenty-four default selections now open on useful actual meanings: academic, allowance, crush, despair, deteriorate, digest, digital, disposal, equation, evolve, gender, kin, liner, litter, loom, regular, scheme, shutter, strand, subsistence, wreath, descend, turn and decade. For example, **digital** opens on computer technology, **regular** on repeated intervals, **scheme** on a plan or programme, and **shutter** on a window panel. Other source meanings remain available.

The teaching material adds collocations and meaning distinctions, 17 contextual distinction questions and 26 explicitly typed reading notes. **Shoot** now distinguishes launching a projectile from firing a weapon; **adverb** includes an actual example sentence. Form references and specialist or sensitive readings are checked against their precise source meanings. No diagrams are added: an optional visual should explain something that text alone leaves unclear.

## Avoid repeated work

`exampleReviewDecisions.json` records 312 explicit `retain-valid-example` decisions. Each binds the work-item identity, entry and sense identities, source fingerprint and entire displayed-content fingerprint to an HTTPS reference and rationale. A decision suppresses only `example-fragment-signal` for that exact variant. Unknown fields, duplicates, stale fingerprints and decisions without the applicable raw signal fail validation.

The quality report exposes both raw and pending signals. There are still 310 raw fragment signals in current learning; the other two retained variants are now reference meanings after changing the defaults for kin and regular. The 312 decisions account for all retained examples without hiding other issues. Changed material invalidates an old decision, and a topic variant sharing a sense ID cannot inherit it. A retain-example decision alone neither reviews the other fields nor changes the dictionary ledger. The new ledger entries above come from the separate source-bound editorial review.

Source matching and candidate checks remain structural evidence. There is no model API authoring service or automated semantic approval. Full-candidate and focused-candidate validation leave zero candidates automatically ready for publication.

## Compatibility

Previous corrections, defaults, source evidence, ledger rows, diagrams and topic rows remain intact. New defaults and one technology-topic override are appended. The turn topic selects its restored rotation meaning, so it remains available for dictation instead of selecting the old source directory.

Historical public topic baselines include overridden rows. This lets current public teaching text update while recognising older public versions and preserving intentional personal edits. The resource reversal baseline removes only the new topic override when reconstructing older releases. Existing source identities, personal content, frozen sessions, pronunciation bindings and previously published resource bytes are retained.

The growing historical resource corpus also exposed a build bottleneck. Resource generation now retains UTF-8 buffers and decodes individual files on demand; development responses and Vite output use the same bytes directly. A local diagnostic build of the 3,990-file, approximately 980 MiB corpus completed within a 4 GiB heap limit. At the end of that diagnostic, JavaScript heap usage was approximately 82 MiB, compared with 4,455 MiB in the prior string-based build with an 8 GiB limit. These are end-of-run measurements, not peak-memory claims; retained bytes still consume process memory. The existing resource tests check historical URLs, JSON bytes and content hashes. Manifest lookup in those tests now reads manifest keys first instead of decoding the complete corpus into an array.

## Current scope and follow-up

The dictionary now contains **52,059 records: 4,204 reviewed and 47,855 pending**. All 7,021 catalogue words have a resolved learning meaning. The 9,089 current learning variants have displayed examples or typed reading notes; 3,194 have collocations or reading cues, 1,051 have distinction notes, and 304 support distinction questions. Those availability counts do not imply semantic approval of every variant.

The current learning fragment queue has zero pending items. Missing, truncated and archaic current-learning example signals also remain zero. One current-learning duplicate-gloss signal for **latest** still needs source-identity investigation. Missing collocations and distinctions are enrichment opportunities, not mandatory fields for every source record. The complete 47,855-record dictionary review remains open.

The next current-learning collocation inventory has been exported in full: 5,895 exact variants in six processing packages, all still requiring authoring and review. Investigate the remaining duplicate-gloss issue, then prioritise useful meaning-specific constructions, resolve uncertain source matches separately, and accumulate compatible changes before the next release. Package boundaries do not create release boundaries. Do not fabricate comparisons, questions or diagrams merely to improve coverage totals. Use the [bulk workflow](vocabulary-bulk-workflow.md) and its exact-content decisions to avoid redoing resolved work.

## Verification

The serial local pipeline passes 8,738 tests across 212 files, with one conditional external-archive test skipped. Type checks, production build, dictionary/quality audits, identity/SQL checks and bundle budgets pass. Independently, all 3,566 files from the preceding release retain their SHA-256 hashes; the new build adds 424 files. Earlier corrections, defaults, source evidence, editorial records, diagrams and topic rows remain exact prefixes, and pronunciation data is unchanged.

Rendered checks cover 157 states at 1440px light/dark, 390px dark and 320px light. All 24 changed defaults, 37 restored meanings and 17 new distinction tasks are checked on desktop; other layouts exercise representative meanings and practice. The checks include 26 distinction submission/return journeys, five sentence-gap submissions, source-directory practice exclusion and four turn technology-context dictation setups. Synthetic accounts and intercepted writes protect live account data. No page/console errors, failed network responses or horizontal overflow are observed. Browser plugin not available; the existing Playwright runtime is used. These rendered checks establish delivery and interaction behavior, separately from semantic content review.
