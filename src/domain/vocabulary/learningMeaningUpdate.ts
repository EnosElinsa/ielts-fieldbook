import { catalogVocabularyEntry, hasVocabularySenseEdits, restoreVocabularyDictionaryImport } from './content';
import { vocabularyCurriculum, vocabularyCurriculumBaselines } from './curriculum';
import { resolveVocabularyLearningContext } from './context';
import { buildLearningBatch } from './learningBatch';
import type { VocabularyPracticeMode } from './preferences';
import type { VocabularyLearningBatchSelection } from './selection';
import type { VocabularyStore } from './types';

/** An explicit correction of known old syllabus defaults, never a sense alias. */
export function previewLearningMeaningUpdate(state: Partial<VocabularyStore>, selection: VocabularyLearningBatchSelection, mode: VocabularyPracticeMode) {
  const changedEntryIds: string[] = [];
  const cards = selection.cards.map(ref => {
    const raw = state.vocabulary?.find(entry => entry.id === ref.entryId) || catalogVocabularyEntry(ref.entryId);
    if (!raw) return ref;
    const entry = restoreVocabularyDictionaryImport(raw);
    const old = entry.senses.find(sense => sense.id === ref.senseId);
    const syllabus = vocabularyCurriculum(entry, selection, old);
    if (syllabus?.curriculum.senses.some(sense => sense.id === ref.senseId)) return ref;
    const correction = syllabus?.rows.find(row => row.originalSense?.id === ref.senseId && row.sense.id !== ref.senseId);
    if (!correction?.originalSense || old && hasVocabularySenseEdits(old, [correction.originalSense, ...vocabularyCurriculumBaselines(entry.id, old.id)])) return ref;
    const current = resolveVocabularyLearningContext(entry, { ...selection, senseId: correction.sense.id });
    if (!current.curriculumCurrent || !current.contentReviewed || !current.sense) return ref;
    changedEntryIds.push(ref.entryId);
    return { entryId: ref.entryId, senseId: current.sense.id };
  });
  if (!changedEntryIds.length) return;
  const batch = buildLearningBatch(state, selection.bookId, selection.unitId, selection.batchIndex, selection.batchSize, mode, cards);
  if (batch.mode !== mode) return;
  return { batch, changedEntryIds };
}

/** Invoked only by the learner's update action, inside the account save queue. */
export function updateLearningPlanMeanings(state: Partial<VocabularyStore> & { plans?: any[] }, planId: string, expectedTarget: unknown, now: string) {
  const plan = state.plans?.find(row => row.id === planId);
  if (!plan || !['pending', 'in_progress'].includes(plan.status) || plan.completedAt || plan.target?.mode !== 'learning-batch'
    || JSON.stringify(plan.target) !== JSON.stringify(expectedTarget) || plan.target.selectedMeanings?.length
    || state.vocabularySessions?.some(session => session.planId === planId)) throw new Error('This task changed or already has a saved assessment. Reload it before updating its meanings.');
  const target = plan.target;
  const selection: VocabularyLearningBatchSelection = { kind: 'learning-batch', bookId: target.bookId, unitId: target.unitId, batchIndex: target.batchIndex, batchSize: target.batchSize, cards: target.cards };
  const update = previewLearningMeaningUpdate(state, selection, target.assessmentMode);
  if (!update) throw new Error('No verified meaning update is available for this batch.');
  plan.meaningUpdates = [...(plan.meaningUpdates || []), { at: now, reason: 'group-curriculum', before: structuredClone(target.cards), after: structuredClone(update.batch.selection.cards) }];
  plan.target = { ...target, cards: update.batch.selection.cards };
  plan.manuallyEditedAt = now;
  plan.updatedAt = now;
  return update;
}
