# Vocabulary planning behaviour

These are the current unified rules. Implementation and remaining acceptance are tracked in [the continuous ledger](unified-learning-implementation.md).

Daily time, enabled weekdays, weekday overrides and module weights determine capacity. Vocabulary uses an explicit fixed allocation or a percentage; existing fixed settings remain. Vocabulary-only plans use the study time for vocabulary. Started, manual, completed and frozen tasks retain their contracts when settings reduce capacity.

After protected work, the planner reserves the daily new-word goal (default 10, adjustable to 0) before review. A precise partial word list can use time insufficient for a full batch. Planning shows assigned new words and shortfall. Existing fixed batches and history retain their original identity, count and contract.

New words come from enrolled, unpaused books. Ordered mode follows user book order, then group/member order;rotation advances after each batch. Learned entries and protected learning reservations are excluded across books. Home uses the same selector and resumes today's existing task first. Exact tasks browse and assess their frozen words, including nonconsecutive source words.

Review priority is confirmed error, active recovery, actual due, foundation evidence gap, then spaced consolidation. Tasks show their reason and assessed mode. A strict due item requires a valid FSRS schedule for that word, meaning and mode. Creation timestamps and legacy imported dates never invent mode schedules. Wrong-word retries need not be due; recovery requires at least three correct retries spanning 24 hours from first to last success in that mode.

Dynamic reviews choose candidates when started and freeze them. Only unstarted automatic dynamic reviews merge or rebuild. Manual, fixed, started, held and archived tasks remain protected. An automatic task with no eligible review is system-handled as currently no review needed, separate from completion.

A task completes when a linked submission matches the exact word/meaning set and assessed mode, has valid times and nonblank graded answers for every prompt. Incorrect answers count as attempts. Audio-only listening, ungraded production and incomplete responses do not satisfy this condition. Fixed batches additionally retain book, group, batch index and size.

Learning save and task update are separate operations. Submission waits for both, reports which failed and retries the same session ID. Cross-device conflicts refresh the current plan and preserve another completion. A stale local tab cannot submit over a newer draft revision.

Automatic carryover defaults to at most 30% of daily time, and respects module budgets, study days and whole-task size. Oversized tasks stay waiting with a reason. Hold stops automatic return. Waiting can arrange selected tasks today/on a date or preview bounded replan; started tasks require explicit bulk selection. Previews also show related generated-task changes.

History uses server pages of 20 tasks, filters and exact target links. Opening a target asks the server for the page containing it. Select this page and select all filtered results have separate scopes; all-result selection reads IDs first and fetches selected task requirements before previewing changes. Archive hides skipped records recoverably while retaining identities against regeneration. Unarchive restores visibility; scheduling requires a date. Allocated, unfinished and completed minutes are estimates rather than measured study time.

Initial workspace reads load open tasks,today/future history,the active task and scheduling anchors. Historical payloads arrive only as needed; unloaded tasks cannot be treated as deletions. A coherent whole-schedule stamp checks concurrent changes inside the atomic account save. A replay returns its original stamp; an intervening change requires refresh and a new preview. Full account exports request complete history before constructing the backup.

Writing and speaking drafts load on entry to their productive module. Delayed loading preserves local field edits and untouched cloud sections/responses. Recovery is checked after loading the corresponding cloud drafts; Planning and Settings never save or erase unloaded drafts.
