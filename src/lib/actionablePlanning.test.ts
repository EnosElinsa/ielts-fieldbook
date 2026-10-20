// @ts-nocheck
import { expect, test } from 'vitest';
import { emptyState, migrateState } from '../domain';
import { addVocabularyItem, recordVocabularyReview } from '../domain/vocabulary';
import { ensureUnifiedPlans, mutateStudyPlan, studyBudget } from './planTemplates';
import { VOCABULARY_CATALOG } from '../domain/vocabulary/catalog';
const now = new Date('2026-10-14T12:00:00');
const setup = () => { const state=emptyState(); state.settings.days=[1,2,3,4,5,6,7]; state.settings.dailyMinutes=90; return state; };
test('new 90-minute schedules split into several skills with bounded task sizes and no duplicates',()=>{
  const state=setup(); const tasks=ensureUnifiedPlans(state,undefined,now).filter(p=>p.dateKey==='2026-10-14');
  expect(studyBudget(state.settings).vocabulary).toBe(18);
  expect(tasks.length).toBeGreaterThan(2); expect(new Set(tasks.map(p=>p.skill)).size).toBeGreaterThan(2);
  expect(tasks.reduce((n,p)=>n+p.estimatedMinutes,0)).toBeLessThanOrEqual(90);
  expect(tasks.every(p=>p.estimatedMinutes<=30)).toBe(true);
  const before=structuredClone(state.plans);ensureUnifiedPlans(state,undefined,now);expect(state.plans).toEqual(before);
});
test('weekday overrides and weights control generation and disabled days remain empty',()=>{
  const state=setup(); state.settings.planning={...state.settings.planning, vocabularyMode:'fixed',vocabularyMinutes:0, weights:{writing:4,speaking:0,reading:1,listening:0},week:{3:{minutes:60,focus:'writing'},4:{minutes:0}}};
  const tasks=ensureUnifiedPlans(state,undefined,now).filter(p=>p.dateKey==='2026-10-14');
  expect(tasks.reduce((n,p)=>n+p.estimatedMinutes,0)).toBe(60);expect(tasks.every(p=>p.skill==='writing')).toBe(true);
  expect(state.plans.filter(p=>p.dateKey==='2026-10-15')).toHaveLength(0);
});
test('old settings migrate with an explicit ten-minute vocabulary budget',()=>{
  const old=migrateState({settings:{dailyMinutes:90,days:[3]}});
  expect(old.settings.planning).toMatchObject({vocabularyMode:'fixed',vocabularyMinutes:10});expect(studyBudget(old.settings).vocabulary).toBe(10);
});

test('fresh account profiles use the twenty-percent vocabulary default',()=>{
  for (const raw of [{}, {settings:{}}]) {
    expect(migrateState(raw).settings.planning).toMatchObject({vocabularyMode:'ratio',vocabularyPercent:20});
  }
});

test('full-task preference allocates complete writing blocks before the short remainder',()=>{
  const state=setup();state.settings.focus='task2';
  state.settings.planning={...state.settings.planning,vocabularyMode:'fixed',vocabularyMinutes:0,preferFullTasks:true,week:{3:{focus:'writing'}}};
  const tasks=ensureUnifiedPlans(state,undefined,now).filter(p=>p.dateKey==='2026-10-14');
  expect(tasks.map(p=>p.estimatedMinutes).sort((a,b)=>b-a)).toEqual([40,40,10]);
  expect(tasks.filter(p=>p.deskMode==='timed')).toHaveLength(2);
});
test('add, resize and duplicate require explicit over-budget confirmation and clear completion bindings',()=>{
  const state=setup(); state.settings.dailyMinutes=30;
  const added=mutateStudyPlan(state,null,{type:'add',dateKey:'2026-10-14',skill:'writing',practice:'outline',estimatedMinutes:20},now);
  expect(added).toMatchObject({origin:'manual',status:'pending',estimatedMinutes:20,target:{mode:'outline'}});
  expect(()=>mutateStudyPlan(state,added.id,{type:'duplicate',dateKey:added.dateKey},now)).toThrow(/budget/i);
  const copy=mutateStudyPlan(state,added.id,{type:'duplicate',dateKey:added.dateKey,allowOverBudget:true},now);
  expect(copy.id).not.toBe(added.id); expect(copy.linkedSessionId).toBeNull();
  expect(()=>mutateStudyPlan(state,added.id,{type:'resize',estimatedMinutes:25},now)).toThrow(/budget/i);
  mutateStudyPlan(state,added.id,{type:'resize',estimatedMinutes:25,allowOverBudget:true},now);
  expect(added.estimatedMinutes).toBe(25);
});
test('manual replacement validates full task duration and preserves explicit question choice',()=>{
  const state=setup(); state.questions=[{id:'q2',type:'2',title:'Specific question'}];
  const p=mutateStudyPlan(state,null,{type:'add',dateKey:'2026-10-14',skill:'writing',practice:'outline',estimatedMinutes:15,questionId:'q2'},now);
  expect(p.target).toMatchObject({questionId:'q2',mode:'outline'});
  expect(()=>mutateStudyPlan(state,p.id,{type:'replace',skill:'writing',practice:'task2-timed',estimatedMinutes:15},now)).toThrow(/40/);
  expect(p.target.questionId).toBe('q2');
});

test('resize applies the same minimum duration as an explicitly selected practice',()=>{
  const state=setup();
  const task=mutateStudyPlan(state,null,{type:'add',dateKey:'2026-10-14',skill:'writing',practice:'body',estimatedMinutes:10},now);
  expect(()=>mutateStudyPlan(state,task.id,{type:'resize',estimatedMinutes:1},now)).toThrow(/10 minutes/);
  expect(task.estimatedMinutes).toBe(10);
  state.settings.focus='task2';
  const timed=mutateStudyPlan(state,null,{type:'add',dateKey:'2026-10-14',skill:'writing',practice:'recommended',estimatedMinutes:40},now);
  expect(()=>mutateStudyPlan(state,timed.id,{type:'resize',estimatedMinutes:5},now)).toThrow(/40 minutes/);
});

test('a focus day keeps due reviews in its selected module even when multiple tasks are disabled',()=>{
 const state=setup();state.settings.planning={...state.settings.planning,multipleTasks:false,week:{3:{minutes:90,focus:'listening'}}};
 state.sessions=[{id:'source',skill:'writing'}];state.errors=[{id:'e',sourceSessionId:'source',text:'Review writing',resolved:false}];
 const tasks=ensureUnifiedPlans(state,undefined,now).filter(p=>p.dateKey==='2026-10-14');
 expect(tasks.every(p=>p.skill==='listening')).toBe(true);
});
test('large vocabulary allocations split into distinct bounded batches',()=>{
 const state=setup(),unit={id:'large-allocation-group',bookId:'large-allocation-book',kind:'group',order:1,entryIds:Array.from({length:65},(_,i)=>`large-allocation-${i}`)};state.wordbookEnrollments=[{bookId:unit.bookId,id:'enrolled'}];
 state.settings.planning={...state.settings.planning,vocabularyMode:'fixed',vocabularyMinutes:65,blockMinutes:25,newWordsPerDay:65};
 VOCABULARY_CATALOG.units.push(unit);
 try{
 const tasks=ensureUnifiedPlans(state,undefined,now).filter(p=>p.dateKey==='2026-10-14'&&p.skill==='vocabulary');
 expect(tasks.length).toBeGreaterThan(1);expect(tasks.every(p=>p.estimatedMinutes<=25)).toBe(true);
 expect(new Set(tasks.map(p=>p.target.batchIndex)).size).toBe(tasks.length);
 expect(tasks.flatMap(p=>p.target.entryIds)).toEqual(unit.entryIds);
 }finally{VOCABULARY_CATALOG.units.splice(VOCABULARY_CATALOG.units.indexOf(unit),1);}
});

test('split due-recall tasks cover each word once and remain stable on refresh',()=>{
 const state=setup();state.settings.vocabulary.mode='definition';
 state.settings.planning={...state.settings.planning,vocabularyMode:'fixed',vocabularyMinutes:65,blockMinutes:25};
 for(let index=0;index<65;index++) {
   const word=addVocabularyItem(state,{term:`recallword${index}`,meaning:'A recalled word.'}).item;
   recordVocabularyReview(state,{entryId:word.id,senseId:word.senses[0].id,mode:'definition',response:'wrong',result:'failure',occurredAt:'2020-01-01T00:00:00Z'});
 }
 const tasks=ensureUnifiedPlans(state,undefined,now).filter(p=>p.dateKey==='2026-10-14'&&p.skill==='vocabulary');
 expect(tasks.reduce((sum,plan)=>sum+plan.target.batchSize,0)).toBe(65);
 expect(tasks.every(plan=>plan.target.binding==='dynamic'&&plan.target.cards.length===0&&plan.target.assessmentMode==='definition'&&plan.estimatedMinutes===plan.target.batchSize)).toBe(true);
 const before=structuredClone(state.plans);ensureUnifiedPlans(state,undefined,now);expect(state.plans).toEqual(before);
});
test('rescheduling and restores honor overridden rest-day capacity',()=>{
 const state=setup();state.settings.planning={...state.settings.planning,week:{4:{minutes:0}}};
 const task=mutateStudyPlan(state,null,{type:'add',dateKey:'2026-10-14',skill:'speaking',practice:'speaking-p1',estimatedMinutes:10},now);
 expect(()=>mutateStudyPlan(state,task.id,{type:'reschedule',dateKey:'2026-10-15'},now)).toThrow(/budget/i);
 mutateStudyPlan(state,task.id,{type:'reschedule',dateKey:'2026-10-15',allowOverBudget:true},now);
 mutateStudyPlan(state,task.id,{type:'skip'},now);
 expect(()=>mutateStudyPlan(state,task.id,{type:'restore'},now)).toThrow(/budget/i);
 expect(task.status).toBe('skipped');
});
