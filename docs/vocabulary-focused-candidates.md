# Focused vocabulary repairs

Repairing one example should not require rewriting a definition or inventing collocations and distinctions. Focused candidates carry only intended field changes, bound to the same source and displayed-content fingerprints as complete candidates. The complete dictionary objective, source records, personal content and frozen sessions are unaffected by this offline authoring tool.

## Prepare a whole issue queue

```powershell
npm run vocabulary:quality
npm run vocabulary:quality -- --export --scope learning --issue archaic-example --limit 1000 --output local/vocabulary-work/archaic-work.json
npm run vocabulary:prepare -- --work local/vocabulary-work/archaic-work.json --sources local/vocabulary-work/source-responses.json --fields example --output local/vocabulary-work/archaic-focused.json
```

Reuse the revision responses already collected for the queue. `--fields` accepts a comma-separated selection from `definition`, `example`, `pos`, `usage`, `register`, `collocations`, `distinctions`, `exampleKind`, `learningPriority` and `distinctionTask`. Unknown, duplicate and empty selections fail. Omitting the option preserves the original complete-draft format.

In focused mode, each `draft` has identity fields, a reference URL and a `changes` object. Only a direct, exact-meaning source example can seed a requested example; missing or ambiguous source matches remain unresolved. Other requested fields start from current values or explicit empty placeholders. `missingFields` lists only requested fields without material, and `unchangedFields` identifies retained values that still need authoring. Optional fields outside the selection do not become compulsory tasks.

Preparation is not model generation or semantic approval. Edit and verify the drafts, then extract those draft objects as an array or JSONL. The outer source-preparation wrapper is not a candidate submission.

## Submit only the repair

```json
{
  "workItemId": "copy from the work item",
  "sourceHash": "copy from the work item, including null when applicable",
  "displayHash": "copy from the work item",
  "referenceUrl": "https://en.wiktionary.org/w/index.php?title=bank&oldid=12345",
  "changes": {
    "example": "We walked along the river bank."
  }
}
```

```powershell
npm run vocabulary:quality -- --candidates local/vocabulary-work/focused-candidates.jsonl --output local/vocabulary-work/focused-validation.json
```

Do not repeat teaching fields at the root alongside `changes`. Omitted fields remain in the existing displayed snapshot. Submitted fields must be valid; empty arrays, nulls and blank strings do not silently erase earlier content. At least one field must actually change. IDs, sources, licenses and approval status are not editable fields.

The returned `focusedPreviews` retain entry/sense identities, fingerprints, reference URL and every applicable default/group scope. Each preview includes actual `changedFields`, `reviewFields`, the merged `sense`, and separate editorial `metadata`. Arrays and tasks are copied so editing a preview cannot mutate its input report. Reading-note and learning-priority metadata do not leak into the lexical snapshot.

Changing a definition or part of speech expands `reviewFields` to all teaching fields and the external diagram/pronunciation bindings. A retained example, distinction, task or media binding must still fit that meaning; preserving it is not approving it. The preview does not fetch or update those external registries. An example-only change normally limits the field-editing work to the example. The reviewer must still verify its exact meaning, register and source evidence. A course meaning cannot borrow a different same-ID variant's fingerprint or be integrated as a global source correction.

Definition edits must stay within the bound source meaning. Correcting a default selection uses the separately reviewed target sense and default registration; replacing another sense's text cannot stand in for selecting that meaning.

## Release reviewed content

All candidates return `readyForPublication: 0`. A structurally valid focused candidate still requires semantic review. These commands do not write teaching files, source dictionaries or the editorial ledger, and do not change learner data. Explicitly reviewed integration must preserve source-specific teaching, personal edits and frozen history under the existing release checks.

The quality report now separates content-review signals from enrichment opportunities. Content-review signals appear first even when another word has more group reuse. Missing collocations, comparisons or a particular exercise remain visible opportunities; they are not compulsory fields for every meaning. All dictionary pending counts and raw issue counts remain present. Neither a cleared signal nor this tooling change increases reviewed semantic coverage by itself.
