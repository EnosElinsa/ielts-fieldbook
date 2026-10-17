import type {VocabularyDimension,VocabularyEntry,VocabularyMode,VocabularyStore} from './types';
import {getVocabularyReviewQueue,VOCABULARY_MODE_DIMENSIONS} from './index';
import {getVocabularyMastery} from './mastery';
import {VOCABULARY_CATALOG} from './catalog';

export type VocabularyNextPractice = {
  status: 'ready' | 'waiting'; mode: VocabularyMode; reason: 'missing' | 'due' | 'recovery';
  dimensions: VocabularyDimension[]; dueAt?: string; nextChangeAt?: string; alternatives: VocabularyMode[];
};

export function getVocabularyNextPractice(
  store: Partial<VocabularyStore>, entry: VocabularyEntry,
  request: {senseId: string; bookId?: string; unitId?: string; now?: string | Date},
): VocabularyNextPractice | undefined {
  const now = new Date(request.now || new Date()).getTime();
  if (!Number.isFinite(now)) return;
  const order: VocabularyMode[] = ['definition','dictation','distinction','cloze','synonym','production'];
  const member = request.bookId && request.unitId && VOCABULARY_CATALOG.memberships.some(row=>row.entryId===entry.id&&row.bookId===request.bookId&&row.unitId===request.unitId);
  const scoped = member && !entry.sources.some(source=>source.bookId===request.bookId&&source.unitId===request.unitId)
    ? {...entry,sources:[...entry.sources,{type:'wordbook' as const,id:`${request.bookId}:${request.unitId}:${entry.id}`,bookId:request.bookId,unitId:request.unitId}]} : entry;
  const cards = getVocabularyReviewQueue({...store,vocabulary:[scoped]}, {...request,entryId:entry.id,dueOnly:false,now:new Date(now)})
    .sort((a,b)=>order.indexOf(a.mode)-order.indexOf(b.mode));
  if (!cards.length || !cards[0].entry.senses.find(sense=>sense.id===request.senseId)?.definition.trim()) return;
  const learning = store.vocabularyStates?.find(row=>row.entryId===entry.id&&row.senseId===request.senseId);
  const schedule = (mode: VocabularyMode) => {
    const value = learning?.cards[mode]?.due || learning?.legacyProgress?.nextReviewAt;
    const time = value instanceof Date ? value.getTime() : value ? Date.parse(String(value)) : NaN;
    return Number.isFinite(time) ? time : undefined;
  };
  const available = cards.filter(card=>schedule(card.mode) === undefined || schedule(card.mode)! <= now);
  const upcoming = cards.filter(card=>(schedule(card.mode) ?? -Infinity)>now)
    .sort((a,b)=>schedule(a.mode)!-schedule(b.mode)!)[0];
  const nextChangeAt = upcoming ? new Date(schedule(upcoming.mode)!).toISOString() : undefined;
  const response = (mode: VocabularyMode, reason: VocabularyNextPractice['reason'], dimensions = VOCABULARY_MODE_DIMENSIONS[mode]): VocabularyNextPractice => ({
    status:'ready',mode,reason,dimensions:[...dimensions],
    ...(schedule(mode) !== undefined ? {dueAt:new Date(schedule(mode)!).toISOString()} : {}),
    ...(nextChangeAt ? {nextChangeAt} : {}),
    alternatives:available.filter(card=>card.mode!==mode).map(card=>card.mode),
  });
  const recover = available.filter(card=>learning?.wrong?.modes?.[card.mode]?.active)
    .sort((a,b)=>(schedule(a.mode) ?? now)-(schedule(b.mode) ?? now))[0];
  if (recover) return response(recover.mode,'recovery');
  const due = available.filter(card=>schedule(card.mode)! <= now)
    .sort((a,b)=>schedule(a.mode)!-schedule(b.mode)!)[0];
  if (due) return response(due.mode,'due');
  const mastery = getVocabularyMastery(store,entry.id,request.senseId);
  const dimensions: VocabularyDimension[] = ['meaning','listening','spelling','usage'];
  for (const dimension of dimensions) {
    if (mastery.dimensions[dimension].spacedSuccesses) continue;
    const card = available.find(card=>VOCABULARY_MODE_DIMENSIONS[card.mode].includes(dimension));
    if (card) return response(card.mode,'missing',VOCABULARY_MODE_DIMENSIONS[card.mode].filter(key=>!mastery.dimensions[key].spacedSuccesses));
  }
  if (upcoming) return {status:'waiting',mode:upcoming.mode,reason:'due',dueAt:nextChangeAt,nextChangeAt,dimensions:[...VOCABULARY_MODE_DIMENSIONS[upcoming.mode]],alternatives:[]};
}
