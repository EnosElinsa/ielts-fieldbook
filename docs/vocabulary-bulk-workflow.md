# Bulk vocabulary content workflow

This workflow replaces choosing a few words and checking every rare meaning before publishing again. It preserves the complete dictionary objective, every source identity, all earlier editorial reviews and the distinction between machine checks and semantic review.

## Execution priority — 2026-10-20

Use three work lanes: shared mechanical fixes across the corpus; source-backed authoring across current learning meanings; and separate semantic investigation for ambiguous, historical or specialist readings. Start with a complete issue queue, using 200–1,000 items per authoring package where the evidence supports that size. Package boundaries are not release boundaries. Finish a coherent issue class and accumulate compatible changes before one release, rather than repeating a full release for a few words. The complete dictionary backlog stays open, but it does not gate useful current-learning repairs.

Require only the fields needed for the repair. Examples, meaning selection and pronunciation matching take priority; comparisons, cloze questions and diagrams are optional teaching material with their own evidence requirements. Do not multiply arbitrary questions or two-box diagrams to raise coverage totals. Exact source matching, field checks and duplicate detection can run over the complete corpus. Authored teaching content still needs semantic review; model-generated drafts and automated semantic approval are not implemented.

Scope rendered verification to risk. Validate changed default selections, restored meaning groups, exact practice identities and pronunciation/session behavior. Cover representative content and narrow-screen boundaries; unchanged components do not require replaying every edited sentence at every viewport. Keep full data/source/identity/resource validation and final CI, while reusing unchanged artifact evidence. Report the actual scope and remaining gaps rather than equating browser-state counts with linguistic quality. Record the next queue and acceptance criteria in the same release so follow-up improvements do not disappear into a roadmap.

The [fragment review](vocabulary-fragment-learning-review.md) now accounts for the complete 513-item current-learning queue from snapshot `49941667ae91f03fed8efe5e4fccc3776cfbc8b2c3fc99fcfcdeef59f5aaa710`: 312 valid short examples are retained with exact-content decisions, 199 lexical examples are rewritten and two source directories are repaired through real children. This adds 571 source-bound editorial reviews, 37 restored meanings and 24 corrected defaults. Pending current-learning fragment signals reach zero; 310 raw heuristic signals remain visible. The remaining duplicate-gloss signal for latest needs source-identity investigation, followed by the full current-learning collocation inventory. The complete pending dictionary inventory remains open.

## Scan once across the corpus

Run `npm run vocabulary:quality` from the repository root. The command reads public catalogue data, every indexed dictionary, restored meanings and the existing editorial ledger. It runs the existing editorial audit before using its review status. It then resolves every default and wordbook membership with the application's actual learning-context resolver, including additional meanings in multiple-meaning lessons. Exact public fallback examples and current sentence-gap/distinction task availability are included.

The compact committed output is [vocabulary-quality-report.md](vocabulary-quality-report.md). The complete generated work queue is `local/audits/vocabulary-quality.json`, which is ignored by Git. The report separates missing displayed examples, phrase/quotation review signals, missing collocations, missing distinctions, duplicate-gloss candidates and exercise coverage. It does not infer a word's frequency from group reuse or classify every unlabelled source meaning as everyday English.

Different group teaching remains separate even when it shares a source sense ID. Work items retain their original source fingerprint, exact displayed-content fingerprint, text, entry/sense identities and all applicable scopes. A source entry and a different teaching version cannot inherit each other's editorial approval. Proper-name case differences and distinct etymologies can produce similar glosses: duplicate signals must be inspected, not automatically deleted.

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

The first real run prepared 199 current truncation signals in one operation: 131 exact source matches, 68 manual matches and four records with direct source-example suggestions. The [subsequent authored review](vocabulary-truncated-learning-review.md) improves 98 exact meanings across words; it does not pretend the other cases were repaired automatically.

The [current-learning sweep](vocabulary-remaining-learning-review.md) handles the remaining 101 signals together, including the 68 manual source matches. It adds 127 reviews through actual lexical repairs, restored children and corrected defaults. A directory is repaired by restoring and selecting its real meanings, not by disguising its old example as a note. Once the current snapshot changes, regenerate queues; retain earlier packages only as evidence. Continue by issue type across the corpus and accumulate consistent content before the full release pipeline. Do not resume choosing a few words' complete rare-sense inventories as the normal unit of work.

## Validate candidates together

For an issue-specific repair, use the [focused candidate workflow](vocabulary-focused-candidates.md). `vocabulary:prepare -- --fields example` prepares only an example change; omitted definitions, collocations, distinctions, tasks and metadata remain in the current snapshot. The candidate checker produces an attributed, scoped merge preview for review, without publishing it. This avoids inventing extra teaching fields just to repair one field. A changed definition or part of speech requires review of the retained teaching fields as well.

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
