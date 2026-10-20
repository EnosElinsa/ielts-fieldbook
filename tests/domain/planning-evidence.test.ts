import { expect, test } from 'vitest';
import { emptyState, persistShape } from '../../src/domain';
import { PLANNING_FIELDS, planningEvidenceView } from '../../src/domain/planningEvidence';
import { ensureUnifiedPlans } from '../../src/lib/planTemplates';

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
