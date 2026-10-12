import supplements from './contextSenseOverlay.json';
import { catalogVocabularyEntry, hasVocabularySenseEdits, reviewedEntry, VOCABULARY_CONTENT_VERSION } from './content';
import { supplementVocabularySense, vocabularyReadinessBaselines } from './readiness';
import { vocabularyCurriculum, vocabularyCurriculumBaselines, type VocabularyCurriculum } from './curriculum';
import type { VocabularyEntry, VocabularySense } from './types';

export const VOCABULARY_CONTEXT_VERSION = `${supplements.version}/curriculum-2026-10-12.1`;
export type VocabularyContextStatus = 'reviewed' | 'unresolved' | 'unreviewed';
/** Frozen identity and provenance of the content selected for a question. */
export type VocabularyLearningContext = {
  entryId: string; senseId: string; bookId?: string; unitId?: string;
  version: string; status: VocabularyContextStatus;
};
export type VocabularyContextRequest = { bookId?: string; unitId?: string; senseId?: string };
export type ResolvedVocabularyLearningContext = {
  entry: VocabularyEntry; sense: VocabularySense | undefined; reviewed: boolean;
  contentReviewed: boolean;
  status: VocabularyContextStatus; context: VocabularyLearningContext | undefined; contentVersion: string;
  curriculum?: VocabularyCurriculum;
  curriculumCurrent?: boolean;
};
type Binding = { bookId: string; unitId: string; entryId: string; sense: VocabularySense; originalSense?: VocabularySense | null; status: VocabularyContextStatus; contentReviewed: boolean };
const bindings = new Map((supplements.bindings as Binding[]).map(binding => [key(binding), binding]));
const unresolved = new Set(supplements.unresolved.map(key));
function key(value: { bookId?: string; unitId?: string; entryId: string }) {
  return JSON.stringify([value.bookId, value.unitId, value.entryId]);
}

/** Pure display/task resolver. Explicit sense wins; group bindings never change learner data. */
export function resolveVocabularyLearningContext(entry: VocabularyEntry, request: VocabularyContextRequest = {}): ResolvedVocabularyLearningContext {
  const membershipKey = key({ ...request, entryId: entry.id });
  const membershipBinding = bindings.get(membershipKey);
  const binding = membershipBinding || supplements.defaults.find(item => item.entryId === entry.id) as unknown as Binding | undefined;
  const fallback = reviewedEntry(entry);
  const selectedBinding = binding && (!request.senseId || request.senseId === binding.sense.id) ? binding : undefined;
  // An explicit dictionary sense may not be in the learner's small catalog snapshot yet.
  const explicitSupplement = request.senseId ? [...supplements.bindings, ...supplements.defaults].find(item => item.entryId === entry.id && item.sense.id === request.senseId) : undefined;
  const existing = selectedBinding && entry.senses.find(item => item.id === selectedBinding.sense.id);
  const catalogSense = selectedBinding && catalogVocabularyEntry(entry.id)?.senses.find(item => item.id === selectedBinding.sense.id);
  const userOverride = existing && hasVocabularySenseEdits(existing, [selectedBinding?.originalSense, catalogSense, selectedBinding?.sense]);
  const selectedSense = (userOverride ? existing : selectedBinding?.sense) || (request.senseId ? fallback.senses.find(item => item.id === request.senseId) || explicitSupplement?.sense : fallback.senses[0]);
  // The more specific reviewed group binding takes precedence over a common-content patch.
  let sense = selectedSense ? structuredClone(selectedBinding || explicitSupplement ? selectedSense : supplementVocabularySense(entry.id,selectedSense,[catalogVocabularyEntry(entry.id)?.senses.find(s=>s.id===selectedSense.id)].filter((s):s is VocabularySense=>Boolean(s)),hasVocabularySenseEdits)) : undefined;
  const plan=vocabularyCurriculum(entry,request,sense || fallback.senses[0]);
  const choices=plan?.curriculum.senses.map(candidate=>{
    const existing=entry.senses.find(item=>item.id===candidate.id);
    const baselines=[catalogVocabularyEntry(entry.id)?.senses.find(item=>item.id===candidate.id),...vocabularyCurriculumBaselines(entry.id,candidate.id)].filter((s):s is VocabularySense=>Boolean(s));
    return existing && hasVocabularySenseEdits(existing,baselines)?existing:candidate;
  });
  const learnerPrimary=entry.senses[0];
  const publicEntry=catalogVocabularyEntry(entry.id);
  const publicBaseline=publicEntry ? reviewedEntry(publicEntry) : undefined;
  const primaryBaselines=learnerPrimary ? [...(publicBaseline?.senses.filter(item=>item.id===learnerPrimary.id)||[]),publicEntry?.senses.find(item=>item.id===learnerPrimary.id),...vocabularyReadinessBaselines(entry.id,learnerPrimary.id),...vocabularyCurriculumBaselines(entry.id,learnerPrimary.id)].filter((s):s is VocabularySense=>Boolean(s)) : [];
  const learnerEdited=learnerPrimary && (publicEntry && !primaryBaselines.length || hasVocabularySenseEdits(learnerPrimary,primaryBaselines));
  const curricular=request.senseId?choices?.find(item=>item.id===request.senseId):!userOverride && !learnerEdited?choices?.[0]:undefined;
  if(curricular) sense=structuredClone(curricular);
  if(!request.senseId && learnerEdited) sense=structuredClone(learnerPrimary);
  const selectedCurriculumRow=plan?.rows.find(row=>row.sense.id===sense?.id);
  const curriculumEdited=Boolean(selectedCurriculumRow && sense && hasVocabularySenseEdits(sense,[selectedCurriculumRow.sense]));
  const sourceConfirmed=Boolean(selectedCurriculumRow?.sectionId && selectedCurriculumRow.sentenceIds?.length && !curriculumEdited && !learnerEdited);
  const status: VocabularyContextStatus = sourceConfirmed ? 'reviewed' : selectedBinding && sense?.id===selectedBinding.sense.id && !userOverride && !learnerEdited && !curriculumEdited && (membershipBinding || !request.bookId) ? selectedBinding.status : unresolved.has(membershipKey) ? 'unresolved' : 'unreviewed';
  const resolved = sense ? { ...fallback, senses: [sense, ...(choices || []).filter(item=>item.id!==sense.id), ...fallback.senses.filter(item => item.id !== sense.id && !choices?.some(candidate=>candidate.id===item.id))] } : fallback;
  return {
    entry: resolved, sense, reviewed: status === 'reviewed', contentReviewed: Boolean((selectedBinding?.contentReviewed && sense?.id===selectedBinding.sense.id && !userOverride && !learnerEdited && !curriculumEdited) || curricular && selectedCurriculumRow && !curriculumEdited), status,
    ...(plan?{curriculum:{...plan.curriculum,senses:choices || plan.curriculum.senses}}:{}),
    ...(plan?{curriculumCurrent:Boolean(sense && plan.curriculum.senses.some(candidate=>candidate.id===sense.id) && !hasVocabularySenseEdits(sense,plan.curriculum.senses.filter(candidate=>candidate.id===sense.id)))}:{}),
    context: sense ? { entryId: entry.id, senseId: sense.id, ...(request.bookId ? { bookId: request.bookId } : {}), ...(request.unitId ? { unitId: request.unitId } : {}), version: VOCABULARY_CONTEXT_VERSION, status } : undefined,
    contentVersion: `${VOCABULARY_CONTENT_VERSION}/${VOCABULARY_CONTEXT_VERSION}`,
  };
}

/** Validate shape and card identity without consulting today's manifest (old versions stay valid). */
export function isVocabularyLearningContext(value: unknown, identity?: { entryId: string; senseId: string }): value is VocabularyLearningContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 500 && !['__proto__', 'prototype', 'constructor'].includes(v);
  return id(input.entryId) && id(input.senseId) && typeof input.version === 'string' && input.version.trim().length > 0 && input.version.length <= 100 && ['reviewed', 'unresolved', 'unreviewed'].includes(String(input.status))
    && (input.bookId === undefined || id(input.bookId)) && (input.unitId === undefined || id(input.unitId) && id(input.bookId))
    && (!identity || input.entryId === identity.entryId && input.senseId === identity.senseId)
    && Object.keys(input).every(name => ['entryId', 'senseId', 'bookId', 'unitId', 'version', 'status'].includes(name));
}
