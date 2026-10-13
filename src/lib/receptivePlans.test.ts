import { expect, test } from 'vitest';
import { completeReceptivePlanIfMatched, receptivePlanPath } from './receptivePlans';
import { studyStreak } from '../domain/plans';
const startedAt = '2026-10-11T10:00:00Z';
const completedAt = '2026-10-11T11:00:00Z';
const base = (kind: string) => ({ plans: [{ id: 'plan', kind, status: 'in_progress', startedAt, sectionId: 'part' }], activePlanId: 'plan', examAttempts: [], intensiveSessions: [] } as any);
test('links only a newly completed exam of the matching skill and section', () => {
  const state = base('reading-practice');
  state.examAttempts = [{ id: 'exam', skill: 'listening', status: 'completed', startedAt, completedAt, sectionIds: ['part'] }];
  expect(completeReceptivePlanIfMatched(state)).toBeNull();
  state.examAttempts[0].skill = 'reading'; state.examAttempts[0].completedAt = '2026-10-10T10:00:00Z';
  expect(completeReceptivePlanIfMatched(state)).toBeNull();
  state.examAttempts[0].completedAt = completedAt;
  expect(completeReceptivePlanIfMatched(state)?.linkedSessionId).toBe('exam');
  expect(state.activePlanId).toBeNull();
});
test('a due intensive plan requires its selected sentence to finish', () => {
  const state = base('listening-intensive'); state.plans[0].sentenceId = 's1';
  state.intensiveSessions = [{ id: 'intensive', sectionId: 'part', sentenceId: 's2', completedAt, stage: 6 }];
  expect(completeReceptivePlanIfMatched(state)).toBeNull();
  state.intensiveSessions[0].sentenceId = 's1';
  expect(completeReceptivePlanIfMatched(state)?.linkedSessionId).toBe('intensive');
});
test('resuming an older active attempt can complete a newly started practice plan', () => {
  const state = base('reading-practice');
  state.examAttempts = [{ id: 'resumed', skill: 'reading', status: 'completed', startedAt: '2026-10-10T10:00:00Z', completedAt, sectionIds: ['part'] }];
  expect(completeReceptivePlanIfMatched(state)?.linkedSessionId).toBe('resumed');
});
test('review completes only when proof and diagnosis are saved for the target attempt', () => {
  const state = base('reading-review'); state.plans[0].attemptId = 'exam';
  state.examAttempts = [{ id: 'exam', skill: 'reading', status: 'completed', results: { q1: false }, evidence: { q1: '' }, errorReasons: {} }];
  const before = structuredClone(state);
  expect(completeReceptivePlanIfMatched(state, before)).toBeNull();
  state.examAttempts[0].evidence.q1 = 'Passage paragraph B'; state.examAttempts[0].errorReasons.q1 = 'Missed paraphrase';
  expect(completeReceptivePlanIfMatched(state, before)?.linkedSessionId).toBe('exam');
});
test('completed receptive work counts toward the scheduled streak, unfinished work does not', () => {
  const state = { settings: { days: [1,2,3,4,5,6,7] }, sessions: [], examAttempts: [{ status: 'completed', completedAt: '2026-10-11T12:00:00Z' }, { status: 'active', startedAt: '2026-10-10T12:00:00Z' }], intensiveSessions: [{ completedAt: '2026-10-12T12:00:00Z', stage: 6 }] };
  expect(studyStreak(state, '2026-10-12T14:00:00Z')).toBe(2);
});
test('review plans open the canonical queue and targeted practice opens its part', () => {
  expect(receptivePlanPath({ kind: 'reading-review' }, 'reading')).toBe('/reading/review');
  expect(receptivePlanPath({ kind: 'reading-practice', sectionId: 'part 1' }, 'reading')).toBe('/reading/part%201');
  const state = base('listening-intensive'); delete state.plans[0].sectionId;
  state.intensiveSessions = [{ id: 'intensive', sectionId: 'part', sentenceId: 's1', completedAt, stage: 6 }];
  const plan = completeReceptivePlanIfMatched(state)!;
  expect(receptivePlanPath(plan, 'listening')).toBe('/listening/intensive/part?sentence=s1');
});

test('typed receptive plans reject other plan ids, mixed sections, incompatible mode and unrelated review edits',()=>{
  const state=base('reading-practice');state.plans[0].target={type:'section',skill:'reading',sectionId:'part',mode:'practice'};
  const attempt={id:'exam',planId:'plan',skill:'reading',mode:'practice',status:'completed',startedAt,completedAt,sectionIds:['part']};
  for(const patch of [{planId:'other'},{mode:'mock'},{sectionIds:['part','other']}]){state.examAttempts=[{...attempt,...patch}];expect(completeReceptivePlanIfMatched(state)).toBeNull();}
  state.plans[0].kind='reading-review';state.plans[0].attemptId='exam';state.plans[0].target={type:'exam-review',skill:'reading',attemptId:'exam'};
  state.examAttempts=[{...attempt,updatedAt:completedAt,results:{q1:false},evidence:{q1:''},errorReasons:{q1:''}}];const before=structuredClone(state);
  Object.assign(state.examAttempts[0],{evidence:{q1:'Passage proof'},errorReasons:{q1:'Missed detail'},planId:'other'});
  expect(completeReceptivePlanIfMatched(state,before)).toBeNull();state.examAttempts[0].planId='plan';
  expect(completeReceptivePlanIfMatched(state,before)?.status).toBe('completed');
});

test('a bound exam completes its original task without clearing another active task',()=>{
  const state=base('reading-practice');state.plans[0].target={type:'section',skill:'reading',sectionId:'part',mode:'practice'};
  state.plans.push({id:'other',kind:'vocabulary',status:'in_progress',startedAt});state.activePlanId='other';
  state.examAttempts=[{id:'exam',planId:'plan',skill:'reading',mode:'practice',status:'completed',completedAt,sectionIds:['part']}];
  expect(completeReceptivePlanIfMatched(state)?.id).toBe('plan');
  expect(state.activePlanId).toBe('other');
  expect(completeReceptivePlanIfMatched(state)).toBeNull();
});

test('unbound legacy work only completes the active legacy task',()=>{
  const state=base('reading-practice');state.activePlanId='other';
  state.examAttempts=[{id:'exam',skill:'reading',status:'completed',completedAt,sectionIds:['part']}];
  expect(completeReceptivePlanIfMatched(state)).toBeNull();
  expect(receptivePlanPath({kind:'listening-intensive'},'listening')).toBe('/listening');
});
