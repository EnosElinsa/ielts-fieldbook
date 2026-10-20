import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {addVocabularyItem,getVocabularyReviewQueue,recordVocabularyReview} from '../../src/domain/vocabulary';
import {getVocabularyNextPractice} from '../../src/domain/vocabulary/nextPractice';
import {buildVocabularySessionCommit,createVocabularySession,updateVocabularySessionAnswer} from '../../src/domain/vocabulary/session';
import type {VocabularyEntry,VocabularyMode,VocabularyStore} from '../../src/domain/vocabulary/types';
import {resolveVocabularyLearningContext} from '../../src/domain/vocabulary/context';

const past='2026-10-16T09:00:00.000Z',now='2026-10-17T10:00:00.000Z',future='2026-10-18T10:00:00.000Z';
const corrections=JSON.parse(readFileSync('src/domain/vocabulary/readinessCorrections.json','utf8'));
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));

function failed(mode:VocabularyMode='dictation',response='practse',publicSense?:string){
  const store={} as VocabularyStore;
  let entry:VocabularyEntry;
  if(publicSense){
    const correction=corrections.find((row:any)=>row.senseId===publicSense);
    const raw=catalog.entries.find((row:VocabularyEntry)=>row.id===correction.entryId)!;
    entry=addVocabularyItem(store,{...structuredClone(raw),senses:[{...correction.originalSense,id:publicSense,definition:correction.definition,example:correction.example,distinctionTask:correction.distinctionTask}]}).item!;
  }else{
    entry=addVocabularyItem(store,{id:'error-word',term:'practise',senses:[{id:'error-sense',pos:'verb',definition:'To do an activity repeatedly to improve.',example:'We practise every week.',source:'Personal note',distinctionTask:{prompt:'Choose the classroom activity.',options:['practise','sleep'],answer:'practise',explanation:'Repeated activity helps learning.'}}]}).item!;
  }
  const senseId=publicSense||'error-sense';
  const card=getVocabularyReviewQueue(store,{entryId:entry.id,senseId,mode,dueOnly:false,now})[0];
  let session=createVocabularySession([card],mode,{},{});
  session=updateVocabularySessionAnswer(session,card.id,response);
  session.submittedAt=past;
  const commit=buildVocabularySessionCommit(store,session,[card]);Object.assign(store,commit.state);
  const record=store.vocabularySessions![0],learning=store.vocabularyStates.find(row=>row.entryId===entry.id&&row.senseId===senseId)!;
  const recommend=()=>getVocabularyNextPractice(store,store.vocabulary.find(row=>row.id===entry.id)!,{senseId,now});
  return {store,entry,record,learning,recommend,senseId};
}

test('a frozen dictation mismatch recommends spelling practice without inventing a listening diagnosis or changing evidence',()=>{
  const {store,record,recommend}=failed(),before=structuredClone(store);
  expect(recommend()).toMatchObject({reason:'error',mode:'dictation',error:{kind:'spelling',sessionId:record.id,failedMode:'dictation',response:'practse',expectedAnswer:'practise'}});
  expect(store).toEqual(before);
});

test('a reviewed wrong meaning choice recommends recall for that exact meaning instead of repeating every distinction',()=>{
  const {recommend}=failed('distinction','effect','kaikki:2114daefbbfa5151d9');
  expect(recommend()).toMatchObject({reason:'error',mode:'definition',error:{kind:'meaning-choice',failedMode:'distinction'}});
});

test.each([
  ['wiktionary:restored:58b5ddc2149e0cd3d7','affect','cloze'],
  ['kaikki:c31ade81ff9fbe8d7b','new audience','distinction'],
  ['kaikki:77192ff4a41efe8dde','the property named as a direct object','cloze'],
] as const)('an exact reviewed construction choice %s selects supported contextual practice', (sense,response,mode)=>{
  const {recommend}=failed('distinction',response,sense);
  expect(recommend()).toMatchObject({reason:'error',mode,error:{kind:'collocation-choice'}});
});

test('an unclassified authored option gets neutral choice feedback rather than a guessed semantic diagnosis',()=>{
  const {recommend}=failed('distinction','sleep');
  expect(recommend()).toMatchObject({reason:'error',mode:'distinction',error:{kind:'choice'}});
});

test.each(['','some arbitrary free text'])('an unconfirmed response %j retains ordinary recovery without a specific diagnosis',response=>{
  const {recommend}=failed('distinction',response,'kaikki:2114daefbbfa5151d9');
  expect(recommend()).toMatchObject({mode:'distinction',reason:'recovery'});
  expect(recommend()).not.toHaveProperty('error');
});

test('a personal replacement cannot inherit a public meaning-choice binding',()=>{
  const {store,record,recommend}=failed('distinction','effect','kaikki:2114daefbbfa5151d9');
  const card=record.cardSnapshots![0];card.entry.senses.find(row=>row.id===card.senseId)!.source='Personal note';
  store.vocabulary[0].senses.find(row=>row.id===card.senseId)!.source='Personal note';
  expect(recommend()?.error?.kind).not.toBe('meaning-choice');
});

test('an amended prompt cannot inherit a reviewed construction diagnosis',()=>{
  const {record,recommend}=failed('distinction','new audience','kaikki:c31ade81ff9fbe8d7b');
  record.cardSnapshots![0].task!.prompt='Which of these options?';record.results[0].prompt='Which of these options?';
  expect(recommend()?.error?.kind).not.toBe('collocation-choice');
});

test.each(['missing-snapshot','wrong-answer','wrong-prompt','wrong-card','wrong-sense'] as const)('inconsistent frozen evidence (%s) does not diagnose the learner',change=>{
  const {record,recommend}=failed();
  if(change==='missing-snapshot')delete record.cardSnapshots;
  if(change==='wrong-answer')record.results[0].expectedAnswer='something else';
  if(change==='wrong-prompt')record.results[0].prompt='An unrelated prompt';
  if(change==='wrong-card')record.cardSnapshots![0].entryId='other-entry';
  if(change==='wrong-sense')record.cardSnapshots![0].senseId='other-sense';
  expect(recommend()).toMatchObject({reason:'recovery'});
  expect(recommend()).not.toHaveProperty('error');
});

test('a UK/US accepted spelling cannot become a diagnosed failure through an old result flag',()=>{
  const {record,recommend}=failed();record.results[0].response='practice';
  expect(recommend()).not.toHaveProperty('error');
});

test('recovered mistakes do not regain an error recommendation from historical failures',()=>{
  const {store,entry,senseId,recommend}=failed();
  for(const at of ['2026-10-16T09:30:00Z','2026-10-16T10:30:00Z','2026-10-17T09:30:00Z'])recordVocabularyReview(store,{entryId:entry.id,senseId,mode:'dictation',result:'success',occurredAt:at,verification:'objective'});
  expect(recommend()).not.toHaveProperty('error');
});

test('a later unconfirmed failure supersedes an older confirmed error',()=>{
  const {learning,recommend}=failed();learning.wrong.modes.dictation!.lastFailureAt='2026-10-16T12:00:00Z';
  expect(recommend()).toMatchObject({reason:'recovery'});expect(recommend()).not.toHaveProperty('error');
});

test('current edited meaning content does not inherit a frozen earlier diagnosis',()=>{
  const {store,recommend}=failed();store.vocabulary[0].senses[0].definition='A different learner meaning.';
  expect(recommend()).not.toHaveProperty('error');
});

test('unassessed or self-reported production is never a confirmed cause',()=>{
  const {recommend}=failed('production','I tried to use this word.');
  expect(recommend()).not.toHaveProperty('error');
});

test('a future remedial mode uses an eligible same-meaning alternative and preserves the original recovery date',()=>{
  const {learning,recommend}=failed('distinction','effect','kaikki:2114daefbbfa5151d9');learning.cards.definition={due:new Date(future)} as never;
  const before=structuredClone(learning);
  expect(recommend()).toMatchObject({reason:'error',mode:'distinction',error:{kind:'meaning-choice'},nextChangeAt:future});
  expect(recommend()?.alternatives).not.toContain('definition');expect(learning).toEqual(before);
});

test('a scheduled failed mode may receive supporting practice without falsely clearing that mode',()=>{
  const {learning,recommend}=failed();learning.cards.dictation={due:new Date(future)} as never;
  expect(recommend()).toMatchObject({reason:'error',mode:'definition',error:{kind:'spelling',failedMode:'dictation'}});
  expect(recommend()?.alternatives).not.toContain('dictation');expect(learning.wrong.modes.dictation?.active).toBe(true);
});

test('when every supported mode is in the future, a confirmed error cannot offer immediate practice',()=>{
  const {learning,recommend}=failed();for(const mode of ['definition','dictation','distinction','cloze','production'] as const)learning.cards[mode]={due:new Date(future)} as never;
  expect(recommend()).toMatchObject({status:'waiting',alternatives:[],dueAt:future});
});

test('another meaning cannot acquire this meaning’s active diagnosis',()=>{
  const {store}=failed();const entry=store.vocabulary[0];entry.senses.push({...entry.senses[0],id:'another',definition:'Another meaning.'});
  expect(getVocabularyNextPractice(store,entry,{senseId:'another',now})).not.toHaveProperty('error');
});

test.each([
 ['kaikki:2114daefbbfa5151d9','effect','meaning-choice'],
 ['kaikki:7df9fe0ca5374e80eb','affect','meaning-choice'],
 ['wiktionary:restored:58b5ddc2149e0cd3d7','affect','collocation-choice'],
 ['kaikki:ef5997c3855c279b2a','adopt','meaning-choice'],
 ['kaikki:c31ade81ff9fbe8d7b','new audience','collocation-choice'],
 ['kaikki:345af12a704f4fb2a2','adopt','meaning-choice'],
 ['kaikki:fb00f6f8bd508b5623','adapt','meaning-choice'],
 ['kaikki:03f69c4a1cff400bce','a risk covered by an insurance policy','collocation-choice'],
 ['kaikki:77192ff4a41efe8dde','the property named as a direct object','collocation-choice'],
] as const)('reviewed focus %s remains attached to its actual frozen question', (sense,response,kind)=>{
 expect(failed('distinction',response,sense).recommend()).toMatchObject({reason:'error',error:{kind}});
});

test.each(['pos','example','source','task'] as const)('current %s edits cannot reuse an old confirmed diagnosis',field=>{
 const {store,recommend,senseId}=failed('distinction','effect','kaikki:2114daefbbfa5151d9');
 const sense=store.vocabulary[0].senses[0];
 expect(sense.id).toBe(senseId);
 if(field==='task')sense.distinctionTask!.prompt='A new personal question.';
 else sense[field]='Changed learner content';
 const resolved=resolveVocabularyLearningContext(store.vocabulary[0],{senseId});
 expect(resolved.sense).toMatchObject(sense);
 expect(recommend()).not.toHaveProperty('error');
});

test('an ambiguous same-time unconfirmed failure blocks a specific diagnosis',()=>{
 const {store,record,recommend}=failed('distinction','effect','kaikki:2114daefbbfa5151d9');
 const other=structuredClone(record);other.id='another-session';other.results[0].response='arbitrary free text';store.vocabularySessions!.push(other);
 expect(recommend()).not.toHaveProperty('error');
});

test('future-dated failures cannot generate a current diagnosis',()=>{
 const {record,learning,recommend}=failed();record.submittedAt=future;learning.wrong.modes.dictation!.lastFailureAt=future;
 expect(recommend()).not.toHaveProperty('error');
});
