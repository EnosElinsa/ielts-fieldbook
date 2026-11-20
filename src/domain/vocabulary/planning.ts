import {getVocabularyReviewQueue} from './index';
import {getVocabularyNextPracticeFromCards} from './nextPractice';
import {yieldToBrowser} from '../../lib/yieldToBrowser';
import {getLearnedVocabularyIds} from './progress';
import type {ReviewCard,VocabularyMode,VocabularyStore} from './types';
import type {VocabularySessionRecord} from './session';

export type VocabularyPlanningCandidate = {card:ReviewCard;reason:'error'|'recovery'|'due'|'missing'|'spaced';availableAt?:number};

/** Explicit specialist choices retain their assessed due queue; automatic planning stays foundation-only. */
export function selectVocabularyPlanReview(store: Partial<VocabularyStore>, now: Date, mode: VocabularyMode, capacity: number, reserved: ReadonlySet<string> = new Set()): ReviewCard[] {
  const learned = getLearnedVocabularyIds(store);
  const candidates = mode === 'definition' || mode === 'dictation'
    ? getVocabularyPlanningCandidates(store, now, mode).filter(row => row.card.mode === mode).map(row => row.card)
    : getVocabularyReviewQueue(store, {mode, dueOnly:true, now}).filter(card => learned.has(card.entryId));
  const words = new Set<string>();
  return candidates.filter(card => {
    if (reserved.has(JSON.stringify([card.entryId, card.senseId])) || words.has(card.entryId)) return false;
    words.add(card.entryId);
    return true;
  }).slice(0, capacity);
}

/** Saved, attempted meanings only. Dates and evidence are read without changing account state.
 * One opportunity per exact entry/sense/mode; preference never crosses a reason or due-date priority.
 */
export function getVocabularyPlanningCandidates(store:Partial<VocabularyStore>,now:string|Date,preferredMode?:VocabularyMode,through?:Date):VocabularyPlanningCandidate[] {
  return sortCandidates([...candidateBatches(store,now,through)].flat(),preferredMode);
}

/** Keep the browser responsive during large historical scans; the synchronous path shares every rule. */
export async function getVocabularyPlanningCandidatesAsync(store:Partial<VocabularyStore>,now:string|Date,preferredMode?:VocabularyMode,through?:Date):Promise<VocabularyPlanningCandidate[]> {
  const candidates:VocabularyPlanningCandidate[]=[];
  let deadline=performance.now()+8;
  for(const batch of candidateBatches(store,now,through)) {
    candidates.push(...batch);
    if(performance.now()>=deadline) {await yieldToBrowser();deadline=performance.now()+8;}
  }
  return sortCandidates(candidates,preferredMode);
}

function* candidateBatches(store:Partial<VocabularyStore>,now:string|Date,through?:Date):Generator<VocabularyPlanningCandidate[]> {
  const at=new Date(now).getTime();
  if (!Number.isFinite(at)) return;
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
  for (const {entry,states,events,reviews,sessions,learned} of scopes.values()) {
    const snapshot={vocabulary:[entry],vocabularyStates:states,vocabularyEvidence:events,vocabularyReviews:reviews,vocabularySessions:sessions};
    const seen=new Set<string>();
    for (const sense of entry.senses) {
      if (seen.has(sense.id) || !learned.has(sense.id) || !sense.definition.trim()) continue;
      seen.add(sense.id);
      const candidates:VocabularyPlanningCandidate[]=[];
      // Foundation planning never offers cloze/synonym/production. Only an active
      // distinction error needs its exact task to verify a targeted recommendation.
      const distinction=states.some(state=>state.senseId===sense.id && state.wrong?.modes?.distinction?.active && state.wrong.modes.distinction.lastFailureAt);
      const cards=getVocabularyReviewQueue(snapshot,{entryId:entry.id,senseId:sense.id,now,dueOnly:false,modes:distinction?['definition','dictation','distinction']:['definition','dictation']});
      for (const foundationMode of ['definition','dictation'] as const) {
        const card=cards.find(card=>card.mode===foundationMode);
        if (!card) continue;
        const request = {senseId:sense.id,now,foundationMode};
        let recommendation=getVocabularyNextPracticeFromCards(snapshot,entry,request,cards);
        let availableAt: number | undefined;
        if (through && recommendation?.status === 'waiting') {
          const due = Date.parse(card.scheduledDueAt || '');
          if (due > at && due <= through.getTime()) {
            availableAt = due;
            recommendation = getVocabularyNextPracticeFromCards(snapshot,entry,{...request,now:new Date(due)},cards);
          }
        }
        if (recommendation?.status!=='ready' || recommendation.reason==='production') continue;
        candidates.push({card,reason:recommendation.reason,...(availableAt === undefined ? {} : {availableAt})});
      }
      yield candidates;
    }
  }
}

function sortCandidates(candidates:VocabularyPlanningCandidate[],preferredMode?:VocabularyMode) {
  const priority={error:0,recovery:1,due:2,missing:3,spaced:4};
  return candidates.sort((a,b)=>priority[a.reason]-priority[b.reason]
    || ((a.reason==='due'||a.reason==='recovery') ? Date.parse(a.card.dueAt)-Date.parse(b.card.dueAt) : 0)
    || (preferredMode ? Number(b.card.mode===preferredMode)-Number(a.card.mode===preferredMode) : 0)
    || a.card.entryId.localeCompare(b.card.entryId) || a.card.senseId.localeCompare(b.card.senseId) || a.card.mode.localeCompare(b.card.mode));
}
