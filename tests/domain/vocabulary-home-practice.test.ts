import {expect,test,vi} from 'vitest';
import {addVocabularyItem,getVocabularyReviewQueue} from '../../src/domain/vocabulary';
import {getVocabularyHomePractice} from '../../src/domain/vocabulary/homePractice';
import {buildVocabularySessionCommit,createVocabularySession,updateVocabularySessionAnswer} from '../../src/domain/vocabulary/session';
import {VOCABULARY_CATALOG} from '../../src/domain/vocabulary/catalog';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import type {VocabularyDimension,VocabularyEvidence,VocabularyMode,VocabularySense,VocabularyStore} from '../../src/domain/vocabulary/types';

const now='2026-10-18T10:00:00.000Z',past='2026-10-16T09:00:00.000Z',future='2026-10-19T10:00:00.000Z';
function fixture(){
 const store={} as VocabularyStore;
 const add=(id='home-entry',senseId='saved-meaning')=>{
  const term=id==='home-entry'?'homeword':`word-${id}`;
  return addVocabularyItem(store,{id,term,senses:[{id:senseId,pos:'noun',definition:'A term used in class.',example:`We use ${term} in class.`,source:'Personal note'}]},{now:()=>past}).item!;
 };
 const entry=add(),learning=store.vocabularyStates[0];
 return {store,entry,learning,add,recommend:()=>getVocabularyHomePractice(store,now)};
}
function event(store:VocabularyStore,entryId='home-entry',senseId:string|undefined='saved-meaning',dimension:VocabularyDimension='meaning',at=past){
 const row:VocabularyEvidence={entryId,senseId,dimension,mode:dimension==='usage'?'cloze':dimension==='meaning'?'definition':'dictation',verification:'objective',result:'success',occurredAt:at,sourceType:'personal',sourceId:'class'};
 store.vocabularyEvidence.push(row);return row;
}

test('saved exact meanings are recommended without creating any state or evidence',()=>{
 const {store,recommend}=fixture(),before=structuredClone(store);
 expect(recommend().practice).toMatchObject({entry:{id:'home-entry'},sense:{id:'saved-meaning',definition:'A term used in class.'},recommendation:{status:'ready',mode:'definition',reason:'missing'}});
 expect(recommend().dueCards).toEqual([]);expect(store).toEqual(before);
});

test('unscheduled modes do not turn a learned word into a batch of overdue cards',()=>{
 const {store,recommend}=fixture();event(store);
 expect(recommend().dueCards).toEqual([]);
 expect(recommend().practice?.recommendation).toMatchObject({mode:'dictation',reason:'missing'});
});

test('persisted due cards remain available as a batch with their exact meaning',()=>{
 const {store,learning,recommend}=fixture();event(store);learning.cards.definition={due:new Date(past)} as never;
 expect(recommend().dueCards.map(card=>[card.entryId,card.senseId,card.mode])).toEqual([['home-entry','saved-meaning','definition']]);
});

test('home defaults due batches to foundation while specialist exercises remain manually available',()=>{
 const {store,learning,recommend}=fixture();event(store);
 learning.cards.cloze={due:new Date(past)} as never;
 learning.cards.definition={due:new Date(past)} as never;
 expect(recommend().dueCards.map(card=>card.mode)).toEqual(['definition']);
 expect(getVocabularyReviewQueue(store,{mode:'cloze',now,dueOnly:true})).toHaveLength(1);
 expect(recommend().practice?.recommendation.alternatives).toContain('cloze');
});

test('legacy saved due dates remain a valid review schedule',()=>{
 const {store,learning,recommend}=fixture();event(store);learning.legacyProgress={nextReviewAt:past};
 expect(recommend().dueCards.length).toBeGreaterThan(0);
});

test('eligible recovery outranks other due and missing skill candidates',()=>{
 const {store,add,recommend}=fixture();add('recovery');
 const learning=store.vocabularyStates.find(row=>row.entryId==='recovery')!;learning.wrong.active=true;learning.wrong.modes.dictation={active:true,successesSinceFailure:0};
 expect(recommend().practice).toMatchObject({entry:{id:'recovery'},recommendation:{mode:'dictation',reason:'recovery'}});
});

test('home carries frozen confirmed errors into the saved-meaning recommendation ahead of other due work',()=>{
 const {store,add,recommend}=fixture();const entry=add('confirmed-error');
 const card=getVocabularyReviewQueue(store,{entryId:entry.id,senseId:'saved-meaning',mode:'dictation',dueOnly:false,now})[0];
 let session=updateVocabularySessionAnswer(createVocabularySession([card],'dictation',{}),card.id,'wrongspelling');session.submittedAt=past;
 Object.assign(store,buildVocabularySessionCommit(store,session,[card]).state);
 store.vocabularyStates.find(row=>row.entryId==='home-entry')!.cards.definition={due:new Date(past)} as never;
 const before=structuredClone(store);
 expect(recommend().practice).toMatchObject({entry:{id:'confirmed-error'},sense:{id:'saved-meaning'},recommendation:{reason:'error',mode:'dictation',error:{kind:'spelling'}}});
 expect(store).toEqual(before);
});

test('unsupported and future recovery modes do not become immediate recovery recommendations',()=>{
 const {learning,recommend}=fixture();learning.cards.dictation={due:new Date(future)} as never;learning.wrong.active=true;
 learning.wrong.modes={dictation:{active:true,successesSinceFailure:0},synonym:{active:true,successesSinceFailure:0}};
 expect(recommend().practice?.recommendation).toMatchObject({mode:'definition',reason:'missing'});
 expect(recommend().practice?.recommendation.alternatives).not.toContain('synonym');
 expect(recommend().nextChangeAt).toBe(future);
});

test('public defaults and other dictionary meanings cannot expand the saved candidate set',()=>{
 const {store,entry,recommend}=fixture();const publicEntry={...entry,senses:[{...entry.senses[0],id:'new-public-default',definition:'A different public meaning.'}]};
 const original=VOCABULARY_CATALOG.entries;VOCABULARY_CATALOG.entries=[publicEntry] as typeof original;
 try{expect(recommend().practice?.sense.id).toBe('saved-meaning');expect(store.vocabulary[0].senses).toHaveLength(1);}
 finally{VOCABULARY_CATALOG.entries=original;}
});

test('each saved additional meaning competes on its own evidence rather than inheriting primary progress',()=>{
 const {store,entry,learning,recommend}=fixture();entry.senses.push({...entry.senses[0],id:'saved-second',definition:'Another saved meaning.'});
 event(store);learning.cards.dictation={due:new Date(future)} as never;learning.cards.cloze={due:new Date(future)} as never;learning.cards.production={due:new Date(future)} as never;
 // The primary still has eligible spaced meaning recall, but the second needs its first retrieval.
 expect(recommend().practice?.sense.id).toBe('saved-second');
 expect(recommend().practice?.recommendation).toMatchObject({mode:'definition',reason:'missing'});
});

test('personal definitions and tasks are retained without public replacements',()=>{
 const {entry,recommend}=fixture();entry.senses[0].definition='My edited classroom meaning.';entry.senses[0].example='My homeword example.';
 expect(recommend().practice?.sense).toMatchObject({definition:'My edited classroom meaning.',example:'My homeword example.'});
});

test('archived and incomplete meanings are not practice candidates or due cards',()=>{
 const {entry,learning,recommend}=fixture();entry.senses[0].definition=' ';learning.cards.dictation={due:new Date(past)} as never;
 expect(recommend().practice).toBeUndefined();expect(recommend().dueCards).toEqual([]);
 entry.senses[0].definition='A valid meaning.';entry.tags.push('archived');expect(recommend().practice).toBeUndefined();
});

test.each(['spelling','usage','group'] as const)('%s references retain their reading role instead of acquiring home practice',kind=>{
 const row=corrections.find(row=>kind==='group'?'meaningGroup' in row:kind==='usage'?'usageReference' in row:row.referenceOnly===true)!;
 expect(row).toBeDefined();
 const {store,recommend}=fixture();store.vocabulary[0]={...store.vocabulary[0],id:row.entryId,term:row.entryId.replace(/^vocab:/,''),senses:[{...row.originalSense,id:row.senseId} as VocabularySense]};
 expect(recommend().practice).toBeUndefined();
});

test('a reading note has supported alternatives and is never presented as a sentence-gap exercise',()=>{
 const row=corrections.find(row=>row.exampleKind==='reading-note'&&!('referenceOnly' in row)&&!('meaningGroup' in row))!;
 const {store,recommend}=fixture();store.vocabulary[0]={...store.vocabulary[0],id:row.entryId,term:row.entryId.replace(/^vocab:/,''),senses:[{...row.originalSense,id:row.senseId} as VocabularySense]};
 const result=recommend().practice!;expect(result.recommendation.mode).toBe('definition');expect(result.recommendation.alternatives).not.toContain('cloze');
});

test('all future modes expose the earliest valid date without mutating any saved schedule',()=>{
 const {store,learning,recommend}=fixture();for(const mode of ['definition','dictation','cloze','production'] as VocabularyMode[])learning.cards[mode]={due:new Date(future)} as never;
 const before=structuredClone(store);expect(recommend().practice?.recommendation).toMatchObject({status:'waiting',dueAt:future});expect(recommend().nextChangeAt).toBe(future);expect(store).toEqual(before);
});

test('the earliest change includes a waiting sense even when a different sense is ready now',()=>{
 const {store,add,recommend}=fixture();add('waiting');const learning=store.vocabularyStates.find(row=>row.entryId==='waiting')!;
 for(const mode of ['definition','dictation','cloze','production'] as VocabularyMode[])learning.cards[mode]={due:new Date(future)} as never;
 expect(recommend().practice?.entry.id).toBe('home-entry');expect(recommend().nextChangeAt).toBe(future);
});

test('legacy evidence without sense identity applies only to the saved primary meaning',()=>{
 const {store,entry,learning,recommend}=fixture();event(store);delete store.vocabularyEvidence[0].senseId;
 entry.senses.push({...entry.senses[0],id:'second'});
 expect(recommend().practice).toMatchObject({sense:{id:'saved-meaning'},recommendation:{mode:'dictation',reason:'missing'}});
 for(const mode of ['definition','dictation','cloze','production'] as VocabularyMode[])learning.cards[mode]={due:new Date(future)} as never;
 expect(recommend().practice?.sense.id).toBe('second');expect(recommend().practice?.recommendation.reason).toBe('missing');
});

test('account-wide state and evidence are indexed once rather than scanned for every saved meaning',()=>{
 const {store,add,recommend}=fixture();for(let n=0;n<12;n++){add(`entry-${n}`);event(store,`entry-${n}`);}
 const reads=vi.fn();for(const row of store.vocabularyEvidence){const entryId=row.entryId;Object.defineProperty(row,'entryId',{get(){reads();return entryId;},enumerable:true});}
 recommend();expect(reads.mock.calls.length).toBeLessThan(store.vocabularyEvidence.length*10);
});

test('invalid evaluation dates produce no suggestions or scheduled batch',()=>{
 const {store}=fixture();expect(getVocabularyHomePractice(store,'invalid')).toEqual({dueCards:[]});
});

test('a scheduled-only batch excludes unsaved public defaults and unscheduled modes without changing ordinary queues',()=>{
 const {store,entry,learning}=fixture();learning.cards.definition={due:new Date(past)} as never;
 const filter={now,dueOnly:true,scheduledOnly:true};
 expect(getVocabularyReviewQueue(store,filter).map(card=>card.mode)).toEqual(['definition']);
 expect(getVocabularyReviewQueue(store,{now,dueOnly:true}).length).toBeGreaterThan(1);
 const original=VOCABULARY_CATALOG.entries;
 VOCABULARY_CATALOG.entries=[{...entry,senses:[{...entry.senses[0],id:'unsaved-default'}]}] as typeof original;
 try{expect(getVocabularyReviewQueue(store,filter).every(card=>card.senseId==='saved-meaning')).toBe(true);}
 finally{VOCABULARY_CATALOG.entries=original;}
});
