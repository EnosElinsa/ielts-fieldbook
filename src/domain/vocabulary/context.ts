import { vocabularyTeaching, vocabularyTeachingRevision, type VocabularyContentScope } from './runtimeData';
import { catalogVocabularyEntry, catalogVocabularySenses, hasVocabularySenseEdits, reviewedEntry, VOCABULARY_CONTENT_VERSION } from './content';
import { applyVocabularyContentVariant, hasVocabularyReadinessDefault, markVocabularyContentScope, supplementVocabularySense, vocabularyReadinessBaselines } from './readiness';
import { vocabularyCurriculum, vocabularyCurriculumBaselines, type VocabularyCurriculum } from './curriculum';
import type { VocabularyEntry, VocabularySense } from './types';
import { normalizeVocabularyScope } from './identities';

const supplements = vocabularyTeaching.context;
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
const bindings = new Map<string,Binding>();
const unresolved = new Set<string>();
let revision = -1;
function ensureContexts() {
  if (revision === vocabularyTeachingRevision) return;
  revision = vocabularyTeachingRevision;
  bindings.clear(); unresolved.clear();
  for (const binding of supplements.bindings) bindings.set(key(binding), binding as Binding);
  for (const row of supplements.unresolved) unresolved.add(key(row));
}
function key(value: { bookId?: string; unitId?: string; entryId: string }) {
  return JSON.stringify([value.bookId, value.unitId, value.entryId]);
}

/** Pure display/task resolver. Explicit sense wins; group bindings never change learner data. */
export function resolveVocabularyLearningContext(entry: VocabularyEntry, request: VocabularyContextRequest = {}): ResolvedVocabularyLearningContext {
  request = normalizeVocabularyScope(request);
  ensureContexts();
  const route:VocabularyContentScope=request.bookId && request.unitId?{kind:'group',bookId:request.bookId,unitId:request.unitId}:request.senseId?{kind:'dictionary-source'}:{kind:'default'};
  const membershipKey = key({ ...request, entryId: entry.id });
  const membershipBinding = bindings.get(membershipKey);
  const binding = membershipBinding || (!hasVocabularyReadinessDefault(entry.id) ? supplements.defaults.find(item => item.entryId === entry.id) : undefined) as unknown as Binding | undefined;
  const fallback = reviewedEntry(entry);
  const selectedBinding = binding && (!request.senseId || Boolean(membershipBinding) && request.senseId === binding.sense.id) ? binding : undefined;
  // An explicit dictionary sense may not be in the learner's small catalog snapshot yet.
  const explicitSupplement = request.senseId ? [...supplements.bindings, ...supplements.defaults].find(item => item.entryId === entry.id && item.sense.id === request.senseId) : undefined;
  const existing = selectedBinding && entry.senses.find(item => item.id === selectedBinding.sense.id);
  const publicSenses = catalogVocabularySenses(entry.id);
  const catalogSense = selectedBinding && publicSenses.find(item => item.id === selectedBinding.sense.id);
  const userOverride = existing && hasVocabularySenseEdits(existing, [selectedBinding?.originalSense, catalogSense, selectedBinding?.sense, ...vocabularyReadinessBaselines(entry.id,existing.id)]);
  const explicitSaved = request.senseId && !request.bookId ? entry.senses.find(item=>item.id===request.senseId) : undefined;
  const selectedSense = (userOverride ? existing : selectedBinding?.sense) || (request.senseId ? explicitSaved || fallback.senses.find(item => item.id === request.senseId) || explicitSupplement?.sense : fallback.senses[0]);
  // Group teaching retains its context; a common default can receive a later same-sense review.
  const contextSource = selectedBinding || explicitSupplement;
  const scopedContext = Boolean(request.bookId && request.unitId && contextSource && 'bookId' in contextSource
    && contextSource.bookId === request.bookId && contextSource.unitId === request.unitId);
  const contextBaselines = contextSource ? [contextSource.sense, contextSource.originalSense].filter((s): s is VocabularySense => Boolean(s)) : [];
  let sense = selectedSense ? structuredClone(scopedContext ? selectedSense : supplementVocabularySense(entry.id,selectedSense,[...publicSenses.filter(s=>s.id===selectedSense.id),...contextBaselines],hasVocabularySenseEdits,route)) : undefined;
  const plan=vocabularyCurriculum(entry,request,sense || fallback.senses[0]);
  const publicChoices=plan?.curriculum.senses.map(candidate=>applyVocabularyContentVariant(entry.id,candidate,candidate,[candidate,...vocabularyCurriculumBaselines(entry.id,candidate.id)],()=>false,route));
  const choices=publicChoices?.map(candidate=>{
    const existing=entry.senses.find(item=>item.id===candidate.id);
    const baselines=[...publicSenses.filter(item=>item.id===candidate.id),...vocabularyCurriculumBaselines(entry.id,candidate.id),...vocabularyReadinessBaselines(entry.id,candidate.id),candidate];
    return existing && hasVocabularySenseEdits(existing,baselines)?existing:candidate;
  });
  const learnerPrimary=entry.senses[0];
  const publicEntry=catalogVocabularyEntry(entry.id);
  const publicBaseline=publicEntry || publicSenses.length ? reviewedEntry(publicEntry || {...entry,senses:publicSenses}) : undefined;
  const primaryBaselines=learnerPrimary ? [...(publicBaseline?.senses.filter(item=>item.id===learnerPrimary.id)||[]),...publicSenses.filter(item=>item.id===learnerPrimary.id),...vocabularyReadinessBaselines(entry.id,learnerPrimary.id),...vocabularyCurriculumBaselines(entry.id,learnerPrimary.id)] : [];
  const learnerEdited=learnerPrimary && (publicSenses.length && !primaryBaselines.length || hasVocabularySenseEdits(learnerPrimary,primaryBaselines));
  const curricular=request.senseId?(request.bookId && request.unitId?choices?.find(item=>item.id===request.senseId):undefined):!userOverride && !learnerEdited?choices?.[0]:undefined;
  if(curricular) sense=structuredClone(curricular);
  if(!request.senseId && learnerEdited) sense=structuredClone(learnerPrimary);
  // Curriculum/bindings may replace the earlier fallback. Repair only this final public selection.
  const selectedPublic=curricular?publicChoices?.find(item=>item.id===sense?.id):route.kind==='dictionary-source'?sense:selectedBinding?.sense || explicitSupplement?.sense || sense;
  if(sense && selectedPublic?.id===sense.id) {
    const known=[...publicSenses.filter(item=>item.id===sense!.id),...contextBaselines,...vocabularyCurriculumBaselines(entry.id,sense.id),...vocabularyReadinessBaselines(entry.id,sense.id)];
    sense=applyVocabularyContentVariant(entry.id,selectedPublic,sense,known,hasVocabularySenseEdits,route);
  }
  if(sense) markVocabularyContentScope(sense,route);
  const selectedCurriculumRow=plan?.rows.find(row=>row.sense.id===sense?.id);
  const curriculumEdited=Boolean(selectedCurriculumRow && sense && hasVocabularySenseEdits(sense,[selectedCurriculumRow.sense,...(publicChoices?.filter(item=>item.id===sense!.id)||[])]));
  const sourceConfirmed=Boolean(selectedCurriculumRow?.sectionId && selectedCurriculumRow.sentenceIds?.length && !curriculumEdited && !learnerEdited);
  const status: VocabularyContextStatus = sourceConfirmed ? 'reviewed' : selectedBinding && sense?.id===selectedBinding.sense.id && !userOverride && !learnerEdited && !curriculumEdited && (membershipBinding || !request.bookId) ? selectedBinding.status : unresolved.has(membershipKey) ? 'unresolved' : 'unreviewed';
  const resolved = sense ? { ...fallback, senses: [sense, ...(choices || []).filter(item=>item.id!==sense.id), ...fallback.senses.filter(item => item.id !== sense.id && !choices?.some(candidate=>candidate.id===item.id))] } : fallback;
  return {
    entry: resolved, sense, reviewed: status === 'reviewed', contentReviewed: Boolean((selectedBinding?.contentReviewed && sense?.id===selectedBinding.sense.id && !userOverride && !learnerEdited && !curriculumEdited) || curricular && selectedCurriculumRow && !curriculumEdited), status,
    ...(plan?{curriculum:{...plan.curriculum,senses:choices || plan.curriculum.senses}}:{}),
    ...(plan?{curriculumCurrent:Boolean(sense && plan.curriculum.senses.some(candidate=>candidate.id===sense.id) && !hasVocabularySenseEdits(sense,[...plan.curriculum.senses.filter(candidate=>candidate.id===sense.id),...(publicChoices?.filter(candidate=>candidate.id===sense.id)||[])]))}:{}),
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
