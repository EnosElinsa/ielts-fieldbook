import { vocabularyTeaching, vocabularyTeachingRevision, type ReadinessSupplement as Supplement, type ReadinessDefault as Default, type VocabularyLearningPriority } from './runtimeData';
import type { VocabularyEntry, VocabularySense } from './types';

export const VOCABULARY_READINESS_VERSION = 'core-2026-10-18.1';
const identity = (entryId:string, senseId:string) => `${entryId}\u0000${senseId}`;
const core = new Map<string,Supplement>();
const additions = new Map<string,Supplement>();
const preferred = new Map<string,Default>();
let revision = -1;
function ensureReadiness() {
 if (revision === vocabularyTeachingRevision) return;
 revision = vocabularyTeachingRevision;
 core.clear(); additions.clear(); preferred.clear();
 for (const row of vocabularyTeaching.readiness.core) core.set(identity(row.entryId,row.senseId),row);
 for (const row of vocabularyTeaching.readiness.corrections) additions.set(identity(row.entryId,row.senseId),row);
 for (const row of vocabularyTeaching.readiness.defaults) preferred.set(row.entryId,row);
}
const editorial = {source:'Fieldbook core content review',license:'CC-BY-4.0',attribution:'Fieldbook editorial contributors'};

const learningPriorities = new Set<VocabularyLearningPriority>(['general', 'specialist', 'historical', 'proper-name']);
/** Editorial learning scope applies only to this exact public meaning, never to mastery. */
export function getVocabularyLearningPriority(entryId: string, sense: VocabularySense): VocabularyLearningPriority | undefined {
 ensureReadiness();
 const row = additions.get(identity(entryId, sense.id)) || core.get(identity(entryId, sense.id));
 if (!row?.learningPriority || !learningPriorities.has(row.learningPriority) || sense.source === 'Personal note' ||
  row.definition !== sense.definition || (row.pos || row.originalSense?.pos) !== sense.pos ||
  isVocabularyPracticeReference(entryId, sense)) return undefined;
 return row.learningPriority;
}

/** Restored child meanings belong only to their catalogue entry and source parent. */
export function restoredDictionarySenses(entryId: string, sourceIds: Set<string>): VocabularySense[] {
 ensureReadiness();
 return [...additions.values()].filter(row => row.entryId === entryId && row.dictionaryParentSenseId && sourceIds.has(row.dictionaryParentSenseId) && row.originalSense?.id === row.senseId).map(row => row.originalSense!);
}

/** A frozen restored meaning must belong to this entry and an exact released public baseline. */
export function isRegisteredRestoredVocabularySense(entryId: string, sense: VocabularySense): boolean {
 ensureReadiness();
 const row = additions.get(identity(entryId, sense.id));
 if (!row?.dictionaryParentSenseId || row.originalSense?.id !== sense.id || sense.source === 'Personal note') return false;
 return [row.originalSense, ...(row.previousSenses || []), { definition: row.definition, pos: row.pos || row.originalSense.pos }]
  .some(baseline => baseline.definition === sense.definition && baseline.pos === sense.pos);
}

export function vocabularyReadinessBaselines(entryId:string,senseId:string):VocabularySense[] {
 ensureReadiness();
 const selected=preferred.get(entryId);
 const row=additions.get(identity(entryId,senseId)) || core.get(identity(entryId,senseId));
 return [selected?.sense.id===senseId?selected.sense:undefined,selected?.originalSense?.id===senseId?selected.originalSense:undefined,row?.originalSense?.id===senseId?row.originalSense:undefined,...(row?.previousSenses || []).filter(sense=>sense.id===senseId)].filter((sense):sense is VocabularySense=>Boolean(sense));
}

/** Review of these notes is independent of whether a wordbook's source meaning is confirmed. */
export function hasVocabularyReadinessNotes(entryId: string, sense: VocabularySense): boolean {
 ensureReadiness();
 if (isVocabularyMeaningGroup(entryId, sense) || isVocabularyUsageReference(entryId, sense)) return false;
 const row = additions.get(identity(entryId, sense.id)) || core.get(identity(entryId, sense.id));
 return Boolean(row?.collocations?.length && row.distinctions?.length && row.definition === sense.definition &&
  (row.pos || row.originalSense?.pos) === sense.pos && JSON.stringify(row.collocations) === JSON.stringify(sense.collocations) && JSON.stringify(row.distinctions) === JSON.stringify(sense.distinctions));
}

/** Example type belongs to exact public text; a learner's replacement is independent. */
export function isVocabularyReadingNote(entryId: string, sense: VocabularySense): boolean {
 ensureReadiness();
 const row = additions.get(identity(entryId, sense.id)) || core.get(identity(entryId, sense.id));
 return Boolean(row?.exampleKind === 'reading-note' && sense.source !== 'Personal note' &&
  row.definition === sense.definition && row.example === sense.example &&
  (row.pos || row.originalSense?.pos) === sense.pos);
}

/** Editorial spelling-error records stay readable without teaching the error as a valid meaning. */
export function isVocabularySpellingReference(entryId: string, sense: VocabularySense): boolean {
 ensureReadiness();
 const row = additions.get(identity(entryId, sense.id));
 if (!row?.referenceOnly || sense.source === 'Personal note') return false;
 return [{ definition: row.definition, pos: row.pos || row.originalSense?.pos }, row.originalSense, ...(row.previousSenses || [])]
  .some(baseline => baseline?.definition === sense.definition && baseline.pos === sense.pos);
}

/** Source organisation headings remain readable, but are not individual learning meanings. */
export function isVocabularyMeaningGroup(entryId: string, sense: VocabularySense): boolean {
 ensureReadiness();
 const row = additions.get(identity(entryId, sense.id));
 if (!row?.meaningGroup || sense.source === 'Personal note') return false;
 return [{ definition: row.definition, pos: row.pos || row.originalSense?.pos }, row.originalSense, ...(row.previousSenses || [])]
  .some(baseline => baseline?.definition === sense.definition && baseline.pos === sense.pos);
}

export function isVocabularyPracticeReference(entryId: string, sense: VocabularySense): boolean {
 return isVocabularySpellingReference(entryId, sense) || isVocabularyMeaningGroup(entryId, sense) || isVocabularyUsageReference(entryId, sense);
}

/** A source list of phrases is useful reading guidance, not a lexical meaning to rehearse. */
export function isVocabularyUsageReference(entryId: string, sense: VocabularySense): boolean {
 ensureReadiness();
 const row = additions.get(identity(entryId, sense.id));
 if (!row?.usageReference || sense.source === 'Personal note') return false;
 return [{ definition: row.definition, pos: row.pos || row.originalSense?.pos }, row.originalSense, ...(row.previousSenses || [])]
  .some(baseline => baseline?.definition === sense.definition && baseline.pos === sense.pos);
}

/** Public content only. A caller supplies historical public baselines to protect personal edits. */
export function supplementVocabularySense(entryId:string, sense:VocabularySense, baselines:VocabularySense[], edited:(sense:VocabularySense, baselines:VocabularySense[])=>boolean):VocabularySense {
 ensureReadiness();
 const key=identity(entryId,sense.id);
 const missing=core.get(key), addition=additions.get(key);
 if (!missing && !addition) return sense;
 const row=addition || missing!;
 const supplemented:VocabularySense={...sense,
  ...(row.definition ? {definition:row.definition}:{}),
  ...(row.pos ? {pos:row.pos}:{}),example:row.example,
  ...(row.usage !== undefined ? {usage:row.usage}:{}),
  ...(row.collocations ? {collocations:row.collocations}:{}),
  ...(row.distinctions ? {distinctions:row.distinctions}:{}),
  ...(row.distinctionTask ? {distinctionTask:row.distinctionTask}:{}),
  ...Object.fromEntries((['synonyms','antonyms','wordFamily','register'] as const).filter(field => row[field] !== undefined).map(field => [field,row[field]])),
  ...(missing ? {source:'Fieldbook editorial',license:'CC-BY-4.0',attribution:editorial.attribution}:{}),
  editorial,
 };
 const pending:VocabularySense | undefined=missing ? {id:sense.id,definition:'',example:'',pos:'expression'} : undefined;
 return edited(sense,[...baselines,...(pending ? [pending]:[]),...(row.originalSense ? [row.originalSense]:[]),...(row.previousSenses || []).filter(item=>item.id===sense.id),supplemented]) ? sense : supplemented;
}

export function applyVocabularyReadiness(entry:VocabularyEntry, originals:VocabularySense[], edited:(sense:VocabularySense,baselines:VocabularySense[])=>boolean):VocabularyEntry {
 ensureReadiness();
 const candidate=preferred.get(entry.id);
 let senses=entry.senses;
 if (!candidate && !senses.some(s=>core.has(identity(entry.id,s.id)) || additions.has(identity(entry.id,s.id)))) return entry;
 const learnerPrimary=senses[0];
 if (candidate) {
  const primaryBaselines=learnerPrimary ? originals.filter(s=>s.id===learnerPrimary.id) : [];
  if (learnerPrimary) primaryBaselines.push(...vocabularyReadinessBaselines(entry.id,learnerPrimary.id));
  if (candidate.sense.id===learnerPrimary?.id) primaryBaselines.push(candidate.sense,...(candidate.originalSense ? [candidate.originalSense]:[]));
  const completeBaselines=[...primaryBaselines,...primaryBaselines.map(s=>supplementVocabularySense(entry.id,s,[s],()=>false))];
  if (learnerPrimary && edited(learnerPrimary,completeBaselines)) return {...entry,meaning:learnerPrimary.definition || entry.meaning,example:learnerPrimary.example || entry.example};
  const existing=senses.find(sense=>sense.id===candidate.sense.id);
  const baseline=[candidate.originalSense,candidate.sense,...originals.filter(s=>s.id===candidate.sense.id)].filter((s):s is VocabularySense=>Boolean(s));
  const selected=existing && edited(existing,baseline) ? existing : candidate.sense;
  senses=[selected,...senses.filter(sense=>sense.id!==selected.id)];
 }
 senses=senses.map(sense=>supplementVocabularySense(entry.id,sense,[...originals.filter(s=>s.id===sense.id),...(candidate?.sense.id===sense.id ? [candidate.sense] : [])],edited));
 const primary=senses[0];
 return {...entry,senses,meaning:primary?.definition || entry.meaning,example:primary?.example || entry.example,enrichmentPending:senses.every(s=>!s.definition)};
}
