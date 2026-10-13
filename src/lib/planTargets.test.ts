import { expect, test, vi } from 'vitest';
import { bindStudyPlanTargets, studyTargetSummary } from './planTargets';

test('binds concrete source targets before starting, limits question quantity and preserves protected work',async()=>{
  const state={plans:[
    {id:'write',status:'pending',kind:'1',rotationIndex:0,target:{type:'question',skill:'writing',questionId:null}},
    {id:'read',status:'pending',estimatedMinutes:6,rotationIndex:0,target:{type:'section',skill:'reading',sectionId:null}},
    {id:'running',status:'in_progress',target:{type:'section',skill:'reading',sectionId:'fixed'}},
  ],examAttempts:[]};
  const protectedPlan=structuredClone(state.plans[2]);
  const sources={bank:vi.fn().mockResolvedValue([{id:'q',type:'1',name:'A real chart'}]),catalog:vi.fn().mockResolvedValue({papers:[{id:'paper',title:'Test 1'}],sections:[{id:'section',paperId:'paper',skill:'reading',status:'ready',part:2}]}),section:vi.fn().mockResolvedValue({questions:Array.from({length:10},(_,index)=>({id:`q${index}`,sectionId:'section',number:index+1}))}),vocabulary:vi.fn()};
  await bindStudyPlanTargets(state,sources as any);
  expect(state.plans[0]).toMatchObject({questionId:'q',target:{questionId:'q'}});
  expect(state.plans[1]).toMatchObject({target:{sectionId:'section',questionIds:['q0','q1','q2']}});
  expect(state.plans[2]).toEqual(protectedPlan);
  expect(studyTargetSummary(state.plans[1])).toBe('Test 1 / Passage 2 · 3 questions');
  await bindStudyPlanTargets(state,sources as any);expect(sources.section).toHaveBeenCalledTimes(1);
});

test('unavailable sources fail visibly instead of saving an unbound future task',async()=>{
  const state={plans:[{status:'pending',target:{type:'section',skill:'listening',sectionId:null}}]};
  await expect(bindStudyPlanTargets(state,{catalog:async()=>({sections:[]} as any)} as any)).rejects.toThrow('question bank is unavailable');
});

test('manual mock replacements bind their first stage before saving',async()=>{
  const state={plans:[
    {kind:'writing-mock',status:'pending',target:{type:'question',skill:'writing',questionId:null}},
    {kind:'speaking-mock',status:'pending',target:{type:'question',skill:'speaking',questionId:null}},
  ]};
  await bindStudyPlanTargets(state,{bank:async(skill:string)=>skill==='writing'?[{id:'task-one',type:'1'}]:[{id:'part-one',part:'1'}]} as any);
  expect(state.plans[0].target.questionId).toBe('task-one');
  expect(state.plans[1].target).toMatchObject({questionId:'part-one',part:'1'});
});
