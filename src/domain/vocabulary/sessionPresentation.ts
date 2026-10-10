import { isRegionalSpellingDifference } from './spelling';
import type { VocabularySessionRecord } from './session';

// Historical submissions are immutable; apply today's spelling policy to their view.
export function presentVocabularySession(record: VocabularySessionRecord): VocabularySessionRecord {
  if (record.mode !== 'dictation') return record;
  const results = record.results.map(row => {
    if (row.result !== 'failure' || !isRegionalSpellingDifference(row.expectedAnswer || row.term, row.response)) return row;
    const { errorType: _errorType, ...answer } = row;
    return { ...answer, result: 'success' as const };
  });
  if (results.every((row, index) => row === record.results[index])) return record;
  return { ...record, results, summary: {
    ...record.summary,
    correct: results.filter(row => row.result === 'success').length,
    incorrect: results.filter(row => row.result === 'failure' || row.result === 'partial').length,
    pending: results.filter(row => row.result === 'pending').length,
  } };
}
