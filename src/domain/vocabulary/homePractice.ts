import type {ReviewCard,VocabularyEntry,VocabularyEvidence,VocabularySense,VocabularyState,VocabularyStore} from './types';
import {getVocabularyNextPractice,type VocabularyNextPractice} from './nextPractice';
import {getDueVocabularyReviewQueue} from './progress';
import {resolveVocabularyLearningContext} from './context';
import type {VocabularySessionRecord} from './session';

export type SavedMeaningPractice = {entry: VocabularyEntry; sense: VocabularySense; recommendation: VocabularyNextPractice};
export type VocabularyHomePractice = {practice?: SavedMeaningPractice; dueCards: ReviewCard[]; nextChangeAt?: string};

/** Account-wide selection uses only explicit saved meanings; public defaults cannot add candidates. */
export function getVocabularyHomePractice(store: Partial<VocabularyStore>, at: string | Date = new Date()): VocabularyHomePractice {
  const now = new Date(at).getTime();
  if (!Number.isFinite(now)) return {dueCards:[]};
  const entries = (store.vocabulary || []).filter(entry=>!entry.tags.includes('archived'));
  const scopes = new Map(entries.map(entry=>[entry.id,{
    entry, senses:new Set(entry.senses.map(sense=>sense.id)),
    states:new Map<string,VocabularyState>(), events:new Map<string,VocabularyEvidence[]>(),
    sessions:new Map<string,VocabularySessionRecord[]>(),
  }]));
  for (const row of store.vocabularyStates || []) {
    const scope = scopes.get(row.entryId);
    if (scope?.senses.has(row.senseId) && !scope.states.has(row.senseId)) scope.states.set(row.senseId,row);
  }
  for (const event of store.vocabularyEvidence || []) {
    const scope = scopes.get(event.entryId), senseId = event.senseId || scope?.entry.senses[0]?.id;
    if (!scope || !senseId || !scope.senses.has(senseId)) continue;
    const events = scope.events.get(senseId) || [];
    events.push(event); scope.events.set(senseId,events);
  }
  for (const session of store.vocabularySessions || []) {
    const seen=new Set<string>();
    for (const row of session.results) {
      const scope=scopes.get(row.entryId),key=`${row.entryId}:${row.senseId}`;
      if (!scope?.senses.has(row.senseId) || seen.has(key)) continue;
      seen.add(key);
      const sessions=scope.sessions.get(row.senseId) || [];
      sessions.push(session);scope.sessions.set(row.senseId,sessions);
    }
  }
  const ready: SavedMeaningPractice[] = [], waiting: SavedMeaningPractice[] = [];
  let nextChange = Infinity;
  for (const {entry,states,events,sessions} of scopes.values()) {
    for (const senseId of new Set(entry.senses.map(sense=>sense.id))) {
      const state = states.get(senseId);
      // Keep the saved primary in vocabulary for legacy evidence without a sense ID.
      const snapshot = {vocabulary:[entry],vocabularyStates:state?[state]:[],vocabularyEvidence:events.get(senseId)||[],vocabularySessions:sessions.get(senseId)||[]};
      const recommendation = getVocabularyNextPractice(snapshot,entry,{senseId,now:new Date(now)});
      if (!recommendation) continue;
      const resolved = resolveVocabularyLearningContext(entry,{senseId});
      if (!resolved.sense || resolved.sense.id!==senseId) continue;
      const candidate = {entry:resolved.entry,sense:resolved.sense,recommendation};
      (recommendation.status==='ready'?ready:waiting).push(candidate);
      if (recommendation.nextChangeAt) nextChange = Math.min(nextChange,Date.parse(recommendation.nextChangeAt));
    }
  }
  const priority = {error:0,recovery:1,due:2,missing:3,production:4,spaced:5};
  ready.sort((a,b)=>priority[a.recommendation.reason]-priority[b.recommendation.reason]
    || (Date.parse(a.recommendation.dueAt || '') || now)-(Date.parse(b.recommendation.dueAt || '') || now));
  waiting.sort((a,b)=>Date.parse(a.recommendation.dueAt!)-Date.parse(b.recommendation.dueAt!));
  const savedStates = [...scopes.values()].flatMap(scope=>[...scope.states.values()]);
  const savedEvents = [...scopes.values()].flatMap(scope=>[...scope.events.values()].flat());
  // A never-scheduled mode is a learning opportunity, not an overdue review.
  const dueCards = getDueVocabularyReviewQueue({...store,vocabulary:entries,vocabularyStates:savedStates,vocabularyEvidence:savedEvents},{now:new Date(now),scheduledOnly:true})
    .filter(card=>card.mode==='definition'||card.mode==='dictation');
  const practice = ready[0] || waiting[0];
  return {dueCards,...(practice?{practice}:{}),...(Number.isFinite(nextChange)?{nextChangeAt:new Date(nextChange).toISOString()}:{})};
}
