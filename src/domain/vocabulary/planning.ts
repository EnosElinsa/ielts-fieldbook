import {getVocabularyReviewQueue} from './index';
import {getVocabularyNextPractice} from './nextPractice';
import {getLearnedVocabularyIds} from './progress';
import type {ReviewCard,VocabularyMode,VocabularyStore} from './types';
import type {VocabularySessionRecord} from './session';

export type VocabularyPlanningCandidate = {card:ReviewCard;reason:'error'|'recovery'|'due'|'missing'|'spaced'};

/** Saved, attempted meanings only. Dates and evidence are read without changing account state.
 * One opportunity per exact entry/sense/mode; preference never crosses a reason or due-date priority.
 */
export function getVocabularyPlanningCandidates(store:Partial<VocabularyStore>,now:string|Date,preferredMode?:VocabularyMode):VocabularyPlanningCandidate[] {
  const at=new Date(now).getTime();
  if (!Number.isFinite(at)) return [];
  const scopes=new Map((store.vocabulary || []).filter(entry=>!entry.tags.includes('archived')).map(entry=>[entry.id,{
    entry,states:[] as VocabularyStore['vocabularyStates'],events:[] as VocabularyStore['vocabularyEvidence'],
    reviews:[] as VocabularyStore['vocabularyReviews'],sessions:[] as VocabularySessionRecord[],learned:new Set<string>(),
  }]));
  for (const state of store.vocabularyStates || []) {
    const scope=scopes.get(state.entryId);if (!scope) continue;
    scope.states.push(state);
    if (state.reviewCount>0 || state.wrong?.active || (state.manualStatus && state.manualStatus!=='new')
      || Object.values(state.cards || {}).some(card=>Number.isFinite(new Date(card?.due || '').getTime()))
      || Number.isFinite(Date.parse(String(state.legacyProgress?.nextReviewAt || '')))
      || Object.values(state.dimensions || {}).some(dimension=>dimension.successes>0||dimension.failures>0||dimension.partials>0)) scope.learned.add(state.senseId);
  }
  for (const event of store.vocabularyEvidence || []) {
    const scope=scopes.get(event.entryId);if (!scope) continue;
    scope.events.push(event);
    if (event.mode && event.result!=='pending' && Date.parse(event.occurredAt)<=at) {
      const senseId=event.senseId || scope.entry.senses[0]?.id;if (senseId) scope.learned.add(senseId);
    }
  }
  for (const review of store.vocabularyReviews || []) {
    const scope=scopes.get(review.entryId);if (!scope) continue;
    scope.reviews.push(review);
    if (review.result!=='pending' && (!review.occurredAt || Date.parse(review.occurredAt)<=at)) scope.learned.add(review.senseId);
  }
  for (const session of store.vocabularySessions || []) {
    if (session.status!=='submitted' || session.mode==='audio' || !Number.isFinite(Date.parse(session.submittedAt)) || Date.parse(session.submittedAt)>at) continue;
    const seen=new Set<string>();
    for (const row of session.results) {
      const scope=scopes.get(row.entryId);if (!scope) continue;
      if (!seen.has(row.entryId)) {scope.sessions.push(session);seen.add(row.entryId);}
      if (String(row.response || '').trim()) scope.learned.add(row.senseId);
    }
  }
  // Old wordbook attempt records identify words, so they can establish only the saved primary sense.
  const historical=getLearnedVocabularyIds({vocabulary:store.vocabulary,wordbookProgress:store.wordbookProgress});
  for (const scope of scopes.values()) if (historical.has(scope.entry.id) && scope.entry.senses[0]) scope.learned.add(scope.entry.senses[0].id);
  const candidates:VocabularyPlanningCandidate[]=[];
  for (const {entry,states,events,reviews,sessions,learned} of scopes.values()) {
    const snapshot={vocabulary:[entry],vocabularyStates:states,vocabularyEvidence:events,vocabularyReviews:reviews,vocabularySessions:sessions};
    const seen=new Set<string>();
    for (const sense of entry.senses) {
      if (seen.has(sense.id) || !learned.has(sense.id) || !sense.definition.trim()) continue;
      seen.add(sense.id);
      const cards=getVocabularyReviewQueue(snapshot,{entryId:entry.id,senseId:sense.id,now,dueOnly:false});
      for (const foundationMode of ['definition','dictation'] as const) {
        const recommendation=getVocabularyNextPractice(snapshot,entry,{senseId:sense.id,now,foundationMode});
        if (recommendation?.status!=='ready' || recommendation.reason==='production') continue;
        const card=cards.find(card=>card.mode===foundationMode);
        if (card) candidates.push({card,reason:recommendation.reason});
      }
    }
  }
  const priority={error:0,recovery:1,due:2,missing:3,spaced:4};
  return candidates.sort((a,b)=>priority[a.reason]-priority[b.reason]
    || ((a.reason==='due'||a.reason==='recovery') ? Date.parse(a.card.dueAt)-Date.parse(b.card.dueAt) : 0)
    || (preferredMode ? Number(b.card.mode===preferredMode)-Number(a.card.mode===preferredMode) : 0)
    || a.card.entryId.localeCompare(b.card.entryId) || a.card.senseId.localeCompare(b.card.senseId) || a.card.mode.localeCompare(b.card.mode));
}
