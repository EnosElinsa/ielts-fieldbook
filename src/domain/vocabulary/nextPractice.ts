import type {VocabularyDimension,VocabularyEntry,VocabularyMode,VocabularyStore} from './types';
import {getVocabularyReviewQueue,VOCABULARY_MODE_DIMENSIONS} from './index';
import {getVocabularySpacedProgress,VOCABULARY_FOUNDATION_DIMENSIONS} from './mastery';
import {VOCABULARY_CATALOG} from './catalog';
import {getActiveVocabularyConfirmedErrors,VOCABULARY_ERROR_PRACTICE} from './confirmedErrors';
import type {VocabularyConfirmedError} from './confirmedErrors';

export type VocabularyNextPractice = {
  status: 'ready' | 'waiting'; mode: VocabularyMode; reason: 'missing' | 'due' | 'recovery' | 'spaced' | 'production' | 'error';
  dimensions: VocabularyDimension[]; dueAt?: string; nextChangeAt?: string; alternatives: VocabularyMode[];
  target?: 'familiar' | 'mastered';
  error?: VocabularyConfirmedError;
};

export function getVocabularyNextPractice(
  store: Partial<VocabularyStore>, entry: VocabularyEntry,
  request: {senseId: string; bookId?: string; unitId?: string; now?: string | Date; foundationMode?: 'definition'|'dictation'},
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
    const value = learning?.cards[mode]?.due;
    const time = value instanceof Date ? value.getTime() : value ? Date.parse(String(value)) : NaN;
    return Number.isFinite(time) ? time : undefined;
  };
  const offered = cards.filter(card=>!request.foundationMode || card.mode===request.foundationMode);
  const foundation = offered.filter(card=>card.mode==='definition'||card.mode==='dictation');
  const available = offered.filter(card=>schedule(card.mode) === undefined || schedule(card.mode)! <= now);
  const foundationAvailable = available.filter(card=>card.mode==='definition'||card.mode==='dictation');
  const upcoming = foundation.filter(card=>(schedule(card.mode) ?? -Infinity)>now)
    .sort((a,b)=>schedule(a.mode)!-schedule(b.mode)!)[0];
  const dimensions: VocabularyDimension[] = [...VOCABULARY_FOUNDATION_DIMENSIONS];
  const primarySenseId = store.vocabulary?.find(row=>row.id===entry.id)?.senses[0]?.id;
  const events = (store.vocabularyEvidence || []).filter(event=>event.entryId===entry.id
    && (event.senseId===request.senseId || (!event.senseId && request.senseId===primarySenseId))
    && Date.parse(event.occurredAt)<=now);
  const progress = Object.fromEntries(dimensions.map(dimension=>[dimension,getVocabularySpacedProgress(events.filter(event=>event.dimension===dimension))])) as Record<VocabularyDimension,ReturnType<typeof getVocabularySpacedProgress>>;
  const familiar = dimensions.every(dimension=>progress[dimension].count>=3);
  const target = familiar ? 'mastered' : 'familiar', required = familiar ? 5 : 3;
  const nextSuccess = (dimension: VocabularyDimension) => progress[dimension].nextSuccessAt ? Date.parse(progress[dimension].nextSuccessAt!) : -Infinity;
  // Saved dates constrain each mode; a different eligible mode may still advance a skill.
  const pending = foundation.flatMap(card=>{
    const times = VOCABULARY_MODE_DIMENSIONS[card.mode].filter(dimension=>progress[dimension].count<required).map(nextSuccess);
    if (!times.length) return [];
    const at=Math.max(schedule(card.mode) ?? -Infinity,Math.min(...times));
    return at>now ? [{mode:card.mode,at}] : [];
  }).sort((a,b)=>a.at-b.at);
  const availabilityChange = offered.map(card=>schedule(card.mode)).filter((at):at is number=>at!==undefined&&at>now);
  const changeAt = Math.min(...availabilityChange,pending[0]?.at ?? Infinity);
  const nextChangeAt = Number.isFinite(changeAt) ? new Date(changeAt).toISOString() : undefined;
  const response = (mode: VocabularyMode, reason: VocabularyNextPractice['reason'], skills = VOCABULARY_MODE_DIMENSIONS[mode]): VocabularyNextPractice => ({
    status:'ready',mode,reason,dimensions:[...skills],
    ...(reason==='spaced' || reason==='production' ? {target} : {}),
    ...(schedule(mode) !== undefined ? {dueAt:new Date(schedule(mode)!).toISOString()} : {}),
    ...(nextChangeAt ? {nextChangeAt} : {}),
    alternatives:available.filter(card=>card.mode!==mode).map(card=>card.mode),
  });
  for (const error of getActiveVocabularyConfirmedErrors(store,cards,now)) {
    const remedial = request.foundationMode ? cards.filter(card=>(card.mode==='definition'||card.mode==='dictation')
      && (schedule(card.mode)===undefined || schedule(card.mode)!<=now)) : available;
    const mode=VOCABULARY_ERROR_PRACTICE[error.kind].find(mode=>remedial.some(card=>card.mode===mode));
    if (mode && (!request.foundationMode || request.foundationMode===mode)) return {...response(mode,'error'),error};
  }
  const recover = available.filter(card=>card.mode!=='production'&&learning?.wrong?.modes?.[card.mode]?.active)
    .sort((a,b)=>(schedule(a.mode) ?? now)-(schedule(b.mode) ?? now))[0];
  if (recover) return response(recover.mode,'recovery');
  const due = foundationAvailable.filter(card=>schedule(card.mode)! <= now)
    .sort((a,b)=>schedule(a.mode)!-schedule(b.mode)!)[0];
  if (due) return response(due.mode,'due');
  for (const dimension of dimensions) {
    if (progress[dimension].count) continue;
    const card = foundationAvailable.find(card=>VOCABULARY_MODE_DIMENSIONS[card.mode].includes(dimension));
    if (card) return response(card.mode,'missing',VOCABULARY_MODE_DIMENSIONS[card.mode].filter(key=>!progress[key].count));
  }
  for (const dimension of [...dimensions].sort((a,b)=>progress[a].count-progress[b].count)) {
    if (progress[dimension].count>=required || nextSuccess(dimension)>now) continue;
    const card=foundationAvailable.find(card=>VOCABULARY_MODE_DIMENSIONS[card.mode].includes(dimension));
    if (card) return response(card.mode,'spaced',VOCABULARY_MODE_DIMENSIONS[card.mode].filter(key=>progress[key].count<required&&nextSuccess(key)<=now));
  }
  const scheduledAt = upcoming ? schedule(upcoming.mode)! : Infinity;
  if (pending[0] && pending[0].at<scheduledAt) {
    const {mode,at}=pending[0],time=new Date(at).toISOString();
    return {status:'waiting',mode,reason:'spaced',target,dueAt:time,nextChangeAt,dimensions:[...VOCABULARY_MODE_DIMENSIONS[mode]],alternatives:[]};
  }
  if (upcoming) return {status:'waiting',mode:upcoming.mode,reason:'due',dueAt:new Date(scheduledAt).toISOString(),nextChangeAt,dimensions:[...VOCABULARY_MODE_DIMENSIONS[upcoming.mode]],alternatives:[]};
}
