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
test('usage stays optional while foundation recall continues towards Familiar',()=>{
 const {store,recommend}=fixture();for(const d of ['meaning','listening','spelling'] as const)evidence(store,d);
 expect(recommend()).toMatchObject({mode:'definition',reason:'spaced',dimensions:['meaning']});
 expect(recommend()?.alternatives).toContain('distinction');
});
test('unavailable specialist tasks do not replace foundation progress with production',()=>{
 const {store,entry,recommend}=fixture();delete entry.senses[0].distinctionTask;entry.senses[0].example='A contextual explanation without the headword.';
 for(const d of ['meaning','listening','spelling'] as const)evidence(store,d);
 expect(recommend()).toMatchObject({mode:'definition',reason:'spaced',dimensions:['meaning']});
 expect(recommend()?.alternatives).toContain('production');
 expect(recommend()?.alternatives).not.toContain('cloze');
 expect(recommend()?.alternatives).not.toContain('distinction');
});
test('a scheduled due foundation exercise takes priority over a never-practised skill',()=>{
 const {learning,recommend}=fixture();learning.cards.dictation={due:new Date(past)} as never;
 expect(recommend()).toMatchObject({status:'ready',mode:'dictation',reason:'due',dueAt:past});
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
 expect(recommend()).toMatchObject({status:'ready',mode:'definition',reason:'spaced',nextChangeAt:future});
 expect(recommend()?.alternatives).not.toContain('distinction');
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
test('verified skills with no saved schedule continue towards Familiar without a false overdue claim',()=>{
 const {store,recommend}=fixture();for(const d of ['meaning','listening','spelling','usage'] as const)evidence(store,d);
 expect(recommend()).toMatchObject({status:'ready',mode:'definition',reason:'spaced',target:'familiar',dimensions:['meaning']});
 expect(recommend()).not.toHaveProperty('dueAt');
});

function successes(store:VocabularyStore,days:number,at='2026-10-10T09:00:00.000Z'){
 for(let day=0;day<days;day++)for(const dimension of ['meaning','listening','spelling','usage'] as const)
  evidence(store,dimension,new Date(Date.parse(at)+day*86400000).toISOString());
}
function production(store:VocabularyStore,at=past,verification:VocabularyEvidence['verification']='assessed'){
 evidence(store,'usage',at,verification);const event=store.vocabularyEvidence.at(-1)!;event.id='production:'+at;event.mode='production';
}
test('same-day successes wait for the next eligible spaced retrieval without creating a saved due card',()=>{
 const {store,recommend}=fixture();for(const d of ['meaning','listening','spelling','usage'] as const)evidence(store,d,now);
 const before=structuredClone(store);
 expect(recommend()).toMatchObject({status:'waiting',mode:'definition',dueAt:future,nextChangeAt:future,reason:'spaced',target:'familiar'});
 expect(store).toEqual(before);
});
test('the exact 24-hour boundary permits another spaced success',()=>{
 const {store,entry}=fixture();for(const d of ['meaning','listening','spelling','usage'] as const)evidence(store,d,now);
 expect(getVocabularyNextPractice(store,entry,{senseId:'one',now:'2026-10-18T09:59:59.999Z'})?.status).toBe('waiting');
 expect(getVocabularyNextPractice(store,entry,{senseId:'one',now:future})).toMatchObject({status:'ready',mode:'definition',reason:'spaced'});
});
test('a recent repetition does not postpone the window measured from the last counted success',()=>{
 const {store,recommend}=fixture();for(const d of ['meaning','listening','spelling','usage'] as const){evidence(store,d,past);evidence(store,d,'2026-10-16T18:00:00Z');}
 expect(recommend()).toMatchObject({status:'ready',reason:'spaced',mode:'definition'});
});
test('remaining skills are ordered by their verified spaced progress',()=>{
 const {store,recommend}=fixture();successes(store,1);evidence(store,'meaning','2026-10-11T09:00:00Z');
 expect(recommend()).toMatchObject({mode:'dictation',reason:'spaced',dimensions:['listening','spelling'],target:'familiar'});
});
test('a future saved definition keeps its due date while dictation continues spaced learning',()=>{
 const {store,learning,recommend}=fixture();successes(store,1);learning.cards.definition={due:new Date(future)} as never;
 expect(recommend()).toMatchObject({mode:'dictation',reason:'spaced',dimensions:['listening','spelling'],nextChangeAt:future});
 expect(recommend()?.alternatives).not.toContain('definition');expect(learning.cards.definition?.due).toEqual(new Date(future));
});
test('Familiar meanings continue foundation recall towards Mastered',()=>{
 const {store,recommend}=fixture();successes(store,3);
 expect(recommend()).toMatchObject({mode:'definition',reason:'spaced',target:'mastered',dimensions:['meaning']});
});
test.each(['pending','self-reported','objective'] as const)('%s production does not add requirements after foundation mastery',verification=>{
 const {store,recommend}=fixture();successes(store,5);production(store,'2026-10-15T09:00:00Z',verification);production(store,past,verification);
 expect(recommend()).toBeUndefined();
});
test('same-day assessed productions remain independent after foundation mastery',()=>{
 const {store,recommend}=fixture();successes(store,5);production(store,now);production(store,'2026-10-17T10:00:01Z');
 expect(recommend()).toBeUndefined();
});
test('future optional production scheduling does not create a foundation requirement',()=>{
 const {store,learning,recommend}=fixture();successes(store,5);learning.cards.production={due:new Date(future)} as never;
 expect(recommend()).toBeUndefined();
});
test('five spaced skill successes and two assessed production successes finish the unscheduled recommendation',()=>{
 const {store,recommend}=fixture();successes(store,5);production(store,'2026-10-14T09:00:00Z');production(store,past);
 expect(recommend()).toBeUndefined();
});
test('future-dated evidence cannot hide a skill that needs its first verified retrieval now',()=>{
 const {store,recommend}=fixture();evidence(store,'meaning',future);
 expect(recommend()).toMatchObject({mode:'definition',reason:'missing'});
});
