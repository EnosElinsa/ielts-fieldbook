// @ts-nocheck
import { expect, test } from 'vitest';
import { emptyState } from '../../domain';
import { ensureUnifiedPlans } from '../../lib/planTemplates';
import { settingsPlanPreview } from './settingsDraft';

test('raising the batch limit reports a saved seven-word task as preserved without changing its identities',()=>{
 const state=emptyState();state.settings.days=[1,2,3,4,5,6,7];state.settings.dailyMinutes=90;
 const saved={id:'saved-seven',dateKey:'2026-10-14',title:'Vocabulary - Learn 10 words',origin:'automatic',status:'pending',skill:'vocabulary',kind:'vocabulary',estimatedMinutes:30,target:{type:'vocabulary',mode:'learning-batch',binding:'frozen',batchSize:10,cards:Array.from({length:7},(_,i)=>({entryId:`word-${i}`,senseId:'sense'}))}};
 state.plans=[saved];const before=structuredClone(state);
 const preview=settingsPlanPreview(state.settings,{vocabulary:{learningBatchSize:20}},state.plans,'2026-10-14',state);
 expect(preview.preservedLearning).toEqual([saved]);
 expect(preview.affected).not.toContainEqual(saved);
 expect(preview.scheduled).toContainEqual(saved);
 expect(state).toEqual(before);
});

test('settings preview matches regeneration without changing the current schedule or protected work',()=>{
  const now=new Date('2026-10-14T12:00:00');const state=emptyState();
  state.settings.days=[1,2,3,4,5,6,7];ensureUnifiedPlans(state,undefined,now);
  const manual=state.plans.find(plan=>plan.dateKey==='2026-10-14');manual.origin='manual';
  const started=state.plans.find(plan=>plan.dateKey==='2026-10-15');started.status='in_progress';started.startedAt=now.toISOString();
  const before=structuredClone(state);
  const changes={dailyMinutes:90,planning:{...state.settings.planning,week:{4:{minutes:60,focus:'listening'},5:{minutes:0}},weights:{writing:3,speaking:1,reading:1,listening:1}}};
  const preview=settingsPlanPreview(state.settings,changes,state.plans,'2026-10-14',state);
  expect(state).toEqual(before);
  const actual=structuredClone(state);actual.settings={...actual.settings,...changes};
  const generated=ensureUnifiedPlans(actual,undefined,now);
  expect(preview.generated).toEqual(generated);
  expect(preview.affected.map(plan=>plan.id)).not.toContain(manual.id);
  expect(preview.affected.map(plan=>plan.id)).not.toContain(started.id);
  expect(actual.plans.find(plan=>plan.id===manual.id)).toEqual(manual);
  expect(actual.plans.find(plan=>plan.id===started.id)).toEqual(started);
});


test('settings preview includes missed-day recovery while preserving frozen work and live state',()=>{
  const now=new Date('2026-10-14T12:00:00'),state=emptyState();
  state.settings.days=[1,2,3,4,5,6,7];state.settings.skills=['writing'];
  const task=(id,patch={})=>({id,title:id,dateKey:'2026-10-14',origin:'automatic',status:'pending',skill:'writing',kind:'1',estimatedMinutes:10,target:{type:'question',skill:'writing',questionId:'q1',mode:'overview'},...patch});
  state.plans=[task('carry',{dateKey:'2026-10-01'}),task('waiting',{dateKey:'2026-10-01',estimatedMinutes:999}),task('manual',{origin:'manual'}),task('started',{status:'in_progress',startedAt:now.toISOString()}),task('frozen',{skill:'vocabulary',kind:'vocabulary',estimatedMinutes:1,target:{type:'vocabulary',binding:'frozen',mode:'due-review',assessmentMode:'definition',cards:[{entryId:'word',senseId:'sense'}]}}),task('stale-review',{dateKey:'2026-10-01',skill:'vocabulary',kind:'vocabulary',estimatedMinutes:1,target:{type:'vocabulary',mode:'due-review',binding:'dynamic',cards:[]}})];
  state.activePlanId='stale-review';state.drafts.q1={text:'Keep this draft'};
  const before=structuredClone(state),changes={dailyMinutes:60};
  const preview=settingsPlanPreview(state.settings,changes,state.plans,'2026-10-14',state);
  const actual=structuredClone(state);Object.assign(actual.settings,changes);
  expect(preview.generated).toEqual(ensureUnifiedPlans(actual,undefined,now));
  expect(state).toEqual(before);
  expect(preview.generated.find(plan=>plan.id==='carry')).toMatchObject({dateKey:'2026-10-14',originalDateKey:'2026-10-01',target:before.plans[0].target});
  for(const id of ['manual','started','frozen'])expect(preview.generated.find(plan=>plan.id===id)).toEqual(before.plans.find(plan=>plan.id===id));
  expect(preview.affected.map(plan=>plan.id).sort()).toEqual(['carry','stale-review','waiting']);
  expect(actual.plans.find(plan=>plan.id==='waiting')).toMatchObject({dateKey:'2026-10-01',waitingReason:expect.stringMatching(/carryover limit/i)});
  expect(settingsPlanPreview(state.settings,changes,state.plans,'2026-10-14',state)).toEqual(preview);
});
