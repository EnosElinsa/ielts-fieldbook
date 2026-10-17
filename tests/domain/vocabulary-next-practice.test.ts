import {expect,test} from 'vitest';
import {addVocabularyItem} from '../../src/domain/vocabulary';
import {getVocabularyNextPractice} from '../../src/domain/vocabulary/nextPractice';
import type {VocabularyDimension,VocabularyEvidence,VocabularyMode,VocabularyStore} from '../../src/domain/vocabulary/types';
const now='2026-10-17T10:00:00.000Z',past='2026-10-16T09:00:00.000Z',future='2026-10-18T10:00:00.000Z';
function fixture(){
 const store={} as VocabularyStore;
 const {item:entry}=addVocabularyItem(store,{id:'personal-next',term:'nextword',senses:[{id:'one',pos:'noun',definition:'A classroom term.',example:'We practise nextword in class.',source:'Personal note',distinctionTask:{prompt:'A classroom term is _____.',answer:'used in class',options:['used in class','a planet'],explanation:'It belongs to the lesson.'}}]});
 return {store,entry:entry!,learning:store.vocabularyStates[0],recommend:()=>getVocabularyNextPractice(store,entry!,{senseId:'one',now})};
}
function evidence(store:VocabularyStore,dimension:VocabularyDimension,at=past,verification:VocabularyEvidence['verification']='objective',senseId='one'){
 store.vocabularyEvidence.push({id:dimension+':'+at+':'+senseId,entryId:'personal-next',senseId,dimension,mode:dimension==='usage'?'cloze':dimension==='meaning'?'definition':'dictation',result:'success',occurredAt:at,verification,sourceType:'personal',sourceId:'lesson'});
}
test('a new meaning starts with supported meaning recall and recommendation is read-only',()=>{
 const {store,recommend}=fixture(),before=structuredClone(store);
 expect(recommend()).toMatchObject({status:'ready',mode:'definition',reason:'missing',dimensions:['meaning']});
 expect(store).toEqual(before);
});
test('after meaning retrieval, missing listening and spelling recommend dictation',()=>{
 const {store,recommend}=fixture();evidence(store,'meaning');
 expect(recommend()).toMatchObject({status:'ready',mode:'dictation',reason:'missing',dimensions:['listening','spelling']});
});
test('missing usage prefers an authored distinction rather than assuming a sentence-gap exists',()=>{
 const {store,recommend}=fixture();for(const d of ['meaning','listening','spelling'] as const)evidence(store,d);
 expect(recommend()).toMatchObject({mode:'distinction',reason:'missing',dimensions:['usage']});
});
test('usage falls back from unavailable distinction and cloze to production with assessed-feedback guidance',()=>{
 const {store,entry,recommend}=fixture();delete entry.senses[0].distinctionTask;entry.senses[0].example='A contextual explanation without the headword.';
 for(const d of ['meaning','listening','spelling'] as const)evidence(store,d);
 expect(recommend()).toMatchObject({mode:'production',reason:'missing',dimensions:['usage']});
 expect(recommend()?.alternatives).not.toContain('cloze');
 expect(recommend()?.alternatives).not.toContain('distinction');
});
test('the oldest scheduled due exercise takes priority over a never-practised skill',()=>{
 const {learning,recommend}=fixture();learning.cards.cloze={due:new Date(past)} as never;
 expect(recommend()).toMatchObject({status:'ready',mode:'cloze',reason:'due',dueAt:past});
});
test('an eligible wrong-mode review takes priority and never switches to an unrelated mode',()=>{
 const {learning,recommend}=fixture();learning.cards.definition={due:new Date('2026-10-15T10:00:00Z')} as never;
 learning.cards.distinction={due:new Date(past)} as never;
 learning.wrong.active=true;learning.wrong.modes.distinction={active:true,successesSinceFailure:0};
 expect(recommend()).toMatchObject({mode:'distinction',reason:'recovery'});
});
test('a future recovery card is not promoted to an immediate recovery exercise',()=>{
 const {store,learning,recommend}=fixture();for(const d of ['meaning','listening','spelling','usage'] as const)evidence(store,d);
 learning.cards.distinction={due:new Date(future)} as never;learning.wrong.active=true;learning.wrong.modes.distinction={active:true,successesSinceFailure:0};
 expect(recommend()).toMatchObject({status:'waiting',mode:'distinction',dueAt:future});
});
test('a new skill remains available while a different reviewed mode waits for its due date',()=>{
 const {store,learning,recommend}=fixture();evidence(store,'meaning');learning.cards.definition={due:new Date(future)} as never;
 expect(recommend()).toMatchObject({status:'ready',mode:'dictation',reason:'missing',nextChangeAt:future});
 expect(recommend()?.alternatives).not.toContain('definition');
});
test.each(['pending','self-reported',undefined] as const)('unverified %s evidence does not conceal missing skill evidence',verification=>{
 const {store,recommend}=fixture();evidence(store,'meaning',past,verification);
 store.vocabularyEvidence[0].verification=verification;
 expect(recommend()).toMatchObject({mode:'definition',reason:'missing'});
});
test('another sense’s evidence and future card cannot alter the selected meaning’s recommendation',()=>{
 const {store,entry,recommend}=fixture();entry.senses.push({...entry.senses[0],id:'two',definition:'A different meaning.'});
 evidence(store,'meaning',past,'objective','two');
 store.vocabularyStates.push({...structuredClone(store.vocabularyStates[0]),id:'other',senseId:'two',cards:{definition:{due:new Date(future)} as never}});
 expect(recommend()).toMatchObject({mode:'definition',reason:'missing'});
});
test('a missing sense and archived word have no practice recommendation',()=>{
 const {store,entry,recommend}=fixture();
 expect(getVocabularyNextPractice(store,entry,{senseId:'missing',now})).toBeUndefined();
 entry.tags.push('archived');expect(recommend()).toBeUndefined();
});
test('invalid dates do not produce a false overdue claim',()=>{
 const {store,entry,learning,recommend}=fixture();learning.cards.definition={due:'bad date'} as never;
 expect(recommend()).toMatchObject({reason:'missing'});
 expect(getVocabularyNextPractice(store,entry,{senseId:'one',now:'bad date'})).toBeUndefined();
});
test('all supported future exercises keep the next review time rather than offering an early recommendation',()=>{
 const {learning,recommend}=fixture();for(const mode of ['definition','dictation','cloze','distinction','production'] as VocabularyMode[])learning.cards[mode]={due:new Date(future)} as never;
 expect(recommend()).toMatchObject({status:'waiting',dueAt:future});
 expect(recommend()?.alternatives).toEqual([]);
});
test('an unfinished meaning does not acquire a listening recommendation merely because the mode permits a blank definition',()=>{
 const {entry,recommend}=fixture();entry.senses[0].definition='';
 expect(recommend()).toBeUndefined();
});
test('an invalid wordbook scope cannot bypass the queue’s source restrictions',()=>{
 const {store,entry}=fixture();
 expect(getVocabularyNextPractice(store,entry,{senseId:'one',bookId:'not-a-book',unitId:'not-a-unit',now})).toBeUndefined();
});
test('verified skills with no saved schedule do not generate a false due review or declare mastery complete',()=>{
 const {store,recommend}=fixture();for(const d of ['meaning','listening','spelling','usage'] as const)evidence(store,d);
 expect(recommend()).toBeUndefined();
});
