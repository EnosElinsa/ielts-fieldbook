import { expect, test, vi } from 'vitest';
import { bindStudyPlanTargets, studyPlanTitle, studyTargetSummary } from './planTargets';
import { mutateStudyPlan } from './planTemplates';
import { emptyState } from '../domain/state';
import { addVocabularyItem } from '../domain/vocabulary';
import { VOCABULARY_CATALOG } from '../domain/vocabulary/catalog';

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
  await bindStudyPlanTargets(state,{bank:async(skill:string)=>skill==='writing'?[{id:'task-one',type:'1'}]:[{id:'part-one',part:'1',title:'Home'},{id:'part-two',part:'2',title:'Friend'}]} as any);
  expect(state.plans[0].target.questionId).toBe('task-one');
  expect(state.plans[1].target).toMatchObject({questionId:'part-one',part:'1'});
});

test('a mock cannot bind its first group before both topics are available', async () => {
  const state = { plans: [{ kind: 'speaking-mock', status: 'pending', target: { type: 'question', skill: 'speaking', questionId: null } }] };
  await expect(bindStudyPlanTargets(state, { bank: async () => [{ id: 'short', part: '1', title: 'Home' }] } as any)).rejects.toThrow('Both speaking mock topics');
});

test('first speaking topic binding freezes every prompt and all mock stages', async () => {
  const state: any = { plans: [{ id: 'ordinary', kind: 'speaking-p1', status: 'pending', target: { type: 'question', skill: 'speaking', questionId: null, part: '1' } }, { id: 'mock', kind: 'speaking-mock', status: 'pending', target: { type: 'question', skill: 'speaking', questionId: null } }] };
  const sources = { bank: async () => [{ id: 'short', title: 'Home', part: '1', questions: ['Where?', 'Why?'] }, { id: 'long', title: 'Friend', part: '2', cueCard: 'Describe a friend', part3: ['How?', 'When?'] }] };
  await bindStudyPlanTargets(state, sources as any);
  expect(state.plans[0].target.prompts).toHaveLength(2);
  expect(studyTargetSummary(state.plans[0])).toContain('2 responses');
  expect(state.plans[1].speakingGroups.p3.prompts).toHaveLength(2);
  const frozen = structuredClone(state.plans);
  await bindStudyPlanTargets(state, { bank: async () => [] } as any);
  expect(state.plans).toEqual(frozen);
});

test('replacing a bound speaking mock removes all frozen scope and progress before binding ordinary Part 2', async () => {
  const state: any = emptyState();
  state.settings.speakingFocus = 'part2';
  state.speakingTopics = [{ id: 'short', title: 'Home', part: '1', questions: ['Where?', 'Why?'] }, { id: 'long', title: 'Friend', part: '2', cueCard: 'Describe a friend', part3: ['How?', 'When?'] }];
  const plan: any = { id: 'replace-mock', dateKey:'2026-10-14', kind: 'speaking-mock', status: 'pending', estimatedMinutes: 15, target: { type: 'question', skill: 'speaking', questionId: null } };
  state.plans = [plan];
  const sources = { bank: async () => state.speakingTopics };
  await bindStudyPlanTargets(state, sources as any);
  expect(plan.speakingGroups.p1.prompts).toHaveLength(2);
  plan.completedPromptKeys = ['old-key']; plan.targetPrompt = plan.target.prompts[0]; plan.stage = 'p1'; plan.linkedSessionId = 'old-attempt';
  mutateStudyPlan(state, plan.id, { type: 'replace', skill: 'speaking' });
  expect(plan.speakingGroups).toBeUndefined(); expect(plan.completedPromptKeys).toBeUndefined(); expect(plan.targetPrompt).toBeUndefined(); expect(plan.stage).toBeUndefined(); expect(plan.linkedSessionId).toBeNull();
  await bindStudyPlanTargets(state, sources as any);
  expect(plan.kind).toBe('speaking-p2');
  expect(plan.target).toMatchObject({ questionId: 'long', part: '2', prompts: [{ part: '2', promptText: 'Describe a friend' }] });
});

test('review summary names actual prompts with singular and plural counts',()=>{
 expect(studyTargetSummary({target:{type:'vocabulary',mode:'due-review',binding:'dynamic',cards:[],batchSize:1}})).toBe('Review · 1 prompt');
 expect(studyTargetSummary({target:{type:'vocabulary',mode:'due-review',binding:'dynamic',cards:[],batchSize:2}})).toBe('Review · 2 prompts');
});

test('learning titles use the bound count while prospective batches show a maximum',()=>{
 const target={type:'vocabulary',mode:'learning-batch',batchSize:10,batchIndex:1,cards:[]} as const;
 const plan={title:'Vocabulary - Learn 10 words',target};
 expect(studyPlanTitle({...plan,target:{...target,cards:Array.from({length:7},(_,i)=>({entryId:`word-${i}`,senseId:'meaning'}))}} as any)).toBe('Vocabulary - Learn 7 words');
 expect(studyPlanTitle({...plan,target:{...target,entryIds:['one']}} as any)).toBe('Vocabulary - Learn 1 word');
 expect(studyPlanTitle({...plan,quantity:4} as any)).toBe('Vocabulary - Learn 4 words');
 expect(studyPlanTitle(plan as any)).toBe('Vocabulary - Learn up to 10 words');
 expect(studyTargetSummary(plan)).toBe('Batch 2 · Up to 10 words');
 expect(studyPlanTitle({title:'My review',target:{...target,mode:'due-review'}} as any)).toBe('My review');
});

test('binding a short manual learning batch corrects its title without changing the chosen duration',async()=>{
 const state:any=emptyState();
 const entries=Array.from({length:7},(_,i)=>addVocabularyItem(state,{term:`partialword${i}`,meaning:`Meaning ${i}.`}).item!);
 const group={id:'partial-learning-group',bookId:'partial-learning-book',kind:'group',order:1,entryIds:entries.map(entry=>entry.id)};
 VOCABULARY_CATALOG.units.push(group as any);
 try {
  const plan={id:'partial',status:'pending',origin:'manual',title:'Vocabulary - Learn 10 words',estimatedMinutes:30,target:{type:'vocabulary',mode:'learning-batch',bookId:group.bookId,unitId:group.id,batchIndex:0,batchSize:10,assessmentMode:'definition',cards:[]}};
  state.plans=[plan as any];
  await bindStudyPlanTargets(state,{vocabulary:async()=>{}} as any);
  expect(plan).toMatchObject({title:'Vocabulary - Learn 7 words',estimatedMinutes:30,quantity:7});
  expect(plan.target.cards).toHaveLength(7);
 } finally { VOCABULARY_CATALOG.units.splice(VOCABULARY_CATALOG.units.indexOf(group as any),1); }
});
