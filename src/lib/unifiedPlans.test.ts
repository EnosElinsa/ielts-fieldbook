// @ts-nocheck
import { expect, test } from 'vitest';
import { emptyState } from '../domain';
import { completePlanIfMatched, completeVocabularyPlan, startPlan } from '../domain/plans';
import { ensureUnifiedPlans, nextUnifiedPlan, studyBudget, mutateStudyPlan } from './planTemplates';
import { addVocabularyItem, recordVocabularyReview } from '../domain/vocabulary';

const now = new Date('2026-10-13T12:00:00');
const setup = () => { const state = emptyState(); state.settings.days = [1,2,3,4,5,6,7]; return state; };

test('seven calendar days rotate all selected skills and are deterministic and idempotent', () => {
  const left = setup(); const right = setup();
  expect(ensureUnifiedPlans(left, undefined, now)).toEqual(ensureUnifiedPlans(right, undefined, now));
  expect(new Set(left.plans.map(plan => plan.skill))).toEqual(new Set(['writing','speaking','reading','listening']));
  const frozen = structuredClone(left.plans);
  ensureUnifiedPlans(left, undefined, now);
  left.settings.activeSkill = 'listening'; left.settings.targetBand = '8';
  ensureUnifiedPlans(left, undefined, now);
  expect(left.plans).toEqual(frozen);
  expect(left.plans).toHaveLength(7);
});

test('vocabulary uses at most one third and ten minutes, with short budgets reserved for due review', () => {
  for (const minutes of [5,15,20,29,30,60]) {
    const state = setup(); state.settings.dailyMinutes = minutes;
    state.wordbookEnrollments = [{id:'e',bookId:'book',updatedAt:''}];
    const budget = studyBudget(state.settings);
    expect(budget.vocabulary).toBeLessThanOrEqual(Math.floor(minutes/3));
    expect(budget.vocabulary).toBeLessThanOrEqual(10);
    const plans = ensureUnifiedPlans(state, undefined, now);
    for (const day of new Set(plans.map(plan=>plan.dateKey))) expect(plans.filter(plan=>plan.dateKey===day).reduce((sum,plan)=>sum+plan.estimatedMinutes,0)).toBeLessThanOrEqual(minutes);
    expect(plans.some(plan=>plan.target?.mode === 'learning-batch')).toBe(minutes>=30);
    expect(plans.some(plan=>plan.kind==='2'&&['timed','full'].includes(plan.deskMode)&&plan.estimatedMinutes<40)).toBe(false);
  }
});

test('edited, running and completed tasks survive budget regeneration; past unfinished tasks stay overdue', () => {
  const state = setup(); ensureUnifiedPlans(state, undefined, now);
  const manual = state.plans[0]; mutateStudyPlan(state, manual.id, {type:'reschedule', dateKey:'2026-10-12'});
  const running = state.plans[1]; startPlan(state, running.id, now.toISOString());
  const completed = state.plans[2]; completed.status = 'completed';
  const retained = structuredClone([manual,running,completed]);
  state.settings.dailyMinutes = 60; ensureUnifiedPlans(state, undefined, now);
  expect(retained.map(row=>state.plans.find(plan=>plan.id===row.id))).toEqual(retained);
  expect(nextUnifiedPlan(state.plans, now)?.id).toBe(running.id);
  expect(state.plans.find(row=>row.id===manual.id)?.dateKey).toBe('2026-10-12');
});

test('skip and restore are protected from generation', () => {
  const state = setup(); ensureUnifiedPlans(state, undefined, now);
  const plan = state.plans[0]; mutateStudyPlan(state,plan.id,{type:'skip'});
  ensureUnifiedPlans(state,undefined,now); expect(plan.status).toBe('skipped');
  mutateStudyPlan(state,plan.id,{type:'restore'}); expect(plan.status).toBe('pending'); expect(plan.origin).toBe('manual');
});

test('rolling seven-day extension continues the skill rotation and rescheduling does not duplicate ids',()=>{
  const state=setup();ensureUnifiedPlans(state,undefined,now);
  const nextDay=new Date(now);nextDay.setDate(nextDay.getDate()+1);ensureUnifiedPlans(state,undefined,nextDay);
  const newLast=state.plans.find(plan=>plan.dateKey==='2026-10-20');expect(newLast.skill).toBe('listening');
  const first=state.plans[0];mutateStudyPlan(state,first.id,{type:'reschedule',dateKey:'2026-10-25'});ensureUnifiedPlans(state,undefined,now);
  expect(new Set(state.plans.map(plan=>plan.id)).size).toBe(state.plans.length);
});

test('new due evidence replaces the prebuilt next-day task without exceeding its budget',()=>{
  const state=setup();state.wordbookEnrollments=[{id:'e',bookId:'missing-book',updatedAt:''}];
  ensureUnifiedPlans(state,undefined,now);
  const planned=structuredClone(state.plans.find(plan=>plan.dateKey==='2026-10-14'&&plan.skill!=='vocabulary'));
  expect(planned.kind).toBe('speaking-p1');
  state.sessions.push({id:'writing-source',skill:'writing'});
  state.errors.push({id:'due-writing',sourceSessionId:'writing-source',text:'Correct the comparison.',resolved:false,nextReviewAt:'2026-10-14T09:00:00'});
  const nextDay=new Date('2026-10-14T12:00:00');
  ensureUnifiedPlans(state,undefined,nextDay);
  const review=state.plans.find(plan=>plan.id===planned.id);
  expect(review).toMatchObject({dateKey:'2026-10-14',skill:'writing',kind:'review',estimatedMinutes:20,rotationIndex:1,target:{type:'error-review',errorIds:['due-writing']}});
  expect(nextUnifiedPlan(state.plans,nextDay)?.id).toBe(review.id);
  expect(state.plans.filter(plan=>plan.target?.type==='error-review')).toHaveLength(1);
  for(const date of new Set(state.plans.map(plan=>plan.dateKey)))expect(state.plans.filter(plan=>plan.dateKey===date).reduce((total,plan)=>total+plan.estimatedMinutes,0)).toBeLessThanOrEqual(30);
  const retained=structuredClone(state.plans);let saved=0;
  ensureUnifiedPlans(state,()=>saved++,nextDay);
  expect(state.plans).toEqual(retained);expect(saved).toBe(0);
});

test('due review uses the next untouched slot while manual, started, completed and skipped tasks remain protected',()=>{
  const state=setup();ensureUnifiedPlans(state,undefined,now);
  const manual=state.plans.find(plan=>plan.dateKey==='2026-10-14');manual.origin='manual';
  const started=state.plans.find(plan=>plan.dateKey==='2026-10-15');startPlan(state,started.id,now.toISOString());
  state.plans.find(plan=>plan.dateKey==='2026-10-16').status='completed';
  state.plans.find(plan=>plan.dateKey==='2026-10-17').status='skipped';
  const protectedPlans=structuredClone(state.plans.filter(plan=>plan.dateKey>='2026-10-14'&&plan.dateKey<='2026-10-17'));
  state.sessions.push({id:'source',skill:'writing'});
  state.errors.push({id:'due',sourceSessionId:'source',text:'Use the correction.',resolved:false,nextReviewAt:'2026-10-14T09:00:00'});
  const nextDay=new Date('2026-10-14T12:00:00');ensureUnifiedPlans(state,undefined,nextDay);
  expect(protectedPlans.map(plan=>state.plans.find(row=>row.id===plan.id))).toEqual(protectedPlans);
  expect(state.plans.find(plan=>plan.dateKey==='2026-10-18').target).toEqual({type:'error-review',errorIds:['due']});
  expect(nextUnifiedPlan(state.plans,nextDay)?.id).toBe(started.id);
});

test('new weakness evidence refreshes untouched writing targets and unchanged evidence preserves binding',()=>{
  const state=setup();state.settings.skills=['writing'];ensureUnifiedPlans(state,undefined,now);
  const first=state.plans.find(plan=>plan.dateKey==='2026-10-14');
  first.questionId='bound-before';first.target.questionId='bound-before';
  state.assessments.push({id:'weak',skill:'writing',date:'2026-10-14T09:00:00',practiceMode:'timed',criteria:[{name:'Task Response',score:'5'},{name:'Coherence and Cohesion',score:'7'}]});
  const nextDay=new Date('2026-10-14T12:00:00');ensureUnifiedPlans(state,undefined,nextDay);
  expect(first).toMatchObject({kind:'2',deskMode:'outline',driver:'criterion:TR',target:{type:'question',skill:'writing',mode:'outline'}});
  first.questionId='bound-after';first.target.questionId='bound-after';
  const retained=structuredClone(state.plans);let saved=0;ensureUnifiedPlans(state,()=>saved++,nextDay);
  expect(state.plans).toEqual(retained);expect(saved).toBe(0);
});

test('unchanged evidence keeps concrete section targets and object-valued assessment drivers',()=>{
  const state=setup();ensureUnifiedPlans(state,undefined,now);
  const writing=state.plans.find(plan=>plan.skill==='writing');writing.driver={type:'assessment',id:'feedback'};
  const reading=state.plans.find(plan=>plan.skill==='reading');reading.sectionId='bound-section';reading.target.sectionId='bound-section';reading.target.questionIds=['q1','q2'];
  const retained=structuredClone(state.plans);let saved=0;
  ensureUnifiedPlans(state,()=>saved++,now);
  expect(state.plans).toEqual(retained);expect(saved).toBe(0);
});

test('productive completion requires exact plan, target, time and compatible practice mode', () => {
  const state = setup(); ensureUnifiedPlans(state,undefined,now);
  const plan=state.plans.find(row=>row.skill==='writing'); plan.questionId='q'; plan.target.questionId='q'; startPlan(state,plan.id,now.toISOString());
  const attempt={id:'a',planId:plan.id,questionId:'q',skill:'writing',type:plan.kind,practiceMode:plan.deskMode,date:new Date(now.getTime()+1000).toISOString()};
  for (const patch of [{planId:'other'},{questionId:'other'},{practiceMode:'outline'},{date:'2026-10-12T12:00:00Z'}]) expect(completePlanIfMatched(state,plan.id,{...attempt,...patch})).toBeNull();
  expect(completePlanIfMatched(state,plan.id,attempt)?.status).toBe('completed');
});

test('vocabulary queue decrease, audio and wrong sessions cannot finish a plan', () => {
  const state=setup(); const plan={id:'v',kind:'vocabulary',status:'in_progress',startedAt:now.toISOString(),target:{type:'vocabulary',mode:'learning-batch',assessmentMode:'dictation',bookId:'b',unitId:'u',batchIndex:0,batchSize:10,cards:[{entryId:'e',senseId:'s'}]}};
  state.plans=[plan]; state.activePlanId='v';
  expect(completeVocabularyPlan(state,10,now.toISOString())).toBeNull();
  const session={id:'session',planId:'v',status:'submitted',mode:'dictation',startedAt:now.toISOString(),submittedAt:new Date(now.getTime()+1000).toISOString(),selection:{kind:'learning-batch',bookId:'b',unitId:'u',batchIndex:0,batchSize:10,cards:plan.target.cards},results:[{entryId:'e',senseId:'s',response:'word',result:'failure'}]};
  for(const patch of [{planId:'other'},{mode:'audio'},{mode:'production'},{results:[]},{selection:{...session.selection,batchIndex:1}},{startedAt:'2026-10-12T10:00:00Z'}]) expect(completeVocabularyPlan(state,{...session,...patch})).toBeNull();
  expect(completeVocabularyPlan(state,session)?.linkedSessionId).toBe('session');
});

test('a bound vocabulary submission completes its original task after switching tasks', () => {
  const state=setup();
  const plan={id:'v',kind:'vocabulary',status:'in_progress',startedAt:now.toISOString(),target:{type:'vocabulary',mode:'due-review',assessmentMode:'definition',cards:[{entryId:'e',senseId:'s'}]}};
  state.plans=[plan,{id:'other',kind:'reading-practice',status:'in_progress'}];state.activePlanId='other';
  const session={id:'session',planId:'v',status:'submitted',mode:'definition',startedAt:now.toISOString(),submittedAt:new Date(now.getTime()+1000).toISOString(),results:[{entryId:'e',senseId:'s',response:'meaning',result:'success'}]};
  expect(completeVocabularyPlan(state,session)?.id).toBe('v');
  expect(state.activePlanId).toBe('other');
  expect(completeVocabularyPlan(state,session)).toBeNull();
});

test('overdue pending tasks stay in planning and are not silently recommended as today work',()=>{
  expect(nextUnifiedPlan([{id:'old',status:'pending',dateKey:'2020-01-01'}],now)).toBeNull();
});

test('due review excludes unlearned words and keeps a supported preferred assessment mode',()=>{
  const state=setup();state.settings.dailyMinutes=15;state.settings.vocabulary.mode='dictation';
  const newWord=addVocabularyItem(state,{term:'newword',meaning:'An untouched word.'}).item;
  const learned=addVocabularyItem(state,{term:'learnedword',meaning:'A recalled word.'}).item;
  recordVocabularyReview(state,{entryId:learned.id,senseId:learned.senses[0].id,mode:'dictation',response:'wrong',result:'failure',occurredAt:'2020-01-01T00:00:00Z'});
  ensureUnifiedPlans(state,undefined,now);
  const plan=state.plans.find(row=>row.kind==='vocabulary');expect(plan.target.assessmentMode).toBe('dictation');
  expect(plan.target.cards.some(card=>card.entryId===newWord.id)).toBe(false);expect(plan.target.cards[0].entryId).toBe(learned.id);
});

test('newly due vocabulary replaces a prebuilt learning batch within its reserved budget',()=>{
  const state=setup();state.wordbookEnrollments=[{id:'e',bookId:'missing-book',updatedAt:''}];state.settings.vocabulary.mode='definition';
  ensureUnifiedPlans(state,undefined,now);
  const nextDay=new Date('2026-10-14T12:00:00');
  const batch=state.plans.find(plan=>plan.dateKey==='2026-10-14'&&plan.kind==='vocabulary');
  expect(batch.target.mode).toBe('learning-batch');
  const word=addVocabularyItem(state,{term:'recalledword',meaning:'A learned word.'}).item;
  recordVocabularyReview(state,{entryId:word.id,senseId:word.senses[0].id,mode:'definition',response:'wrong',result:'failure',occurredAt:'2020-01-01T00:00:00Z'});
  ensureUnifiedPlans(state,undefined,nextDay);
  expect(batch).toMatchObject({estimatedMinutes:10,target:{type:'vocabulary',mode:'due-review',assessmentMode:'definition',cards:[{entryId:word.id,senseId:word.senses[0].id}]}});
  expect(state.plans.filter(plan=>plan.dateKey==='2026-10-14').reduce((total,plan)=>total+plan.estimatedMinutes,0)).toBe(30);
  expect(state.plans.filter(plan=>plan.target?.mode==='due-review')).toHaveLength(1);
  const retained=structuredClone(state.plans);let saved=0;ensureUnifiedPlans(state,()=>saved++,nextDay);
  expect(state.plans).toEqual(retained);expect(saved).toBe(0);
});

test('vocabulary due priority preserves a started batch and uses the next automatic vocabulary slot',()=>{
  const state=setup();state.wordbookEnrollments=[{id:'e',bookId:'missing-book',updatedAt:''}];ensureUnifiedPlans(state,undefined,now);
  const batch=state.plans.find(plan=>plan.dateKey==='2026-10-14'&&plan.kind==='vocabulary');startPlan(state,batch.id,now.toISOString());
  const retained=structuredClone(batch);
  const word=addVocabularyItem(state,{term:'dueword',meaning:'Due for recall.'}).item;
  recordVocabularyReview(state,{entryId:word.id,senseId:word.senses[0].id,mode:'dictation',response:'wrong',result:'failure',occurredAt:'2020-01-01T00:00:00Z'});
  ensureUnifiedPlans(state,undefined,new Date('2026-10-14T12:00:00'));
  expect(state.plans.find(plan=>plan.id===batch.id)).toEqual(retained);
  expect(state.plans.find(plan=>plan.dateKey==='2026-10-15'&&plan.kind==='vocabulary').target.mode).toBe('due-review');
});

test('new learning honors batch-size and mode preferences, while appearance changes preserve plans',()=>{
  const state=setup();state.wordbookEnrollments=[{id:'e',bookId:'missing-book',updatedAt:''}];state.settings.vocabulary.learningBatchSize=5;state.settings.vocabulary.mode='definition';
  ensureUnifiedPlans(state,undefined,now);const batch=state.plans.find(row=>row.kind==='vocabulary');expect(batch.target).toMatchObject({batchSize:5,assessmentMode:'definition'});
  const before=structuredClone(state.plans);state.settings.vocabulary.volume=0.5;ensureUnifiedPlans(state,undefined,now);expect(state.plans).toEqual(before);
});

test('manual mock replacement requires its entire duration in the daily budget',()=>{
  const state=setup();ensureUnifiedPlans(state,undefined,now);const plan=state.plans[0];
  expect(()=>mutateStudyPlan(state,plan.id,{type:'replace',skill:'writing',kind:'writing-mock'})).toThrow('60 minutes');
  state.settings.dailyMinutes=60;mutateStudyPlan(state,plan.id,{type:'replace',skill:'writing',kind:'writing-mock'});
  expect(plan).toMatchObject({kind:'writing-mock',estimatedMinutes:60,origin:'manual',deskMode:'timed'});
});
