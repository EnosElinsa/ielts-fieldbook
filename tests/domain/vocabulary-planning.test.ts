import {expect,test,vi} from 'vitest';
import {addVocabularyItem,getVocabularyReviewQueue,recordVocabularyReview} from '../../src/domain/vocabulary';
import {getVocabularyPlanningCandidates,getVocabularyPlanningCandidatesAsync} from '../../src/domain/vocabulary/planning';
import {getVocabularyNextPractice} from '../../src/domain/vocabulary/nextPractice';
import {buildVocabularySessionCommit,createVocabularySession,updateVocabularySessionAnswer} from '../../src/domain/vocabulary/session';
import type {VocabularyDimension,VocabularyStore} from '../../src/domain/vocabulary/types';

const now='2026-10-19T10:00:00.000Z',past='2026-10-17T09:00:00.000Z',future='2026-10-20T10:00:00.000Z';
function fixture(){
 const store={} as VocabularyStore;
 const add=(id:string)=>addVocabularyItem(store,{id,term:`word-${id}`,senses:[{id:'one',definition:'A classroom term.',example:`We use word-${id} in class.`,pos:'noun',source:'Personal note'}]},{now:()=>past}).item!;
 const entry=add('a');
 const evidence=(entryId='a',dimension:VocabularyDimension='meaning',at=past,senseId='one')=>store.vocabularyEvidence.push({entryId,senseId,id:`${entryId}:${senseId}:${dimension}:${at}`,mode:dimension==='meaning'?'definition':dimension==='usage'?'cloze':'dictation',dimension,result:'success',verification:'objective',sourceType:'personal',sourceId:'lesson',occurredAt:at});
 return {store,entry,add,evidence,learning:store.vocabularyStates[0],candidates:(preferred?:'definition'|'dictation')=>getVocabularyPlanningCandidates(store,now,preferred)};
}
const rows=(store:VocabularyStore,at=now,preferred?:'definition'|'dictation')=>getVocabularyPlanningCandidates(store,at,preferred).map(({card,reason})=>[card.entryId,card.senseId,card.mode,reason]);

test('planning a foundation review agrees with the full practice resolver across due, recovery and waiting modes',()=>{
 const {store,entry,learning,evidence}=fixture();evidence();
 entry.senses[0].distinctionTask={prompt:'Choose the classroom term.',answer:'word-a',options:['word-a','other'],explanation:'This is the classroom term.'};
 for(const due of [past,now,future])for(const active of [false,true]) {
  learning.cards.definition={due:new Date(due)} as never;
  learning.wrong.modes.dictation={active,successesSinceFailure:0,lastFailureAt:past};
  const expected=['definition','dictation'].flatMap(foundationMode=>{
   const result=getVocabularyNextPractice(store,entry,{senseId:'one',now,foundationMode:foundationMode as 'definition'|'dictation'});
   const card=getVocabularyReviewQueue(store,{entryId:entry.id,senseId:'one',mode:foundationMode as 'definition'|'dictation',now,dueOnly:false})[0];
   return result?.status==='ready' && card ? [{card,reason:result.reason}] : [];
  });
  const key=row=>JSON.stringify([row.card.entryId,row.card.senseId,row.card.mode,row.reason]);
  expect(getVocabularyPlanningCandidates(store,now).sort((a,b)=>key(a).localeCompare(key(b)))).toEqual(expected.sort((a,b)=>key(a).localeCompare(key(b))));
 }
});

test('foundation planning still verifies the frozen distinction task before prioritizing its mistake',()=>{
 const {store,entry}=fixture();
 entry.senses[0].distinctionTask={prompt:'Choose the classroom term.',answer:'word-a',options:['word-a','other'],explanation:'This is the classroom term.'};
 const card=getVocabularyReviewQueue(store,{entryId:'a',senseId:'one',mode:'distinction',dueOnly:false,now})[0];
 let session=updateVocabularySessionAnswer(createVocabularySession([card],'distinction',{}),card.id,'other');session.submittedAt=past;
 Object.assign(store,buildVocabularySessionCommit(store,session,[card]).state);
 expect(getVocabularyNextPractice(store,store.vocabulary[0],{senseId:'one',now,foundationMode:'definition'})).toMatchObject({reason:'error'});
 expect(getVocabularyPlanningCandidates(store,now)[0]).toMatchObject({reason:'error',card:{mode:'definition'}});
 store.vocabulary[0].senses[0].distinctionTask!.prompt='A different question.';
 expect(getVocabularyPlanningCandidates(store,now).some(row=>row.reason==='error')).toBe(false);
});

test('only attempted saved meanings qualify; adding a word does not invent learned senses',()=>{
 const {store,entry,evidence}=fixture();
 expect(rows(store)).toEqual([]);
 entry.senses.push({...entry.senses[0],id:'two',definition:'Another meaning.'});
 evidence();
 expect(rows(store)).toEqual([['a','one','dictation','missing'],['a','one','definition','spaced']]);
});

test('failed attempts qualify without inventing success, while public and archived meanings stay excluded',()=>{
 const {store,entry}=fixture();
 recordVocabularyReview(store,{entryId:'a',senseId:'one',mode:'dictation',result:'failure',occurredAt:past,response:'wrong'});
 expect(rows(store)[0]).toEqual(['a','one','dictation','recovery']);
 expect(rows(store).some(row=>row[3]==='missing')).toBe(true);
 entry.tags.push('archived');expect(rows(store)).toEqual([]);
});

test('scheduled due precedes missing; a future mode cannot borrow another mode or dimension date',()=>{
 const {store,learning,evidence}=fixture();evidence();
 learning.cards.definition={due:new Date(past)} as never;
 learning.cards.dictation={due:new Date(future)} as never;
 learning.dimensions.listening.nextReviewAt=past;
 expect(rows(store)).toEqual([['a','one','definition','due']]);
 expect(rows(store,future)).toEqual([['a','one','definition','due'],['a','one','dictation','due']]);
});

test('never-scheduled modes are missing opportunities even with an old creation date',()=>{
 const {store,learning,evidence}=fixture();evidence();
 learning.cards.definition={due:new Date(future)} as never;
 expect(rows(store)).toEqual([['a','one','dictation','missing']]);
});

test('spaced opportunities wait exactly 24 hours and recent uncounted repeats do not move the window',()=>{
 const {store,evidence}=fixture();
 for(const dimension of ['meaning','listening','spelling'] as const)evidence('a',dimension,now);
 expect(rows(store)).toEqual([]);
 expect(rows(store,'2026-10-20T09:59:59.999Z')).toEqual([]);
 expect(rows(store,future)).toEqual([['a','one','definition','spaced'],['a','one','dictation','spaced']]);
 for(const dimension of ['meaning','listening','spelling'] as const)evidence('a',dimension,'2026-10-19T18:00:00Z');
 expect(rows(store,future)).toHaveLength(2);
});

test('mastery keeps the saved FSRS schedule but stops unscheduled promotion drills',()=>{
 const {store,evidence,learning}=fixture();
 for(let day=0;day<5;day++)for(const dimension of ['meaning','listening','spelling'] as const)evidence('a',dimension,new Date(Date.UTC(2026,9,10+day)).toISOString());
 expect(rows(store)).toEqual([]);
 learning.cards.dictation={due:new Date(past)} as never;
 expect(rows(store)).toEqual([['a','one','dictation','due']]);
});

test('confirmed eligible errors lead recovery, due, missing and spaced work without changing saved state',()=>{
 const {store,add,evidence}=fixture();
 for(const id of ['b','c','d','e']){add(id);evidence(id);}
 const state=(id:string)=>store.vocabularyStates.find(row=>row.entryId===id)!;
 state('b').wrong.active=true;state('b').wrong.modes.dictation={active:true,successesSinceFailure:0};
 state('c').cards.definition={due:new Date(past)} as never;
 const card=getVocabularyReviewQueue(store,{entryId:'a',senseId:'one',mode:'dictation',dueOnly:false,now})[0];
 let session=updateVocabularySessionAnswer(createVocabularySession([card],'dictation',{}),card.id,'wrong');session.submittedAt=past;
 Object.assign(store,buildVocabularySessionCommit(store,session,[card]).state);
 const before=structuredClone(store),actual=getVocabularyPlanningCandidates(store,now);
 expect(actual.slice(0,3).map(({card,reason})=>[card.entryId,card.mode,reason])).toEqual([['a','dictation','error'],['b','dictation','recovery'],['c','definition','due']]);
 expect(actual.every(({card})=>['definition','dictation'].includes(card.mode))).toBe(true);
 expect(store).toEqual(before);
});

test('preference applies only among equivalent priorities and identity breaks ties deterministically',()=>{
 const {store,add}=fixture();add('b');
 for(const state of store.vocabularyStates)state.manualStatus='unfamiliar';
 expect(rows(store).slice(0,2)).toEqual([['a','one','definition','missing'],['a','one','dictation','missing']]);
 expect(rows(store,now,'dictation').slice(0,2)).toEqual([['a','one','dictation','missing'],['b','one','dictation','missing']]);
 store.vocabulary.reverse();store.vocabularyStates.reverse();
 expect(rows(store,now,'dictation').slice(0,2)).toEqual([['a','one','dictation','missing'],['b','one','dictation','missing']]);
});

test('invalid dates and future-only evidence do not create current candidates',()=>{
 const {store,evidence}=fixture();evidence('a','meaning',future);
 expect(rows(store)).toEqual([]);expect(rows(store,'invalid')).toEqual([]);
});

test('invalid saved dates alone cannot establish an attempted sense',()=>{
 const {store,learning}=fixture();learning.cards.definition={due:'invalid'} as never;
 expect(rows(store)).toEqual([]);
});

test('duplicate saved sense rows produce one opportunity per exact entry, sense and mode',()=>{
 const {store,entry,evidence}=fixture();evidence();entry.senses.push(structuredClone(entry.senses[0]));
 expect(rows(store)).toEqual([['a','one','dictation','missing'],['a','one','definition','spaced']]);
});

test('legacy states missing a manual label do not make untouched meanings learned',()=>{
 const {store,learning}=fixture();delete (learning as Partial<typeof learning>).manualStatus;
 expect(rows(store)).toEqual([]);
});

test('a submitted but unassessed production attempt opens foundation gaps without counting as success',()=>{
 const {store,entry}=fixture();
 const card=getVocabularyReviewQueue(store,{entryId:entry.id,senseId:'one',mode:'production',dueOnly:false,now})[0];
 let session=updateVocabularySessionAnswer(createVocabularySession([card],'production',{}),card.id,'I used this term in class.');session.submittedAt=past;
 Object.assign(store,buildVocabularySessionCommit(store,session,[card]).state);
 expect(rows(store)).toEqual([['a','one','definition','missing'],['a','one','dictation','missing']]);
});

test('large candidate scans yield to browser input while preserving exact priorities and saved evidence',async()=>{
 const {store,add,evidence,learning}=fixture();
 for(const id of ['b','c']){add(id);evidence(id);}
 learning.cards.definition={due:new Date(past)} as never;
 const expected=getVocabularyPlanningCandidates(store,now,'dictation'),before=structuredClone(store);
 let heartbeat=false;
 const beat=setTimeout(()=>{heartbeat=true;},0);
 const clock=vi.spyOn(performance,'now');let elapsed=0;clock.mockImplementation(()=>elapsed+=10);
 const background=vi.fn((callback:()=>void)=>new Promise<void>(resolve=>setTimeout(()=>{callback();resolve();},0)));
 vi.stubGlobal('scheduler',{yield:()=>Promise.resolve(),postTask:background});
 try {
  const actual=await getVocabularyPlanningCandidatesAsync(store,now,'dictation');
  expect(heartbeat).toBe(true);
  expect(background).toHaveBeenCalledWith(expect.any(Function),{priority:'background'});
  expect(actual).toEqual(expected);
  expect(store).toEqual(before);
 }finally{clearTimeout(beat);clock.mockRestore();vi.unstubAllGlobals();}
});
