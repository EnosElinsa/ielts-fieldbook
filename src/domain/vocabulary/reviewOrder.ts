import { VOCABULARY_CATALOG } from './catalog';
import type { ReviewCard, ReviewQueueFilter, VocabularyStore } from './types';

/** Book order follows group order then membership order; mixed sources use saved order. */
export function orderReviewCards(cards: readonly ReviewCard[], state: Partial<VocabularyStore>, scope: ReviewQueueFilter): ReviewCard[] {
  const ids = scope.bookId && scope.bookId !== 'all'
    ? VOCABULARY_CATALOG.memberships.filter(row => row.bookId === scope.bookId && (!scope.unitId || row.unitId === scope.unitId))
      .slice().sort((a,b) => {
        const group=(id:string)=>VOCABULARY_CATALOG.units.find(row=>row.bookId===scope.bookId&&row.id===id)?.order??Infinity;
        return group(a.unitId)-group(b.unitId) || a.order-b.order;
      }).map(row=>row.entryId)
    : (state.vocabulary||[]).map(row=>row.id);
  const order = new Map<string,number>();
  ids.forEach((id,index)=>{if(!order.has(id))order.set(id,index);});
  return cards.slice().sort((a,b)=>(order.get(a.entryId)??Infinity)-(order.get(b.entryId)??Infinity));
}

export function oneQuestionPerWord(cards: readonly ReviewCard[]): ReviewCard[] {
  const words=new Set<string>();
  return cards.filter(card=>{if(words.has(card.entryId))return false;words.add(card.entryId);return true;});
}
