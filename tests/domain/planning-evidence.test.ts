import { expect, test, vi } from 'vitest';
import * as vocabularyPlanning from '../../src/domain/vocabulary/planning';
import { emptyState, persistShape } from '../../src/domain';
import { PLANNING_FIELDS, planningEvidenceView } from '../../src/domain/planningEvidence';
import { ensureUnifiedPlans } from '../../src/lib/planTemplates';

test('a schedule without vocabulary time does not build unused vocabulary questions',()=>{
 const state:any=emptyState();
 Object.assign(state.settings,{dailyMinutes:60,days:[1,2,3,4,5,6,7],skills:['reading'],planning:{vocabularyMode:'fixed',vocabularyMinutes:0}});
 const candidates=vi.spyOn(vocabularyPlanning,'getVocabularyPlanningCandidates');
 try {
  ensureUnifiedPlans(state,undefined,new Date('2026-10-20T12:00:00'));
  expect(state.plans.length).toBeGreaterThan(0);
  expect(candidates).not.toHaveBeenCalled();
 }finally{candidates.mockRestore();}
});

test('summary-based scheduling matches full evidence without leaking summaries into stored history',()=>{
  const full:any=emptyState();
  Object.assign(full.settings,{dailyMinutes:60,days:[1,2,3,4,5,6,7],skills:['writing','reading','listening','speaking'],planning:{vocabularyPercent:0,newWordsPerDay:0}});
  full.sessions=[{id:'session',skill:'writing',practiceMode:'timed',date:'2026-10-01',questionId:'q1',essay:'Private essay'}];
  full.assessments=[{id:'assessment',sessionId:'session',skill:'writing',practiceMode:'timed',date:'2026-10-01',criteria:[{name:'Grammatical range and accuracy',score:4}],rawText:'Long feedback'}];
  full.errors=[{id:'mistake',code:'GRA',text:'Check agreement',sourceSessionId:'session',sourceAssessmentId:'assessment',resolved:false,nextReviewAt:'2026-10-01'}];
  full.examAttempts=[{id:'reading',skill:'reading',status:'completed',sectionIds:['section'],results:{q:false},startedAt:'2026-10-01',completedAt:'2026-10-01',catalogSnapshot:{large:'resource'}}];
  const partial:any=structuredClone(full);
  partial.planningEvidence=Object.entries(PLANNING_FIELDS).map(([id,fields])=>({id,rows:partial[id].map((row:any)=>Object.fromEntries(['id',...fields].filter(field=>row[field]!==undefined).map(field=>[field,row[field]])))}));
  for(const key of Object.keys(PLANNING_FIELDS))partial[key]=[];
  const now=new Date('2026-10-20T12:00:00');
  ensureUnifiedPlans(full,undefined,now);ensureUnifiedPlans(partial,undefined,now);
  expect(partial.plans).toEqual(full.plans);
  expect(partial.sessions).toEqual([]);expect(partial.assessments).toEqual([]);
  expect(persistShape(partial)).not.toHaveProperty('planningEvidence');
  partial.sessions=[{id:'session',skill:'writing',practiceMode:'timed',date:'2026-10-02',questionId:'new'}];
  expect(planningEvidenceView(partial).sessions[0].questionId).toBe('new');
});

test.each([
  ['correct', undefined, false], ['partial', undefined, true], ['wrong', false, false], ['correct', true, true],
])('cold planning respects sentence review choice for %s / %s', (dictationResult, reviewEnabled, expected) => {
  const state: any = emptyState();
  Object.assign(state.settings, { dailyMinutes: 30, days: [1,2,3,4,5,6,7], skills: ['listening'] });
  const row = { id: 'sentence', sectionId: 'part', sentenceId: 's1', stage: 6, completedAt: '2026-10-01', nextReviewAt: '2026-10-02', dictationResult, reviewEnabled };
  const fields = PLANNING_FIELDS.intensiveSessions;
  state.planningEvidence = [{ id: 'intensiveSessions', rows: [Object.fromEntries(['id', ...fields].map(field => [field, row[field]]))] }];
  const legacyPlan = { id: 'old-reminder', origin: 'automatic', kind: 'listening-intensive', skill: 'listening', dateKey: '2026-10-02', status: 'pending', target: { type: 'intensive', skill: 'listening', sectionId: 'part', sentenceId: 's1', reviewMode: 'listening-check' } };
  state.plans = [legacyPlan];
  ensureUnifiedPlans(state, undefined, new Date('2026-10-20T12:00:00'));
  expect(state.plans.some(plan => plan.status !== 'skipped' && plan.target?.reviewMode === 'listening-check')).toBe(expected);
  expect(legacyPlan.status).toBe(expected ? 'pending' : 'skipped');
});
