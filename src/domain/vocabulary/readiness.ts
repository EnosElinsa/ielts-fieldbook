import { vocabularyTeaching, vocabularyTeachingRevision, type ReadinessSupplement as Supplement, type ReadinessDefault as Default, type VocabularyLearningPriority, type VocabularyContentScope, vocabularyEditableSenseFields } from './runtimeData';
import type { VocabularyEntry, VocabularySense } from './types';

export const VOCABULARY_READINESS_VERSION = 'core-2026-10-21.11-defaults';
const identity = (entryId:string, senseId:string) => `${entryId}\u0000${senseId}`;
const core = new Map<string,Supplement>();
const additions = new Map<string,Supplement>();
const preferred = new Map<string,Default>();
const variants = new Map<string,Supplement[]>();
// Route provenance is transient: learner and immutable resource schemas stay unchanged.
const senseScopes = new WeakMap<VocabularySense,VocabularyContentScope>();
let revision = -1;
function ensureReadiness() {
 if (revision === vocabularyTeachingRevision) return;
 revision = vocabularyTeachingRevision;
 core.clear(); additions.clear(); preferred.clear(); variants.clear();
 for (const row of vocabularyTeaching.readiness.core) core.set(identity(row.entryId,row.senseId),row);
 for (const row of vocabularyTeaching.readiness.corrections) {
  const key=identity(row.entryId,row.senseId);
  if (row.variantId && row.contentVariant) variants.set(key,[...(variants.get(key)||[]),row]);
  else if (!row.variantId && !row.contentVariant) additions.set(key,row);
 }
 for (const row of vocabularyTeaching.readiness.defaults) preferred.set(row.entryId,row);
}
const editorial = {source:'Fieldbook core content review',license:'CC-BY-4.0',attribution:'Fieldbook editorial contributors'};


const sourceScope:VocabularyContentScope={kind:'dictionary-source'};
const defaultScope:VocabularyContentScope={kind:'default'};
const exactScope=(left:VocabularyContentScope,right:VocabularyContentScope)=>left.kind===right.kind && (left.kind!=='group' || right.kind==='group' && left.bookId===right.bookId && left.unitId===right.unitId);
function stableContent(value:unknown):unknown {
 if(Array.isArray(value)) return value.map(stableContent);
 if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,stableContent(item)]));
 return value;
}
/** Exact public matching preserves optional-field presence; saved-content comparison is separate. */
export function exactVocabularyContent(left:VocabularySense,right:VocabularySense):boolean {
 const snapshot=(sense:VocabularySense)=>Object.fromEntries((['id',...vocabularyEditableSenseFields] as const).filter(field=>Object.hasOwn(sense,field)).map(field=>[field,sense[field]]));
 return JSON.stringify(stableContent(snapshot(left)))===JSON.stringify(stableContent(snapshot(right)));
}
/** Account normalization trims text and deduplicates lists without changing meaning. */
function normalizedVocabularyContent(left:VocabularySense,right:VocabularySense):boolean {
 const normalize=(sense:VocabularySense)=>Object.fromEntries((['id',...vocabularyEditableSenseFields] as const).filter(field=>Object.hasOwn(sense,field)).map(field=>{
  const value=sense[field];
  return [field,Array.isArray(value)?[...new Set(value.map(item=>typeof item==='string'?item.trim():item).filter(Boolean))]:typeof value==='string'?value.trim():value];
 }));
 return JSON.stringify(stableContent(normalize(left)))===JSON.stringify(stableContent(normalize(right)));
}
function matchingVariant(entryId:string,sense:VocabularySense,scope:VocabularyContentScope|undefined,afterOnly=false):Supplement|undefined {
 const rows=(variants.get(identity(entryId,sense.id))||[]).filter(row=>row.contentVariant && (!scope || row.contentVariant.scopes.some(candidate=>exactScope(candidate,scope))) &&
  (normalizedVocabularyContent(sense,row.contentVariant.afterContent) || !afterOnly &&
   [row.contentVariant.beforeContent,...(row.previousSenses || [])].some(previous=>normalizedVocabularyContent(sense,previous))));
 return rows.length===1?rows[0]:undefined;
}
/** Metadata belongs to the complete final variant, never a source-pair sibling. */
function metadataRow(entryId:string,sense:VocabularySense,scope?:VocabularyContentScope):Supplement|undefined {
 if(sense.source==='Personal note') return;
 const variant=matchingVariant(entryId,sense,scope || senseScopes.get(sense),true);
 if(variant) return variant;
 const reference=matchingVariant(entryId,sense,scope || senseScopes.get(sense));
 if(reference?.meaningGroup || reference?.usageReference) return reference;
 const sourceReference=(variants.get(identity(entryId,sense.id))||[]).find(row=>(row.meaningGroup||row.usageReference) && row.contentVariant?.sourceView && (!scope || scope.kind==='dictionary-source') && [row.originalSense,...(row.previousSenses||[])].some(original=>original && exactVocabularyContent(sense,original)));
 if(sourceReference) return sourceReference;
 const legacy=additions.get(identity(entryId,sense.id)) || core.get(identity(entryId,sense.id));
 // A final variant on another route cannot inherit legacy source metadata.
 if((variants.get(identity(entryId,sense.id))||[]).some(row=>row.contentVariant && exactVocabularyContent(sense,row.contentVariant.afterContent))) return;
 return legacy;
}
export function markVocabularyContentScope<T extends VocabularySense>(sense:T,scope:VocabularyContentScope):T {
 senseScopes.set(sense,scope); return sense;
}
/** Called only after the actual public source/default/group content has been selected. */
export function applyVocabularyContentVariant(entryId:string,publicSense:VocabularySense,learnerSense:VocabularySense,baselines:VocabularySense[],edited:(sense:VocabularySense,baselines:VocabularySense[])=>boolean,scope:VocabularyContentScope):VocabularySense {
 ensureReadiness();
 const row=matchingVariant(entryId,publicSense,scope);
 if(!row?.contentVariant || learnerSense.id!==publicSense.id) return markVocabularyContentScope({...learnerSense},scope);
 const known=[...baselines,...vocabularyReadinessBaselines(entryId,publicSense.id)].filter(sense=>sense.id===learnerSense.id);
 if(edited(learnerSense,known)) return markVocabularyContentScope({...learnerSense},scope);
 // Replace the whole editable snapshot: absent optional teaching stays absent.
 const result={...learnerSense,...publicSense};
 for(const field of vocabularyEditableSenseFields) delete (result as unknown as Record<string,unknown>)[field];
 return markVocabularyContentScope({...result,...row.contentVariant.afterContent,editorial},scope);
}

const learningPriorities = new Set<VocabularyLearningPriority>(['general', 'specialist', 'historical', 'proper-name']);
/** Editorial learning scope applies only to this exact public meaning, never to mastery. */
export function getVocabularyLearningPriority(entryId: string, sense: VocabularySense): VocabularyLearningPriority | undefined {
 ensureReadiness();
 const row = metadataRow(entryId,sense);
 if (!row?.learningPriority || !learningPriorities.has(row.learningPriority) || sense.source === 'Personal note' ||
  row.definition !== sense.definition || (row.pos || row.originalSense?.pos) !== sense.pos ||
  isVocabularyPracticeReference(entryId, sense)) return undefined;
 return row.learningPriority;
}

/** Restored meanings require a raw parent or entry-identity anchor in this catalogue entry. */
export function restoredDictionarySenses(entryId: string, sourceIds: Set<string>): VocabularySense[] {
 ensureReadiness();
 return [...additions.values()].filter(row => {
  const anchor = row.dictionaryParentSenseId || row.dictionarySourceAnchorSenseId;
  return row.entryId === entryId && anchor && !(row.dictionaryParentSenseId && row.dictionarySourceAnchorSenseId) && sourceIds.has(anchor) && row.originalSense?.id === row.senseId;
 }).map(row => row.originalSense!);
}

/** A frozen restored meaning must belong to this entry and an exact released public baseline. */
export function isRegisteredRestoredVocabularySense(entryId: string, sense: VocabularySense): boolean {
 ensureReadiness();
 const row = additions.get(identity(entryId,sense.id));
 if (!(row?.dictionaryParentSenseId || row?.dictionarySourceAnchorSenseId) || (row.dictionaryParentSenseId && row.dictionarySourceAnchorSenseId) || row.originalSense?.id !== sense.id || sense.source === 'Personal note') return false;
 return [row.originalSense, ...(row.previousSenses || []), { definition: row.definition, pos: row.pos || row.originalSense.pos }]
  .some(baseline => baseline.definition === sense.definition && baseline.pos === sense.pos);
}

export function vocabularyReadinessBaselines(entryId:string,senseId:string):VocabularySense[] {
 ensureReadiness();
 const selected=preferred.get(entryId);
 const row=additions.get(identity(entryId,senseId)) || core.get(identity(entryId,senseId));
 return [selected?.sense.id===senseId?selected.sense:undefined,selected?.originalSense?.id===senseId?selected.originalSense:undefined,row?.originalSense?.id===senseId?row.originalSense:undefined,...(row?.previousSenses || []).filter(sense=>sense.id===senseId),...(variants.get(identity(entryId,senseId))||[]).flatMap(item=>[item.originalSense,...(item.previousSenses||[]),item.contentVariant?.beforeContent,item.contentVariant?.afterContent]).filter((sense):sense is VocabularySense=>Boolean(sense && sense.id===senseId))].filter((sense):sense is VocabularySense=>Boolean(sense));
}

/** A full dictionary review can replace an older common default, independent of group teaching. */
export function hasVocabularyReadinessDefault(entryId: string): boolean {
 ensureReadiness();
 return preferred.has(entryId);
}

/** Exact public teaching can supersede common tasks even in a snapshot without optional notes. */
export function hasVocabularyReadinessContext(entryId: string, sense: VocabularySense): boolean {
 ensureReadiness();
 const row = metadataRow(entryId,sense);
 return Boolean(row && sense.source !== 'Personal note' && row.definition === sense.definition &&
  (row.pos || row.originalSense?.pos) === sense.pos && row.example === sense.example);
}

/** Review of these notes is independent of whether a wordbook's source meaning is confirmed. */
export function hasVocabularyReadinessNotes(entryId: string, sense: VocabularySense): boolean {
 ensureReadiness();
 if (isVocabularyMeaningGroup(entryId, sense) || isVocabularyUsageReference(entryId, sense)) return false;
 const row = metadataRow(entryId,sense);
 return Boolean(row?.collocations?.length && row.distinctions?.length && row.definition === sense.definition &&
  (row.pos || row.originalSense?.pos) === sense.pos && JSON.stringify(row.collocations) === JSON.stringify(sense.collocations) && JSON.stringify(row.distinctions) === JSON.stringify(sense.distinctions));
}

/** Example type belongs to exact public text; a learner's replacement is independent. */
export function isVocabularyReadingNote(entryId: string, sense: VocabularySense): boolean {
 ensureReadiness();
 const row = metadataRow(entryId,sense);
 return Boolean(row?.exampleKind === 'reading-note' && sense.source !== 'Personal note' &&
  row.definition === sense.definition && row.example === sense.example &&
  (row.pos || row.originalSense?.pos) === sense.pos);
}

/** Editorial spelling-error records stay readable without teaching the error as a valid meaning. */
export function isVocabularySpellingReference(entryId: string, sense: VocabularySense): boolean {
 ensureReadiness();
 const row = metadataRow(entryId,sense);
 if (!row?.referenceOnly || sense.source === 'Personal note') return false;
 return [{ definition: row.definition, pos: row.pos || row.originalSense?.pos }, row.originalSense, ...(row.previousSenses || [])]
  .some(baseline => baseline?.definition === sense.definition && baseline.pos === sense.pos);
}

/** Source organisation headings remain readable, but are not individual learning meanings. */
export function isVocabularyMeaningGroup(entryId: string, sense: VocabularySense): boolean {
 ensureReadiness();
 const row = metadataRow(entryId,sense);
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
 const row = metadataRow(entryId,sense);
 if (!row?.usageReference || sense.source === 'Personal note') return false;
 return [{ definition: row.definition, pos: row.pos || row.originalSense?.pos }, row.originalSense, ...(row.previousSenses || [])]
  .some(baseline => baseline?.definition === sense.definition && baseline.pos === sense.pos);
}

/** Public content only. A caller supplies historical public baselines to protect personal edits. */
function supplementLegacyVocabularySense(entryId:string, sense:VocabularySense, baselines:VocabularySense[], edited:(sense:VocabularySense, baselines:VocabularySense[])=>boolean):VocabularySense {
 ensureReadiness();
 const key=identity(entryId,sense.id);
 const missing=core.get(key), addition=additions.get(key);
 if (!missing && !addition) return sense;
 const row=addition || missing!;
 // Public courses can reuse a source ID for distinct lexical teaching.
 // A directory correction applies only to recognised directory content.
 if (row.meaningGroup && !isVocabularyMeaningGroup(entryId,sense)) return sense;
 // Focused repairs name the public text they reviewed. A shared source ID
 // alone cannot authorise replacing another course's definition or example.
 if (row.contentScope && !row.contentScope.some(scope =>
  scope.definition === sense.definition && scope.example === sense.example && scope.pos === sense.pos ||
  (row.definition || scope.definition) === sense.definition && row.example === sense.example && (row.pos || scope.pos) === sense.pos
 )) return sense;
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

/** Old source call sites default to dictionary-source; learning resolvers supply their route. */
export function supplementVocabularySense(entryId:string,sense:VocabularySense,baselines:VocabularySense[],edited:(sense:VocabularySense,baselines:VocabularySense[])=>boolean,scope:VocabularyContentScope=sourceScope,publicSense:VocabularySense=sense):VocabularySense {
 const known=[...baselines,...vocabularyReadinessBaselines(entryId,sense.id)];
 // Re-resolution of a reviewed snapshot must not replay older legacy fields over it.
 if(matchingVariant(entryId,publicSense,scope,true)) return applyVocabularyContentVariant(entryId,publicSense,sense,known,edited,scope);
 const selected=supplementLegacyVocabularySense(entryId,publicSense,known,()=>false);
 const learner=supplementLegacyVocabularySense(entryId,sense,known,edited);
 // The input can be a learner edit. Only the matched public selection may
 // extend its baselines; the learner cannot authorize its own replacement.
 return applyVocabularyContentVariant(entryId,selected,learner,[...known,selected],edited,scope);
}

export function applyVocabularyReadiness(entry:VocabularyEntry, originals:VocabularySense[], edited:(sense:VocabularySense,baselines:VocabularySense[])=>boolean):VocabularyEntry {
 ensureReadiness();
 const candidate=preferred.get(entry.id);
 let senses=entry.senses;
 if (!candidate && !senses.some(s=>core.has(identity(entry.id,s.id)) || additions.has(identity(entry.id,s.id)) || variants.has(identity(entry.id,s.id)))) return entry;
 const learnerPrimary=senses[0];
 if (candidate) {
  const primaryBaselines=learnerPrimary ? originals.filter(s=>s.id===learnerPrimary.id) : [];
  if (learnerPrimary) primaryBaselines.push(...vocabularyReadinessBaselines(entry.id,learnerPrimary.id));
  if (candidate.sense.id===learnerPrimary?.id) primaryBaselines.push(candidate.sense,...(candidate.originalSense ? [candidate.originalSense]:[]));
  const completeBaselines=[...primaryBaselines,...primaryBaselines.map(s=>supplementVocabularySense(entry.id,s,[s],()=>false,defaultScope))];
  if (learnerPrimary && edited(learnerPrimary,completeBaselines)) return {...entry,meaning:learnerPrimary.definition || entry.meaning,example:learnerPrimary.example || entry.example};
  const existing=senses.find(sense=>sense.id===candidate.sense.id);
  const baseline=[candidate.originalSense,candidate.sense,...originals.filter(s=>s.id===candidate.sense.id),...vocabularyReadinessBaselines(entry.id,candidate.sense.id)].filter((s):s is VocabularySense=>Boolean(s));
  const selected=existing && edited(existing,baseline) ? existing : candidate.sense;
  senses=[selected,...senses.filter(sense=>sense.id!==selected.id)];
 }
 senses=senses.map(sense=>{
  const known=[...originals.filter(s=>s.id===sense.id),...(candidate?.sense.id===sense.id ? [candidate.sense] : []),...vocabularyReadinessBaselines(entry.id,sense.id)];
  const publicSense=candidate?.sense.id===sense.id?candidate.sense:known.find(item=>!edited(sense,[item])) || sense;
  return supplementVocabularySense(entry.id,sense,known,edited,defaultScope,publicSense);
 });
 const primary=senses[0];
 return {...entry,senses,meaning:primary?.definition || entry.meaning,example:primary?.example || entry.example,enrichmentPending:senses.every(s=>!s.definition)};
}
