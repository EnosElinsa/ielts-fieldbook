# Vocabulary learning and review

These rules describe the unified system. Scheduling details and release evidence are maintained in [planning behaviour](vocabulary-planning-behaviour.md) and [the implementation ledger](unified-learning-implementation.md).

## Studied and mastery

**Studied** means that the learner answered the assessment prompts. It does not mean every answer was correct. A wordbook group becomes Studied when its required words have been covered by complete group assessments or learning batches. A reliable graded historical group record can also establish that coverage, including a zero score. Browsing cards or playing audio alone does not establish Studied.

Automatic labels are calculated separately for each saved meaning from dated, verified retrieval evidence:

| Label | Foundation requirement |
| --- | --- |
| Familiar | At least three effective successes in each of meaning, listening and spelling |
| Mastered | At least five effective successes in each of those three dimensions |

Counted successes in the same dimension must be at least 24 hours apart. Repeating a question on the same day can be useful practice without adding another spaced success. An unresolved foundation mistake blocks promotion until recovery. Recovery requires three successful retries in the failed mode, with at least 24 hours between the first and last.

Meaning recall develops meaning evidence. Dictation develops listening and spelling evidence. Usage and assessed sentence production are independent advanced evidence; neither is a prerequisite for foundation Mastered, and self-rated production cannot create verified foundation successes. Manual labels remain visibly marked and can be returned to automatic. A Mastered meaning keeps its FSRS review schedule.

## What the planner selects

The planner evaluates saved, attempted meanings in this order:

1. An eligible confirmed mistake.
2. An active recovery opportunity.
3. A review whose saved FSRS date has arrived.
4. A missing foundation dimension.
5. Another eligible spaced foundation practice.

The automatic foundation modes are meaning recall and dictation. A preferred mode breaks equivalent ties; it cannot displace more urgent work. A never-practised mode is a learning opportunity, rather than an overdue review merely because the word was saved long ago. Specialist exercises remain available for deliberate practice.

The initial estimate is approximately one minute per prompt. Review batches contain one mode and at most one meaning per word. Another saved meaning remains available for a later batch. After protected tasks and bounded carryover, the planner reserves the daily new-word goal (default 10, adjustable to 0), then fills remaining vocabulary time with review. New automatic learning tasks can contain an exact partial word list; the page shows the assigned number and any shortfall. Existing fixed batches retain their original requirements.

New words come from enabled, unpaused enrolled books, following the user's book order and then group/member order. Batch rotation is optional. An entry already learned or reserved by another protected task is excluded across books. Home uses the same selector. Distinct meanings have separate review progress; the learning card shows their definitions while reading and hides them during unrevealed recall.

Learning batch indexes use the ordered eligible words, with archived words and duplicate memberships removed before counting or slicing. A short final batch uses only its actual prompt count. External wordbook metadata can reserve prospective learning time before resources arrive; exact cards are bound only after loading. If the loaded group is smaller, untouched automatic slots are reduced or removed without changing frozen or manually arranged work.

Due for review requires a valid FSRS schedule whose date has arrived for the selected word, meaning and practice mode. Saving a word does not make it due. Words to retry includes unresolved errors in the selected mode even before its due date. Custom selection allows explicit word and meaning choices from saved or learned content. Self-directed sessions accept 1–100 prompts and report the requested and available counts; planned sessions keep their own fixed requirements.

## Fixed tasks and recovery

Dynamic review slots reserve time without freezing their word lists. Starting a slot selects current eligible prompts, excludes targets already reserved by another frozen unfinished task, and saves the exact target list before opening practice. User appointments can instead save a fixed word list. Submitting a graded assessment updates the corresponding mode's FSRS schedule; moving its task date or leaving an answer ungraded does not.

An already started review keeps its full list and answer draft. Legacy tasks may contain multiple meanings of one word or more than 50 prompts. Those exact targets remain valid and are not reduced by free-practice filters, shuffle order, wordbook selection or session-size preferences.

Loading failure is retryable. Missing targets are reported explicitly. If an automatic dynamic slot no longer has eligible content, it is system-handled as currently no review needed instead of being recorded as completed. A planned assessment completes its task only after all exact targets have submitted nonblank graded answers in the required mode. Incorrect answers still satisfy the attempt requirement; mastery and error recovery remain separate.

Restoring a no-longer-due slot lets it select newly eligible words on its next start. Editing an unstarted dynamic review's duration also updates its prompt capacity. An exact frozen target cannot be shortened to fit a smaller duration.

Practice opened from Planning or Today retains its source through settings, refresh, recovery and results. Direct visits default back to Vocabulary. Return paths are restricted to allowed internal routes.

## Missed study days

Schedule shows the selected seven-day window, while Waiting and History have separate views with 20 records per page. Automatic carryover defaults to at most 30% of daily time and respects study days, module capacity and indivisible task size. Started tasks come first, followed by the oldest eligible unstarted tasks. Tasks that cannot fit remain waiting with a reason. Protected future manual, started or frozen arrangements keep their existing allocations if settings are later reduced; automatic placement does not create additional overtime.

Only unstarted automatic dynamic reviews can be recorded as **merged and replanned**. Their records are retained, while current memory state supplies the next review candidates. Manual tasks, fixed lists and started work keep their material and drafts. Held tasks do not automatically return to the schedule.

Planning previews rearranging, holding and skipping selected waiting tasks. Selecting this page and all filtered results are distinct; including started work requires an explicit selection. Skipping retains identity, history and drafts and creates no learning evidence. Clearing skipped history archives it recoverably and prevents the same task being regenerated. Unarchive restores visibility only; running it again requires an explicit date. A word's actual review debt remains separate and can lead to a new eligible review.

Plan mutations use the existing save queue. Failed saves leave the prior account state available for retry. Repeated refreshes do not duplicate tasks or repeatedly archive the same review. All storage remains in the existing JSON records; no database table is added.
