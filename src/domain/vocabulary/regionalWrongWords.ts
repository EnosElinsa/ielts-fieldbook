import { isRegionalSpellingDifference } from './spelling';
import type { VocabularyStore } from './types';

// Correct only mutable wrong flags. Reviews, evidence and FSRS history stay intact.
// Missing answers, unrelated failures and incomplete imported summaries are not proof.
export function resolveRegionalSpellingWrongWords(state: VocabularyStore, at = new Date().toISOString()) {
  const changed: string[] = [];
  for (const learning of state.vocabularyStates || []) {
    const wrong = learning.wrong?.modes?.dictation;
    if (!wrong?.active) continue;
    const entry = state.vocabulary.find(item => item.id === learning.entryId);
    if (!entry) continue;
    const sameSense = (row: { entryId: string; senseId?: string }) => row.entryId === entry.id && (!row.senseId || row.senseId === learning.senseId);
    const failures = [...(state.vocabularyReviews || []), ...(state.vocabularyEvidence || [])]
      .filter(row => sameSense(row) && row.mode === 'dictation' && row.result === 'failure');
    if (!failures.length || failures.some(row => !isRegionalSpellingDifference(entry.term, row.response))) continue;
    if (wrong.lastFailureAt && !failures.some(row => row.occurredAt && Date.parse(row.occurredAt) === Date.parse(wrong.lastFailureAt!))) continue;
    const imported = (state.vocabularyImportBatches || []).flatMap(batch =>
      Array.isArray(batch.summaries) ? batch.summaries as { entryId: string; currentlyWrong?: boolean; undatedHistory?: { correct?: boolean; response?: string }[] }[] : []
    ).filter(summary => summary.entryId === entry.id && summary.currentlyWrong);
    if (!wrong.lastFailureAt && imported.length && imported.some(summary => {
      const failed = summary.undatedHistory?.filter(event => event.correct === false) || [];
      return !failed.length || failed.some(event => !isRegionalSpellingDifference(entry.term, event.response));
    })) continue;
    wrong.active = false; wrong.resolvedAt = at; wrong.successesSinceFailure = 0;
    const active = Object.values(learning.wrong.modes).filter(mode => mode?.active);
    learning.wrong.active = Boolean(active.length);
    learning.wrong.successesSinceFailure = active.length ? Math.min(...active.map(mode => mode!.successesSinceFailure)) : 0;
    if (!active.length) learning.wrong.resolvedAt = at;
    learning.wrong.reason = 'British/American spelling accepted; original history retained.';
    learning.updatedAt = at; changed.push(learning.id);
  }
  return changed;
}
