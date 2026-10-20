import { getVocabularyReviewQueue } from './index';
import type { ReviewQueueFilter, VocabularyMode, VocabularyStore, ReviewCard } from './types';
import { getVocabularyPlanningCandidates, selectVocabularyPlanReview } from './planning';
import { orderReviewCards } from './reviewOrder';
export type ReviewType='due'|'wrong'|'custom';
export type ReviewScope={reviewType?:ReviewType;reviewFilter?:ReviewQueueFilter;assessmentMode:VocabularyMode;reviewReason?:string;questionOrder?:'source'|'random'|'due';selectedMeanings?:{entryId:string;senseId:string}[]};
export function normalizeSelectedMeanings(value:unknown){
 if(value===undefined)return undefined;
 if(!Array.isArray(value)||!value.length||value.length>10000)throw new Error('Choose at least one word and meaning.');
 const result:{entryId:string;senseId:string}[]=[],seen=new Set<string>();
 for(const row of value){if(!row||typeof row!=='object'||['entryId','senseId'].some(key=>typeof row[key]!=='string'||!row[key].trim()||row[key].length>500))throw new Error('Invalid selected meaning.');const ref={entryId:row.entryId,senseId:row.senseId},key=JSON.stringify(ref);if(!seen.has(key)){result.push(ref);seen.add(key);}}
 return result;
}
export function normalizeReviewScope(value:unknown):ReviewQueueFilter{
  const input=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const result:Record<string,string>={};
  for(const key of ['entryId','senseId','bookId','unitId','sourceType','sourceId','skill','dimension']){
    const item=input[key];if(item===undefined)continue;
    if(typeof item!=='string'||!item.trim()||item.length>500||['__proto__','constructor','prototype'].includes(item))throw new Error('Invalid review scope.');
    result[key]=item;
  }
  return result as ReviewQueueFilter;
}
export function selectScheduledVocabularyReview(store:Partial<VocabularyStore>,target:ReviewScope,now:Date,capacity:number,reserved:ReadonlySet<string>=new Set()):ReviewCard[]{
  if(!target.reviewType){
    if(target.reviewReason){
      const words=new Set<string>();
      return getVocabularyPlanningCandidates(store,now,target.assessmentMode).filter(row=>row.reason===target.reviewReason&&row.card.mode===target.assessmentMode&&!reserved.has(JSON.stringify([row.card.entryId,row.card.senseId]))).map(row=>row.card).filter(card=>{if(words.has(card.entryId))return false;words.add(card.entryId);return true;}).slice(0,capacity);
    }
    return selectVocabularyPlanReview(store,now,target.assessmentMode,capacity,reserved);
  }
  const scope=normalizeReviewScope(target.reviewFilter);
  let cards=getVocabularyReviewQueue(store,{...scope,mode:target.assessmentMode,now,dueOnly:target.reviewType==='due'});
  const selected=normalizeSelectedMeanings(target.selectedMeanings);
  if(selected){const ids=new Set(selected.map(ref=>JSON.stringify([ref.entryId,ref.senseId])));cards=cards.filter(card=>ids.has(JSON.stringify([card.entryId,card.senseId])));}
  if(target.questionOrder==='source')cards=orderReviewCards(cards,store,scope);
  else if(target.questionOrder==='random')for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}
  else cards.sort((a,b)=>(a.scheduledDueAt??'\uffff').localeCompare(b.scheduledDueAt??'\uffff'));
  const words=new Set<string>();
  return cards.filter(card=>{
    if(reserved.has(JSON.stringify([card.entryId,card.senseId])))return false;
    if(target.reviewType==='wrong'&&!(store.vocabularyStates||[]).some(row=>row.entryId===card.entryId&&row.senseId===card.senseId&&row.wrong?.modes?.[card.mode]?.active))return false;
    if(card.mode==='dictation'){if(words.has(card.entryId))return false;words.add(card.entryId);}
    return true;
  }).slice(0,capacity);
}
