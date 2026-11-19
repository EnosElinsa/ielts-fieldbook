import { catalogVocabularyEntry, catalogVocabularySenses, hasVocabularySenseEdits, restoreVocabularyPublicImport } from './content';
import { vocabularyCurriculum, vocabularyCurriculumBaselines } from './curriculum';
import { resolveVocabularyLearningContext } from './context';
import { buildLearningBatch } from './learningBatch';
import { vocabularyReadinessBaselines } from './readiness';
import type { StudyPlan } from '../plans';
import type { VocabularyPracticeMode } from './preferences';
import type { VocabularyLearningBatchSelection } from './selection';
import type { VocabularyStore } from './types';

/** Find a verified syllabus replacement for a previously published default. */
export function currentGroupLearningRef(state: Partial<VocabularyStore>, scope: { bookId: string; unitId: string }, ref: VocabularyLearningBatchSelection['cards'][number]) {
  const raw = state.vocabulary?.find(entry => entry.id === ref.entryId) || catalogVocabularyEntry(ref.entryId);
  if (!raw) return ref;
  const entry = restoreVocabularyPublicImport(raw);
  const old = entry.senses.find(sense => sense.id === ref.senseId);
  const syllabus = vocabularyCurriculum(entry, scope, old);
  if (syllabus?.curriculum.senses.some(sense => sense.id === ref.senseId)) return ref;
  const correction = syllabus?.rows.find(row => row.originalSense?.id === ref.senseId && row.sense.id !== ref.senseId);
  if (!correction?.originalSense) return ref;
  if (old && hasVocabularySenseEdits(old, [
    correction.originalSense,
    ...catalogVocabularySenses(entry.id).filter(sense => sense.id === old.id),
    ...vocabularyReadinessBaselines(entry.id, old.id),
    ...vocabularyCurriculumBaselines(entry.id, old.id),
  ])) return ref;
  const current = resolveVocabularyLearningContext(entry, { ...scope, senseId: correction.sense.id });
  return current.curriculumCurrent && current.contentReviewed && current.sense
    ? { entryId: ref.entryId, senseId: current.sense.id }
    : ref;
}

export function previewLearningMeaningUpdate(state: Partial<VocabularyStore>, selection: VocabularyLearningBatchSelection, mode: VocabularyPracticeMode) {
  const cards = selection.cards.map(ref => currentGroupLearningRef(state, selection, ref));
  const changedEntryIds = cards.filter((ref, index) => ref.senseId !== selection.cards[index].senseId).map(ref => ref.entryId);
  if (!changedEntryIds.length) return;
  const batch = buildLearningBatch(state, selection.bookId, selection.unitId, selection.batchIndex, selection.batchSize, mode, cards);
  if (batch.mode !== mode) return;
  return { batch, changedEntryIds };
}

function canUpdateLearningPlan(state: Partial<VocabularyStore>, plan: Pick<StudyPlan, 'id' | 'status' | 'completedAt' | 'target'> | undefined) {
  return Boolean(plan && ['pending', 'in_progress'].includes(plan.status) && !plan.completedAt
    && plan.target?.type === 'vocabulary' && plan.target.mode === 'learning-batch'
    && !plan.target.selectedMeanings?.length && !state.vocabularySessions?.some(session => session.planId === plan.id));
}

export function previewLearningPlanMeaningUpdate(state: Partial<VocabularyStore>, plan: Pick<StudyPlan, 'id' | 'status' | 'completedAt' | 'target'> | undefined) {
  const target = plan?.target;
  if (target?.type !== 'vocabulary' || !target.bookId || !target.unitId || !target.cards?.length || !canUpdateLearningPlan(state, plan)) return;
  const selection: VocabularyLearningBatchSelection = {
    kind: 'learning-batch', bookId: target.bookId, unitId: target.unitId,
    batchIndex: target.batchIndex ?? 0, batchSize: target.batchSize ?? 10, cards: target.cards,
  };
  return previewLearningMeaningUpdate(state, selection, target.assessmentMode as VocabularyPracticeMode);
}

/** Invoked only by the learner's update action, inside the account save queue. */
export function updateLearningPlanMeanings(state: Partial<VocabularyStore> & { plans?: any[] }, planId: string, expectedTarget: unknown, now: string) {
  const plan = state.plans?.find(row => row.id === planId);
  if (!canUpdateLearningPlan(state, plan) || JSON.stringify(plan.target) !== JSON.stringify(expectedTarget)) throw new Error('This task changed or already has a saved assessment. Reload it before updating its meanings.');
  const target = plan.target;
  const update = previewLearningPlanMeaningUpdate(state, plan);
  if (!update) throw new Error('No verified meaning update is available for this batch.');
  plan.meaningUpdates = [...(plan.meaningUpdates || []), { at: now, reason: 'group-curriculum', before: structuredClone(target.cards), after: structuredClone(update.batch.selection.cards) }];
  plan.target = { ...target, cards: update.batch.selection.cards };
  plan.manuallyEditedAt = now;
  plan.updatedAt = now;
  return update;
}
