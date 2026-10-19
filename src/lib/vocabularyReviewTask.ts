import { VOCABULARY_PRACTICE_MODES } from '../domain/vocabulary/preferences';
import type { VocabularyMode } from '../domain/vocabulary/types';

export type AssessedReviewMode = Exclude<VocabularyMode, 'production'>;

export function isAssessedReviewMode(mode: unknown): mode is AssessedReviewMode {
  return typeof mode === 'string' && VOCABULARY_PRACTICE_MODES.some(item => item.value === mode && !['audio', 'production'].includes(item.value));
}

/** One minute per prompt; validate even callers in legacy unchecked planning modules. */
export function vocabularyReviewTask(mode: AssessedReviewMode, count: number) {
  if (!isAssessedReviewMode(mode)) throw new Error('Choose an assessed recall mode.');
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw new Error('Choose a valid review prompt capacity.');
  const label = VOCABULARY_PRACTICE_MODES.find(item => item.value === mode)!.label;
  return {skill:'vocabulary',kind:'vocabulary',title:`Vocabulary - ${label} review`,description:`Recall up to ${count} ${count===1?'prompt':'prompts'} selected when you start.`,estimatedMinutes:count,quantity:count,deskMode:mode,target:{type:'vocabulary',mode:'due-review',assessmentMode:mode,binding:'dynamic',batchSize:count,cards:[]},completion:{type:'assessment',description:'Submit the review selected when you start.'}};
}
