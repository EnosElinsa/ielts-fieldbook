import { vocabularyTeaching, vocabularyTeachingRevision, type ReadinessSupplement as Supplement, type ReadinessDefault as Default } from './runtimeData';
import type { VocabularyEntry, VocabularySense } from './types';

export const VOCABULARY_READINESS_VERSION = 'core-2026-10-11.1';
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

export function vocabularyReadinessBaselines(entryId:string,senseId:string):VocabularySense[] {
 ensureReadiness();
 const selected=preferred.get(entryId);
 const row=additions.get(identity(entryId,senseId)) || core.get(identity(entryId,senseId));
 return [selected?.sense.id===senseId?selected.sense:undefined,selected?.originalSense?.id===senseId?selected.originalSense:undefined,row?.originalSense?.id===senseId?row.originalSense:undefined].filter((sense):sense is VocabularySense=>Boolean(sense));
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
  ...(row.usage ? {usage:row.usage}:{}),
  ...(missing ? {source:'Fieldbook editorial',license:'CC-BY-4.0',attribution:editorial.attribution}:{}),
  editorial,
 };
 const pending:VocabularySense | undefined=missing ? {id:sense.id,definition:'',example:'',pos:'expression'} : undefined;
 return edited(sense,[...baselines,...(pending ? [pending]:[]),...(row.originalSense ? [row.originalSense]:[]),supplemented]) ? sense : supplemented;
}

export function applyVocabularyReadiness(entry:VocabularyEntry, originals:VocabularySense[], edited:(sense:VocabularySense,baselines:VocabularySense[])=>boolean):VocabularyEntry {
 ensureReadiness();
 const candidate=preferred.get(entry.id);
 let senses=entry.senses;
 if (!candidate && !senses.some(s=>core.has(identity(entry.id,s.id)) || additions.has(identity(entry.id,s.id)))) return entry;
 const learnerPrimary=senses[0];
 if (candidate) {
  const primaryBaselines=learnerPrimary ? originals.filter(s=>s.id===learnerPrimary.id) : [];
  const originalAddition=learnerPrimary ? additions.get(identity(entry.id,learnerPrimary.id))?.originalSense : undefined;
  if (originalAddition) primaryBaselines.push(originalAddition);
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
