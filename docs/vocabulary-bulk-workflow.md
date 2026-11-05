# Bulk vocabulary content workflow

This workflow replaces choosing a few words and checking every rare meaning before publishing again. It preserves the complete dictionary objective, every source identity, all earlier editorial reviews and the distinction between machine checks and semantic review.

## Execution priority — 2026-10-20

Use three work lanes: shared mechanical fixes across the corpus; source-backed authoring across current learning meanings; and separate semantic investigation for ambiguous, historical or specialist readings. Start with a complete issue queue, using 200–1,000 items per authoring package where the evidence supports that size. Package boundaries are not release boundaries. Finish a coherent issue class and accumulate compatible changes before one release, rather than repeating a full release for a few words. The complete dictionary backlog stays open, but it does not gate useful current-learning repairs.

Require only the fields needed for the repair. Examples, meaning selection and pronunciation matching take priority; comparisons, cloze questions and diagrams are optional teaching material with their own evidence requirements. Do not multiply arbitrary questions or two-box diagrams to raise coverage totals. Exact source matching, field checks and duplicate detection can run over the complete corpus. Authored teaching content still needs semantic review; model-generated drafts and automated semantic approval are not implemented.

Keep example type and learning priority independent. Author helpers must not assign Specialist from `reading-note`, or Historical from a quotation's year. Inspect the exact meaning and its source labels or subject context; retain unassigned priority when evidence is insufficient. Independent review must record the reason for each non-null classification and distinguish retracting an unsupported classification from adding a replacement classification. Preserve original frozen decisions and record metadata amendments separately,with no new full-source-review credit.

Scope rendered verification to risk. Validate changed default selections, restored meaning groups, exact practice identities and pronunciation/session behavior. Cover representative content and narrow-screen boundaries; unchanged components do not require replaying every edited sentence at every viewport. Keep full data/source/identity/resource validation and final CI, while reusing unchanged artifact evidence. Report the actual scope and remaining gaps rather than equating browser-state counts with linguistic quality. Record the next queue and acceptance criteria in the same release so follow-up improvements do not disappear into a roadmap.

The [fragment review](vocabulary-review-log.md#vocabulary-fragment-learning-review) now accounts for the complete 513-item current-learning queue from snapshot `49941667ae91f03fed8efe5e4fccc3776cfbc8b2c3fc99fcfcdeef59f5aaa710`: 312 valid short examples are retained with exact-content decisions, 199 lexical examples are rewritten and two source directories are repaired through real children. This adds 571 source-bound editorial reviews, 37 restored meanings and 24 corrected defaults. Pending current-learning fragment signals reach zero; 310 raw heuristic signals remain visible. The remaining duplicate-gloss signal for latest needs source-identity investigation, followed by the full current-learning collocation inventory. The complete pending dictionary inventory remains open.

## Scan once across the corpus

Run `npm run vocabulary:quality` from the repository root. The command reads public catalogue data, every indexed dictionary, restored meanings and the existing editorial ledger. It runs the existing editorial audit before using its review status. It then resolves every default and wordbook membership with the application's actual learning-context resolver, including additional meanings in multiple-meaning lessons. Exact public fallback examples and current sentence-gap/distinction task availability are included.

The compact committed output is [vocabulary-quality-report.md](vocabulary-quality-report.md). The complete generated work queue is `local/audits/vocabulary-quality.json`, which is ignored by Git. The report separates missing displayed examples, phrase/quotation review signals, missing collocations, missing distinctions, duplicate-gloss candidates and exercise coverage. It does not infer a word's frequency from group reuse or classify every unlabelled source meaning as everyday English.

Different group teaching remains separate even when it shares a source sense ID. Work items retain their original source fingerprint, exact displayed-content fingerprint, text, entry/sense identities and all applicable scopes. A source entry and a different teaching version cannot inherit each other's editorial approval. Proper-name case differences and distinct etymologies can produce similar glosses: duplicate signals must be inspected, not automatically deleted.

## Collect and prepare an entire issue queue

The normal work unit is now the entire matching issue queue. Source collection and candidate preparation no longer require manually exporting successive 200/1,000-item offsets. The existing bounded commands below remain useful for targeted investigation.

```powershell
npm run vocabulary:quality
npm run vocabulary:sources -- --work local/audits/vocabulary-quality.json --scope learning --issue missing-collocations --cache local/vocabulary-work/revision-cache --output local/vocabulary-work/sources.json
npm run vocabulary:prepare -- --all --scope learning --issue missing-collocations --sources local/vocabulary-work/sources.json --fields collocations,distinctions --output local/vocabulary-work/collocations-job
```

The collector uses sequential requests of 20 case-sensitive titles, retries only unresolved titles and persists successful replies immediately. Repeating the same command reuses valid cached pages and explicit missing-page results. `--seed responses.json` imports existing MediaWiki responses; imported evidence is retained in the cache after collection. `--refresh-missing` checks absent pages again without refetching valid revisions. `--batch-size` accepts 1–50 source titles. Missing pages and failed requests are separate report fields: incomplete requests set a nonzero exit status but retain successful evidence. Conflicting cached revisions remain explicit rather than silently choosing the last or highest revision. This command collects source evidence only and never edits the dictionary or grants review status.

Whole-queue preparation checks the runtime snapshot once, shares a source/page index and includes every matching variant, including the final partial package. `--batch-size` accepts 1–1,000 authoring items. Output must be a new or empty directory inside ignored `local/`, so rerunning cannot overwrite authored work. The directory contains:

- `manifest.json`: source snapshot, exact total, package counts and route counts.
- `prepared-*.json`: complete source context and fingerprint-bound focused drafts.
- `authoring.jsonl`: current and original meanings, existing teaching fields, register, metadata, scopes, source evidence and requested changes for model/reviewer input.
- `routes.json`: separate source-resolution, authoring and candidate-review inventories.
- `AUTHORING.md`: output format, abstention handling and semantic review requirements.

Unindexed teaching meanings, changed teaching contexts, absent pages, revision conflicts, ambiguous matches, gloss mismatches and source organisation headings have distinct `sourceIssue` codes. Known sense identifiers, single-line references and simple first-attestation dates may be omitted only from gloss comparison; the complete original source line remains in the evidence. Unknown/nested templates, changed lexical wording and distinct meanings stay unresolved. Prepositional phrases retain their source POS. A source heading cannot provide a lexical example from its overview or borrow one from a child.

The 2026-10-20 run covers all **5,895** current-learning collocation opportunities at snapshot `3835105a2503da4df92215f7a676ad1a95932567c5d1af18388ad42f491b8334`. Collection resolves 4,733 existing pages and 1,162 absent pages, with zero failed requests or conflicting revisions. A fresh resume reuses all 5,895 title results. Preparation yields six processing packages, 3,742 exact source matches, 2,153 source-resolution items and 1,802 items with direct source-example suggestions. Those suggestions do not complete the requested collocation/distinction fields: candidate-review and publication-ready counts both remain zero. Earlier strict preparation had 2,927 exact matches; removing nonlexical metadata from comparison eliminates 815 unnecessary manual source matches while keeping heading and semantic safeguards.

The first 250 inventory decisions have now produced 248 integrated field repairs, plus source-heading repairs and the separately reviewed recency selection for latest. Indexed field repairs are scoped to exact public definition/example/POS text so unrelated course variants sharing a source ID are preserved. Five unique core phrases also retain their original core teaching fields. These partial repairs do not count as all-field dictionary reviews.

The same queue identifies seven source headings: metal, feel, hit, sink, fall, mark and tag. Their 49 genuine child lines are registered as separate source-bound meanings, including 13 typed reading notes. Seven heading corrections retain the raw references, while eight defaults and twelve topic selections choose lexical teaching, including the real recency adjective of latest. The mark course retains both its visible-sign and examination-score meanings. These changes add 58 full ledger reviews: 49 children, seven headings and two distinct latest senses. The dictionary now contains 52,108 records, with 4,262 reviewed and 47,846 pending. Existing diagrams and distinction tasks are retained; no diagram or exercise quota is introduced.

This implements reusable evidence collection, whole-queue authoring input and exception routing. It does not call a model API or automatically generate/approve teaching content. Use the returned drafts as input for bulk authoring; do not count an empty generated package, a source match or a model judgment as a completed editorial review. Accumulate the full issue-class update before release rather than deploying these six processing packages separately.

## Record valid examples once

`src/domain/vocabulary/exampleReviewDecisions.json` stores explicit `retain-valid-example` decisions for exact source and displayed-content fingerprints. Each receipt requires its work-item/entry/sense identities, an HTTPS reference and a rationale. The report exposes `rawSignals`, `resolvedSignals`, `signals` and `rawByIssue`, so accepted short examples remain auditable while leaving the pending fragment queue. No other issue can be suppressed this way. A changed source or displayed variant makes an old decision fail; a same-ID teaching variant does not inherit it. Receipts alone do not add editorial reviews or approve the other teaching fields.

## Produce bounded work packages by issue

For the visible example backlog:

```powershell
npm run vocabulary:quality -- --export --scope learning --issue missing-example --limit 200 --offset 0 --output local/vocabulary-work/examples-001.json
```

For a larger set of collocation candidates:

```powershell
npm run vocabulary:quality -- --export --scope learning --issue missing-collocations --limit 200 --offset 0 --output local/vocabulary-work/collocations-001.json
```

Use `--scope reference` for meanings not currently selected for default/group learning, or `--scope all` for the complete queue. Omit `--issue` to export all work of that scope. Limits are 1–1000 items. An offset is deterministic for the same source snapshot; regenerate and restart the selection after a content change. Work-item fingerprints reject candidates prepared against changed material.

Each exported item has `status: candidate-required`. It is an authoring task, not generated learning content or an approved review. Package size is a processing limit, not a promise that every item can be safely completed at that scale. Semantic uncertainty, unresolved technical terminology and source-specific contexts require focused follow-up. Existing reviewed content is useful input, not automatic permission to replace it.

## Prepare source-backed drafts together

`npm run vocabulary:prepare` joins an exported package to saved MediaWiki query/revisions responses. The source file is either one response or an array of responses from the public Wiktionary API with `prop=revisions`, `rvprop=ids|timestamp|content` and `rvslots=main`. Keep the page's case-sensitive title, revision ID and original wikitext. The preparer is offline; obtaining those public responses is a separate collection step.

```powershell
npm run vocabulary:quality -- --export --scope learning --issue truncated-example --limit 1000 --output local/vocabulary-work/truncated-examples.json
npm run vocabulary:prepare -- --work local/vocabulary-work/truncated-examples.json --sources local/vocabulary-work/source-responses.json --output local/vocabulary-work/prepared.json
```

The command checks the current runtime quality snapshot before reading the package, then rejects stale work identities or source/display hashes. Regenerate the full report with `npm run vocabulary:quality` if its snapshot is stale. The optional `--report` selects a full report path; its snapshot must still match the freshly checked current report. Output must stay inside ignored `local/`.

An exact original gloss/POS and case-sensitive page match produces a revision-linked draft. Only direct `ux`, `uxi` or `usex` English usage examples attached to that definition become suggestions. Nested child/adjacent meanings, quotations, unsupported templates, sentence fragments, archaic wording and truncation markers cannot seed an example automatically. Existing collocations and comparisons are retained; missing fields stay explicit. Duplicate-gloss ambiguity, changed teaching definitions and unsupported source formatting become manual-source-match items with source context. Even exact matching is evidence for review, not linguistic approval.

Edit the nested `draft` objects into candidates and export those objects as the array/JSONL described below. Inspect `missingFields`, source context and all example suggestions first. The preparation wrapper is evidence, not a candidate submission. The command never writes the source dictionaries, teaching supplements or editorial ledger. All prepared items still require semantic review and zero are marked ready for publication.

The first real run prepared 199 current truncation signals in one operation: 131 exact source matches, 68 manual matches and four records with direct source-example suggestions. The [subsequent authored review](vocabulary-review-log.md#vocabulary-truncated-learning-review) improves 98 exact meanings across words; it does not pretend the other cases were repaired automatically.

The [current-learning sweep](vocabulary-review-log.md#vocabulary-remaining-learning-review) handles the remaining 101 signals together, including the 68 manual source matches. It adds 127 reviews through actual lexical repairs, restored children and corrected defaults. A directory is repaired by restoring and selecting its real meanings, not by disguising its old example as a note. Once the current snapshot changes, regenerate queues; retain earlier packages only as evidence. Continue by issue type across the corpus and accumulate consistent content before the full release pipeline. Do not resume choosing a few words' complete rare-sense inventories as the normal unit of work.

## Validate candidates together

For an issue-specific repair, use the [focused candidate workflow](vocabulary-review-log.md#vocabulary-focused-candidates). `vocabulary:prepare -- --fields example` prepares only an example change; omitted definitions, collocations, distinctions, tasks and metadata remain in the current snapshot. The candidate checker produces an attributed, scoped merge preview for review, without publishing it. This avoids inventing extra teaching fields just to repair one field. A changed definition or part of speech requires review of the retained teaching fields as well.

The original complete-candidate format remains available. Supply a JSON array or `.jsonl`/`.ndjson` of complete candidate objects containing:

- `workItemId`, `sourceHash` and `displayHash` copied from the exported item. `sourceHash` is null for a teaching meaning without an indexed source sense.
- Nonblank `definition` and `example`; nonempty, nonrepeated `collocations` and `distinctions` arrays; an HTTPS `referenceUrl`.
- Optional `pos`, `usage`, `register`, `exampleKind: reading-note`, or authored `learningPriority`.
- An optional `distinctionTask` with `prompt` containing `_____`, distinct `options`, an included `answer`, and an `explanation`.

```powershell
npm run vocabulary:quality -- --candidates local/vocabulary-work/candidates.jsonl --output local/vocabulary-work/validation.json
```

The checker rejects stale source/display fingerprints, repeated work identities, unknown fields, blank learning fields and invalid exercise structures. Focused changes additionally reject empty or ineffective patches and cannot mix full-format fields with `changes`. Approval fields such as `reviewedAreas` are rejected. Even a structurally valid candidate returns **zero ready for publication** and requires semantic review. It never edits teaching JSON, source records or the editorial ledger. Reference URLs are recorded and structurally checked; the checker does not fetch or substantiate their claims.

Semantic review must confirm that the example, collocations, distinctions, exercise answer and any technical explanation fit the exact meaning. Ambiguous interchangeable options cannot become a uniquely graded distinction question. Reading notes remain explicitly typed; historical or specialist references do not need forced cloze tasks or diagrams. Visuals are selected for information they communicate, rather than required per sense.

## Integrate and release verified content

Integrate reviewed candidates into the existing attributed teaching/supplement system with source hashes and public reversal baselines. Preserve intentional personal edits, source-specific group lessons, original IDs, all frozen sessions and previously published resource bytes. Restored meanings still need the existing independent source evidence; a package cannot bypass that requirement.

Run targeted content checks during authoring, then accumulate an internally consistent content release before the full required test/build/identity/resource and browser checks. Deploy using the existing Cloudflare Git integration. Do not claim a candidate package, a structural check or this tooling release increased editorial coverage. Track both current learning-content coverage and the complete outstanding dictionary ledger.

`npm run vocabulary:quality -- --check` recomputes the full report and fails if the committed compact report is stale. CI runs this alongside the existing dictionary audit. No model API, API key, paid service or new dependency is required by these commands. Source-backed draft assembly is implemented; model-generated teaching content and semantic review are not automated.

<a id="vocabulary-dictionary-plan"></a>

## Complete dictionary learning-content review

**Goal:** Continue improving high-frequency polysemous words with examples, collocations, distinctions and accurate diagrams, and review every additional dictionary sense in successive batches.

**Scope:** The released dictionary index and its actual sense records define the full scope. Catalogue defaults are a subset. Nonempty fields, automated checks and a passing build do not prove linguistic review.

**Architecture:** Keep original dictionary records and stable sense IDs. Apply attributed editorial supplements through the existing readiness resolver, including when other dictionary meanings are loaded. Record reviewed identities against their original content hashes. Preserve personal edits, frozen tasks and all published resource URLs.

**Validation:** TypeScript/domain/component tests; the independent full-dictionary audit; the resource-retention comparison; production build, identity/SQL and bundle checks; desktop and mobile learning/selection/practice browser checks using synthetic accounts.

### Work sequence

- [x] Inventory every indexed term and sense; report missing examples, empty learning fields and automatic content-risk signals separately from editorial review.
- [x] Apply same-sense supplements to additional dictionary meanings. Support reviewed collocations, distinction notes and sense-specific distinction exercises while preserving intentional edits.
- [x] Review 65 common senses in the first high-frequency batch: current, interest, rate, capital, bank and charge. Record exactly which senses were examined, retain the other 82 senses of these six terms for later verification, and never transfer an example between meanings.
- [x] Bind original diagrams to exact entry ID, sense ID, definition and part of speech; test wrong meanings and edited definitions.
- [x] Verify selection, saving, practice, attribution and return navigation with synthetic records. Commit and deploy a verified batch under the existing release authorization.
- [x] Review all 50 indexed senses of account, state, matter and value; give historical constructions explicit reading guidance and preserve complete earlier public snapshots for saved-content updates. Add eight contextual exercises and six exact diagrams.
- [x] Add search across displayed definitions, examples, usage and learning notes, combined with part-of-speech filtering, stable meaning numbers and an explicit empty/reset state.
- [x] Review 82 preserved senses of field, form, issue and subject. Restore 31 independently selectable child meanings with exact revision/source-line evidence; retain the two issue senses without reliable use examples as pending. Add ten exercises and six diagrams, correct future Kaikki imports, preserve distinct source IDs through caching, and retain all previously released resource bytes.
- [x] Review all 125 preserved senses of condition, scale, range and ground, and restore three condition submeanings with revision-bound evidence. Add 15 contextual exercises and eight exact diagrams. Allow diagram previews while browsing dictionary meanings without saving learning records.
- [x] Complete the other 82 preserved senses of current, interest, rate, capital, bank and charge. Restore 13 missing child meanings, including electricity supply, emphatic capital letters and battery charging; add 16 contextual exercises and seven diagrams. Keep older, regional, medical and proper-name reading guidance explicit and preserve every prior resource revision.
- [x] Review all 69 preserved senses of affect, effect, raise, rise and practice, and restore 42 source child meanings. Add 23 contextual exercises and nine exact diagram bindings. Mark the two spelling-error records as references, preserve their source identity and exclude them from new practice without changing frozen sessions or independent personal meanings.
- [x] Review 71 of the 72 preserved senses of mean, principal, principle, patient, adapt and adopt, and restore 13 source child meanings. Add 24 contextual exercises and seven exact diagrams. Retain mean's obsolete common/general adjective as pending because a use example distinct from its humble-origin sense has not been verified. Keep principle's misspelling record as a reference; distinguish historical principal meaning rule from a current spelling error.
- [x] Review 71 of 73 preserved senses of object, conduct, record, content and contract, and restore five source child meanings. Add 28 contextual exercises and eight exact diagrams. Explicitly label 21 reading explanations and exclude their exact public text from new sentence-gap exercises. Keep record's obsolete repeat/practise sense and content's obsolete contained adjective pending until independent use evidence is verified.
- [x] Review all 130 preserved records of check, point, draw and sound and restore 201 independently bound submeanings. Add 86 distinction exercises, 20 diagram bindings and 191 typed reading explanations. Keep draw's six source directories as references and start new learners with its concrete picture-making meaning; preserve personal selections and all released resources.
- [x] Review all 102 preserved records of course, order, term and break and restore 98 independently bound submeanings. Add 73 distinction exercises, 20 diagrams and 38 typed reading explanations. Start course with lessons and term with a lexical expression. Correct gestational dating and empirical reaction-order guidance; retain valid historical spellings and independently attested Scottish rent-payment usage.
- [x] Review all 132 preserved records of change, clear, date and spring and restore 28 independently bound submeanings. Add 64 distinction exercises, 18 diagrams and 65 typed reading explanations. Correct CSS clearance, numeric-date interpretation, spring-tide range and bell-ringing row counts; retain valid seasonal and dialect forms. Distinguish loading, failed lookup and unavailable practice in the launch interface.
- [x] Review all 113 preserved records of support, post, figure and note and restore 25 independently bound submeanings. Add 49 distinction exercises, 19 diagrams and 72 typed reading explanations, including descriptions of three source directories. Start post with an appointed job and note with a concrete reminder. Separate numerals from amounts, evidence from compatibility, and written notation from sound. Preserve the distinct POST and Post source revisions and existing postal-service senses without duplicate restoration. Simplify single-word practice while retaining active scheduling filters and saved batch preferences.
- [x] Review all 46 preserved records of approach, benefit, available and claim and restore two independent approach submeanings. Add 30 distinction exercises, 18 diagrams and 17 typed reading explanations. Start approach with a method and claim with an assertion. Distinguish finite limits from unboundedness, an asserted right from an established one, and benefit recipients from sources. Keep existing meanings visible when a practice mode or schedule yields no cards; offer exact-meaning recall for an unsupported mode without changing filters.
- [x] Review all 33 preserved records of effective, efficient, sensible and sensitive. Add 16 distinction exercises, 14 diagrams and 17 typed reading explanations. Distinguish intended results from resource use, actual available strength from a nominal roster, judgement from responsiveness, and emotional vulnerability from consideration for others. Correct the identity exception in effective group actions and separate instrument sensitivity from measurement accuracy. Start sensitive with its emotional meaning while retaining the sensory and historical records.
- [ ] Continue full review through the [bulk workflow](vocabulary-bulk-workflow.md), selecting issue-based work across words instead of completing a few words' rare meanings before each release. The [quality report](vocabulary-quality-report.md) covers every source record and current learning context. Specialised, historical and proper-name senses remain in the complete outstanding queue; structural candidate checks never mark them reviewed. The first visible-example sweep resolves 30 currently missing examples, with 31 new exact reviews, while the full ledger remains incomplete.
- [ ] Audit completion against every indexed sense and all four requested learning-content areas. The goal stays active while any required identity or content is pending or unverified.

The first batch was published in `9baf01e` and passed 50 production browser states. Subsequent releases require their own local and production verification. The complete pending queue is recorded in the dictionary audit; this checklist does not declare the full dictionary finished.

### Completion evidence

The support/post/figure/note batch checks function support against [MathWorld](https://mathworld.wolfram.com/Support.html) and the alternative nonzero-set/closure convention against [Support (mathematics)](https://en.wikipedia.org/wiki/Support_(mathematics)). Secondary checks of [module support](https://en.wikipedia.org/wiki/Support_of_a_module), [fuzzy sets](https://en.wikipedia.org/wiki/Fuzzy_set), [syllogistic figures](https://en.wikipedia.org/wiki/Syllogism), [figured bass](https://en.wikipedia.org/wiki/Figured_bass), [musical notes](https://en.wikipedia.org/wiki/Musical_note), [post and core](https://en.wikipedia.org/wiki/Post_and_core) and [promissory notes](https://en.wikipedia.org/wiki/Promissory_note) support only the basic distinctions actually explained. No engineering model, treatment recommendation or legal outcome is inferred. Unavailable engineering-statics and Open Music Theory pages are not claimed as verified evidence. The preserved Rowlands passage uses the older spelling poast for the account or debt, rather than describing chalking in that quotation.

The effective/efficient/sensible/sensitive batch checks the identity exception against MathWorld [Effective Action](https://mathworld.wolfram.com/EffectiveAction.html). Only the identity fixes every point; a nonidentity element may still fix some points. JCGM's [sensitivity of a measuring system](https://jcgm.bipm.org/vim/en/4.12.html) and [measurement accuracy](https://jcgm.bipm.org/vim/en/2.13.html) give separate definitions for indication change relative to measured-quantity change and agreement with a true value. The ordinary dictionary use for detecting small changes is explained alongside that technical distinction. The [ATLAS effective-field-theory glossary](https://atlas.cern/glossary/effective-field-theory) supplies a concrete example of parameterising indirect effects; the accessible Manohar [lecture abstract](https://arxiv.org/abs/1804.05863) confirms its introductory high-energy-physics scope, without being treated as verification of every detail of the full lectures. Historical and paranormal source records remain attributed reading explanations rather than claims that paranormal abilities are established.

The approach/benefit/available/claim batch checks finite limits and infinite limits against OpenStax [The Precise Definition of a Limit](https://openstax.org/books/calculus-volume-1/pages/2-5-the-precise-definition-of-a-limit) and [Limits at Infinity and Asymptotes](https://openstax.org/books/calculus-volume-1/pages/4-6-limits-at-infinity-and-asymptotes). An arbitrarily small distance to a finite value differs from eventually exceeding every fixed bound. The two restored approach records remain children of ordinary lexical access-route and aircraft-arrival meanings; those parents are not source directories. The legal label on available is retained without inferring current admissibility rules or treating the source's commented historical note as independently verified dating.

Note's three directories use whole-line italics in the source instead of a non-gloss template. Their exact top-level lines, source revision and multiple independently restored children are retained. Audit validation accepts this formatting only with multiple children; partial italics, an unformatted lexical definition and nested headings remain insufficient. Plain source rendering and every earlier source identity remain unchanged.

The change/clear/date/spring batch checks CSS clearance against [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/clear), cheque availability against the [FTC](https://consumer.ftc.gov/articles/how-spot-avoid-report-fake-check-scams), tidal range against [NOAA](https://oceanservice.noaa.gov/facts/springtide.html), seasonal boundaries against [NOAA NCEI](https://www.ncei.noaa.gov/news/meteorological-versus-astronomical-seasons), and row/change terminology against the approved [CCCBR Framework edition 2](https://cccbr.github.io/method_ringing_framework/edition2/fundamentals.html). NWS cloud-cover conventions differ between its [glossary](https://forecast.weather.gov/glossary.php?word=sky+condition) and an [older regional table](https://www.weather.gov/bgm/forecast_terms), so the dictionary's preserved threshold is explained as source-specific. Basic groundwater-outlet, springing-level and mooring-line distinctions received secondary cross-checks against the respective Wikipedia articles; no inaccessible technical authority is claimed as verified evidence.

The course/order/term/break batch checks gestational dating against [MedlinePlus fetal development](https://medlineplus.gov/ency/article/002398.htm), [NHS due-date guidance](https://www.nhs.uk/pregnancy/finding-out/due-date-calculator/) and ACOG's term-pregnancy and due-date guidance. [OpenStax Chemistry 2e, 12.3](https://openstax.org/books/chemistry-2e/pages/12-3-rate-laws) supports empirically determined reaction orders, including fractional, negative and zero exponents. Historical Scottish rent-payment use of term is attested in Alexander Wood Renton's [1911 Britannica tenancy article](https://en.wikisource.org/w/index.php?oldid=11097887); that historical calendar is not presented as a current lease rule. Exact source glosses and revisions remain separate from editorial teaching.

The check/point/draw/sound batch also cross-checks specialist distinctions against [FIDE Laws, articles 3.9 and 5](https://handbook.fide.com/chapter/E012023), [MCC Law 16.5](https://lawsofcricket.lords.org/laws-of-cricket/innings-and-results/the-result), [Trackman's face-to-path explanation](https://www.trackman.com/blog/golf/face-to-path) and the [US Backgammon Federation's board description](https://usbgf.org/backgammon-basics-how-to-play/). These support check versus checkmate, cricket tie versus draw, curvature without requiring club-toe contact, and the board's four six-point quadrants. Preserved Wiktionary glosses remain separately attributed and revision-bound.

The audit must reconcile all source identities, with no stale review hashes, duplicate review rows or orphaned supplements. Every reviewed example must demonstrate its sense and retain source attribution. Collocations and distinction exercises must fit that sense and grammatical form. Diagram coverage must be reported explicitly; inaccurate generic artwork does not satisfy coverage. All retained resource URLs must still load. The final verification must cover the entire requested scope, rather than only the latest batch.

<a id="vocabulary-parallel-review"></a>

## Complete-term parallel dictionary review

### Integrated snapshot and next packages — 2026-10-20

The current integrated working tree has52,152 source senses:5,579 independently fully reviewed and46,573 pending. Since the unified-plan baseline,applied integrations add1,317 full reviews,including11 restored senses. The2,036 focused repairs,source caches and candidate packages are separate measures. Existing diagrams remain at854;no new verified exact media bindings are claimed for those reviews.

Two authors and one independent reviewer process complete terms in isolated output directories. The third packages contain636 exact display variants. After auxiliary-field revisions and independent final review,root integrated549 accepted variants:501field repairs and48retains. The installed snapshot adds213 full source reviews after787 actual display routes,8,657 individual-edit checks,187 typed-note route checks and480 generated-task checks. Seventy-four original whole-variant holds and13 indexed-only proposals remain outside the merge. Potential full-review teaching variants are not source reviews. An explicit independently sourced not-applicable decision can replace an optional collocation/distinction quota only when bound to the exact final material hash;definition and example/reading note remain required.

The [unified implementation ledger](unified-learning-implementation.md) is the release checklist. Runtime continuation15411b6d78e444038a962324c1bb63f3ef1441f5 is deployed and verified,including the fourth content integration. Packages continue internally and compatible accepted changes are combined; each small set of words does not trigger a deployment. Fifth packages0003/0004 contain107terms/794exact variants and are author-frozen,awaiting independent final review. Their author potentials do not increase the full-review total.

The frozen fourth-job manifest covers7,021terms/52,152source senses/55,795exact work items in163packages,at source snapshot89f20983e75abc20ff8c862ee2257184c176b5f484075323c87ee43c2d1419ff. Two author packages contain118whole terms/638exact display variants. Independent review accepted585 variants (567 field proposals and18 retains),held53,and independently revised the candidates before root integration. Complete source-sibling coverage adds552 full reviews; eight already reviewed identities do not increment the total. Packages,teaching variants and focused repairs are never counted as extra source reviews.

Root verified752 actual installed display routes,8,272 personal-field edit sentinels,373 typed-note routes and342 staged task cases. A separate installed-release review checked585 final materials,53 held variants,560 complete source sibling sets,552 new ledger records and5,855 source/restored hashes. Its only observation was the expected readiness version change to core-2026-10-20.4. Evidence:local/unified-dictionary/fourth-independent-release-review.json,SHA256165c8e04cad93e55ab23ccdb5f67d7267b347b5c4485152fedf6c76699c180fd. The applied snapshot is frozen;subsequent jobs need a fresh quality source hash and must retain earlier unresolved reasons.

### Workflow

The issue workflow in [vocabulary-bulk-workflow.md](vocabulary-bulk-workflow.md) repairs particular fields. This workflow separately assigns complete dictionary terms to authors and independent semantic reviewers. A field repair does not complete a term review or increase the dictionary editorial ledger.

`scripts/vocabulary-review-jobs.ts` builds reusable work packages from the existing complete quality report. Every term retains all indexed and restored source senses, reviewed source context and exact teaching variants with their default/group references. Current learning terms come first; specialist and historical terms remain in the inventory. The default target is 300 pending **source senses** per package. Whole terms stay together, and an oversized term gets its own package. Teaching variants and already reviewed source senses do not inflate that target.

Create a current quality report using the existing workflow, then run:

```powershell
node node_modules/vite-node/vite-node.mjs --script scripts/manage-vocabulary-review-jobs.ts create --report local/audits/vocabulary-quality.json --output local/dictionary-review/job
node node_modules/vite-node/vite-node.mjs --script scripts/manage-vocabulary-review-jobs.ts claim --manifest local/dictionary-review/job/manifest.json --package review-0001 --actor author-a
```

Creation requires a new or empty directory inside ignored `local/`. Use vite-node's `--script` option so the CLI entry point receives its own filename and arguments. It writes `manifest.json` and `review-*.json` packages with complete source/display work rows. The manifest binds the source snapshot, complete work inventory, package membership, every term and every exact work item to SHA-256 fingerprints. The CLI recomputes the current source snapshot before creating or changing a job. Changed source data, teaching content or teaching scopes require a fresh job; an old job remains evidence.

All authors claim through one central manifest. A package claim covers every term in that package and rejects an existing owner. Do not create separate manifests for authors handling the same inventory. The CLI takes an exclusive lock while updating and replaces the manifest atomically, preventing concurrent claims from overwriting one another. It never edits dictionary JSON, teaching supplements or the editorial ledger.

For subsequent actions, write a JSON request and supply it with:

```powershell
node node_modules/vite-node/vite-node.mjs --script scripts/manage-vocabulary-review-jobs.ts update --manifest local/dictionary-review/job/manifest.json --request local/dictionary-review/request.json
```

A request contains `term`, `actor`, the term's `workFingerprint` and `to`. Supported stages are:

| From | To | Required evidence |
| --- | --- | --- |
| unclaimed | claimed | Package claim with a named owner |
| claimed | draft | Optional structurally valid candidates |
| draft | draft | Additional candidates with previously unused work identities |
| claimed or draft | source-unresolved | A concrete source issue in `reason` |
| source-unresolved | draft | A source-resolution explanation in `reason` |
| draft | checked | Independent full-term semantic review |
| checked | integrated | Owner's `integrationReference` identifying the applied change |

Only the owner can draft, record source issues or integrate. A reviewer must differ from the owner. Claims are exclusive; states cannot skip review or leave integrated. `integrated` is a local workflow receipt, not proof that the published editorial ledger has changed. After integration changes the dictionary snapshot, create a fresh job for further work.

Draft requests optionally contain `candidates`, using the existing full or focused quality-candidate format. The tool reuses the existing candidate validator and rejects stale fingerprints, repeated work identities, candidates outside the owned term and unsupported approval fields. Receipts preserve each candidate's fingerprint and classify focused `changes` as `field-repair`. Full-format candidate content is still a draft and receives no automatic semantic approval.

For `checked`, the request contains `reviews`: one record for **every** work item of that term, including source context and separate teaching variants. Each record needs `workItemId`, its exact `workFingerprint`, `decision` (`retain` or `change`), a nonblank `rationale`, an HTTPS `referenceUrl`, and all `reviewedAreas`: `meaning-pos`, `example`, `collocations`, `distinctions`, `usage-register`, `teaching-context`, `optional-material`. `change` must have a submitted candidate; `retain` must not. Checking an area means assessing existing material and whether any addition is useful; it does not impose a quota for collocations, exercises or diagrams. Confirm specialist and historical register, headings, references, restored children, meaning selection and optional tasks against the exact source meaning.

The independent receipt binds the current candidate set as well as the complete work inventory. Missing work items, unresolved sources, partial field-only checks, duplicate review identities and stale fingerprints cannot reach checked. A changed source or displayed variant cannot inherit another variant's review. Structural checks cannot establish that a citation supports a meaning or that an authored sentence is semantically sound; reviewers must inspect that evidence themselves.

Validation is targeted during authoring. Combine compatible reviewed content before the existing final data/source/identity/resource checks and release pipeline. The job tool makes no external request, uses no model API and does not publish content.
