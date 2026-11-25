import { catalogVocabularyEntry, catalogVocabularySenses, hasVocabularyLearningEdits, restoreVocabularyPublicImport } from './content';
import { vocabularyCurriculum, vocabularyCurriculumBaselines } from './curriculum';
import { resolveVocabularyLearningContext } from './context';
import { buildLearningBatch } from './learningBatch';
import { vocabularyReadinessBaselines } from './readiness';
import { planningEvidenceView } from '../planningEvidence';
import type { StudyPlan } from '../plans';
import type { VocabularyPracticeMode } from './preferences';
import type { VocabularyLearningBatchSelection } from './selection';
import type { VocabularySense, VocabularyStore } from './types';

type LearningRef = VocabularyLearningBatchSelection['cards'][number];
export type LearningMeaningChange = {
  entryId: string;
  term: string;
  /** The recorded curriculum reason that retired the saved meaning. */
  reason: string;
  from: { senseId: string; pos: string; definition: string };
  to: { senseId: string; pos: string; definition: string };
};

const describeSense = (sense: VocabularySense) => ({ senseId: sense.id, pos: sense.pos || '', definition: sense.definition });

/** Find a verified syllabus replacement for a previously published default. */
function groupLearningCorrection(state: Partial<VocabularyStore>, scope: { bookId: string; unitId: string }, ref: LearningRef): { ref: LearningRef; change?: LearningMeaningChange } {
  const raw = state.vocabulary?.find(entry => entry.id === ref.entryId) || catalogVocabularyEntry(ref.entryId);
  if (!raw) return { ref };
  const entry = restoreVocabularyPublicImport(raw);
  const old = entry.senses.find(sense => sense.id === ref.senseId);
  const syllabus = vocabularyCurriculum(entry, scope, old);
  if (syllabus?.curriculum.senses.some(sense => sense.id === ref.senseId)) return { ref };
  // A correction can retire the published default (originalSense) or an older
  // default recorded in previousSenses; both prove the saved sense was never a personal choice.
  const retired = (row: NonNullable<typeof syllabus>['rows'][number]) => [row.originalSense, ...(row.previousSenses || [])].filter((sense): sense is VocabularySense => Boolean(sense && sense.id === ref.senseId));
  const correction = syllabus?.rows.find(row => row.sense.id !== ref.senseId && retired(row).length);
  if (!correction) return { ref };
  if (old && hasVocabularyLearningEdits(entry.id, old, [
    ...retired(correction),
    ...catalogVocabularySenses(entry.id).filter(sense => sense.id === old.id),
    ...vocabularyReadinessBaselines(entry.id, old.id),
    ...vocabularyCurriculumBaselines(entry.id, old.id),
  ])) return { ref };
  const current = resolveVocabularyLearningContext(entry, { ...scope, senseId: correction.sense.id });
  if (!(current.curriculumCurrent && current.contentReviewed && current.sense)) return { ref };
  return {
    ref: { entryId: ref.entryId, senseId: current.sense.id },
    change: { entryId: ref.entryId, term: entry.term, reason: correction.reason, from: describeSense(old || retired(correction)[0]), to: describeSense(current.sense) },
  };
}

/** Find a verified syllabus replacement for a previously published default. */
export function currentGroupLearningRef(state: Partial<VocabularyStore>, scope: { bookId: string; unitId: string }, ref: LearningRef) {
  return groupLearningCorrection(state, scope, ref).ref;
}

export function previewLearningMeaningUpdate(state: Partial<VocabularyStore>, selection: VocabularyLearningBatchSelection, mode: VocabularyPracticeMode) {
  const corrections = selection.cards.map(ref => groupLearningCorrection(state, selection, ref));
  const cards = corrections.map(row => row.ref);
  const changedEntryIds = cards.filter((ref, index) => ref.senseId !== selection.cards[index].senseId).map(ref => ref.entryId);
  if (!changedEntryIds.length) return;
  const batch = buildLearningBatch(state, selection.bookId, selection.unitId, selection.batchIndex, selection.batchSize, mode, cards);
  if (batch.mode !== mode) return;
  const changes = corrections.flatMap((row, index) => row.change && row.ref.senseId !== selection.cards[index].senseId ? [row.change] : []);
  return { batch, changedEntryIds, changes };
}

function canUpdateLearningPlan(state: Partial<VocabularyStore>, plan: Pick<StudyPlan, 'id' | 'status' | 'completedAt' | 'target'> | undefined) {
  return Boolean(plan && ['pending', 'in_progress'].includes(plan.status) && !plan.completedAt
    && plan.target?.type === 'vocabulary' && plan.target.mode === 'learning-batch'
    && !plan.target.selectedMeanings?.length && !planningEvidenceView(state as Record<string, any>).vocabularySessions?.some((session: { planId?: string }) => session.planId === plan.id));
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
