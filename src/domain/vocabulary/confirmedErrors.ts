import {normalizeAnswer} from './index';
import {evaluateVocabularySessionAnswer} from './session';
import type {VocabularySessionRecord,VocabularySessionResult} from './session';
import type {ReviewCard,VocabularyMode,VocabularyStore} from './types';
import bindings from './errorFocusBindings.json';

export type VocabularyConfirmedError = {
  kind: 'spelling' | 'meaning-choice' | 'collocation-choice' | 'choice';
  sessionId: string; cardId: string; failedMode: VocabularyMode; occurredAt: string;
  response: string; expectedAnswer: string;
};

const sameTask = (left: ReviewCard['task'],right: ReviewCard['task']) => Boolean(left && right
  && left.prompt===right.prompt && left.explanation===right.explanation
  && JSON.stringify(left.acceptedAnswers)===JSON.stringify(right.acceptedAnswers)
  && JSON.stringify(left.options)===JSON.stringify(right.options));

/** Describe only observable outcomes of the frozen question, never an inferred mental cause. */
function confirmedError(session:VocabularySessionRecord,row:VocabularySessionResult): VocabularyConfirmedError | undefined {
  if (row.result!=='failure' || !normalizeAnswer(row.response) || session.mode==='production' || session.mode==='audio') return;
  const snapshots=session.cardSnapshots?.filter(card=>card.id===row.cardId);
  if (snapshots?.length!==1) return;
  const card=snapshots[0],sense=card.entry?.senses.find(sense=>sense.id===row.senseId);
  if (!sense || card.entry.id!==row.entryId || card.entryId!==row.entryId || card.senseId!==row.senseId || card.mode!==session.mode) return;
  const evaluated=evaluateVocabularySessionAnswer(card,row.response);
  if (evaluated.result!=='failure' || evaluated.term!==row.term || evaluated.expectedAnswer!==row.expectedAnswer
    || evaluated.definition!==row.definition || evaluated.example!==row.example || evaluated.prompt!==row.prompt
    || evaluated.explanation!==row.explanation || evaluated.contentVersion!==row.contentVersion
    || JSON.stringify(evaluated.context)!==JSON.stringify(row.context)) return;
  const base={sessionId:session.id,cardId:card.id,failedMode:card.mode,occurredAt:session.submittedAt,response:row.response,expectedAnswer:row.expectedAnswer};
  // A mismatch confirms the written answer differs, not whether the learner misheard it.
  if (card.mode==='dictation' && !card.task) return {...base,kind:'spelling'};
  if (card.mode!=='distinction' || !card.task?.options?.some(option=>normalizeAnswer(option)===normalizeAnswer(row.response))) return;
  const binding=sense.source!=='Personal note' && bindings.find(binding=>binding.entryId===card.entryId && binding.senseId===card.senseId
    && binding.term===card.entry.term && binding.definition===sense.definition && binding.pos===sense.pos && binding.example===sense.example
    && sameTask(binding.task,card.task));
  return {...base,kind:binding ? binding.kind as 'meaning-choice'|'collocation-choice' : 'choice'};
}

/** Active flags and their exact last failure date prevent historical errors reopening recovery. */
export function getActiveVocabularyConfirmedErrors(store:Partial<VocabularyStore>,cards:ReviewCard[],now:number): VocabularyConfirmedError[] {
  const current=cards[0];
  if (!current) return [];
  const learning=store.vocabularyStates?.find(row=>row.entryId===current.entryId&&row.senseId===current.senseId);
  const sense=current.entry.senses.find(row=>row.id===current.senseId);
  if (!learning || !sense || !Object.values(learning.wrong?.modes || {}).some(state=>state?.active&&state.lastFailureAt)) return [];
  const failures=new Map<VocabularyMode,number>();
  const candidates=(store.vocabularySessions || []).flatMap(session=>{
    const at=Date.parse(session.submittedAt),active=session.mode==='audio' ? undefined : learning.wrong?.modes?.[session.mode];
    if (session.status!=='submitted' || !active?.active || !Number.isFinite(at) || at>now || Date.parse(active.lastFailureAt || '')!==at) return [];
    return session.results.flatMap(row=>{
      if (row.entryId!==current.entryId || row.senseId!==current.senseId) return [];
      if (row.result==='failure' && session.mode!=='audio') failures.set(session.mode,(failures.get(session.mode)||0)+1);
      const card=session.cardSnapshots?.find(card=>card.id===row.cardId),frozen=card?.entry.senses.find(sense=>sense.id===row.senseId);
      if (!frozen || current.entry.term!==card?.entry.term || sense.definition!==frozen.definition || sense.pos!==frozen.pos
        || sense.example!==frozen.example || sense.source!==frozen.source) return [];
      if (session.mode==='distinction' && !sameTask(card?.task,cards.find(card=>card.mode==='distinction')?.task)) return [];
      const error=confirmedError(session,row);
      return error ? [error] : [];
    });
  });
  // Conflicting same-time failures are insufficient evidence for a targeted recommendation.
  return candidates.filter(error=>failures.get(error.failedMode)===1)
    .sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)||a.cardId.localeCompare(b.cardId));
}

export const VOCABULARY_ERROR_PRACTICE: Record<VocabularyConfirmedError['kind'],VocabularyMode[]> = {
  spelling:['dictation','definition'],
  'meaning-choice':['definition','distinction','cloze'],
  'collocation-choice':['cloze','distinction','production'],
  choice:['distinction','definition'],
};
