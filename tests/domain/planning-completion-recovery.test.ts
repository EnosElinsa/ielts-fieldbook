import { expect, test } from 'vitest';
import { emptyState } from '../../src/domain';
import { PLANNING_FIELDS } from '../../src/domain/planningEvidence';
import { ensureUnifiedPlans } from '../../src/lib/planTemplates';

const startedAt = '2026-11-16T10:00:00Z';
const completedAt = '2026-11-16T10:15:00Z';
const today = new Date('2026-11-17T12:00:00');
function fixture(summary = false) {
  const state: any = emptyState();
  Object.assign(state.settings, { dailyMinutes: 60, days: [1,2,3,4,5,6,7], skills: ['listening'], planning: { vocabularyMode: 'fixed', vocabularyMinutes: 0 } });
  state.plans = [{ id: 'yesterday', kind: 'listening-intensive', skill: 'listening', origin: 'automatic', schemaVersion: 2,
    status: 'in_progress', startedAt, dateKey: '2026-11-16', estimatedMinutes: 10, sectionId: 'section', sentenceId: 'sentence',
    target: { type: 'intensive', skill: 'listening', sectionId: 'section', sentenceId: 'sentence', reviewMode: 'listening-check' } }];
  state.activePlanId = 'yesterday';
  state.intensiveSessions = [{ id: 'intensive', sectionId: 'section', sentenceId: 'sentence', stage: 6,
    completedAt: '2026-11-01T10:00:00Z', nextReviewAt: '2026-11-20', reviewEnabled: true,
    listeningReviews: [{ reviewedAt: completedAt, planId: 'yesterday', selfRating: 4 }] }];
  if (summary) {
    state.planningEvidence = [{ id: 'intensiveSessions', rows: state.intensiveSessions.map(row => Object.fromEntries(
      ['id', ...PLANNING_FIELDS.intensiveSessions].filter(field => row[field] !== undefined).map(field => [field, row[field]]))) }];
    state.intensiveSessions = [];
  }
  return state;
}

test.each([false, true])('saved listening review completes yesterday before carryover (cold summary: %s)', summary => {
  const state = fixture(summary);
  ensureUnifiedPlans(state, undefined, today);
  expect(state.plans.find(plan => plan.id === 'yesterday')).toMatchObject({ status: 'completed', dateKey: '2026-11-16', completedAt, linkedSessionId: 'intensive' });
  expect(state.activePlanId).toBeNull();
});

function projectEvidence(state: any) {
  state.planningEvidence = Object.entries(PLANNING_FIELDS).map(([id, fields]) => ({ id, rows: state[id].map(row => Object.fromEntries(
    ['id', ...fields].filter(field => row[field] !== undefined).map(field => [field, row[field]]))) }));
  for (const id of Object.keys(PLANNING_FIELDS)) state[id] = [];
}

test.each([false, true])('saved reading diagnosis recovers without a previous in-memory attempt (%s)', summary => {
  const state = fixture();
  Object.assign(state.plans[0], { kind: 'reading-review', skill: 'reading', attemptId: 'exam', target: { type: 'exam-review', skill: 'reading', attemptId: 'exam' } });
  state.examAttempts = [{ id: 'exam', planId: 'yesterday', skill: 'reading', status: 'completed', completedAt: '2026-11-15', updatedAt: completedAt,
    results: { q1: false, q2: false }, errorReasons: { q1: 'Paraphrase', q2: 'Wrong detail' }, evidence: { q1: 'Paragraph A', q2: 'Paragraph B' } }];
  if (summary) projectEvidence(state);
  ensureUnifiedPlans(state, undefined, today);
  expect(state.plans.find(plan => plan.id === 'yesterday')).toMatchObject({ status: 'completed', completedAt, dateKey: '2026-11-16', linkedSessionId: 'exam' });
});

test.each([false, true])('saved exact reading answers recover without loading frozen question content (%s)', summary => {
  const state = fixture();
  Object.assign(state.plans[0], { kind: 'reading-practice', skill: 'reading', target: { type: 'section', skill: 'reading', sectionId: 'section', mode: 'practice', questionIds: ['q1', 'q2'] } });
  state.examAttempts = [{ id: 'exam', planId: 'yesterday', skill: 'reading', status: 'completed', mode: 'practice', sectionIds: ['section'], completedAt,
    questionSnapshot: [{ id: 'q1' }, { id: 'q2' }], results: { q1: false, q2: true }, responses: { q1: 'wrong', q2: 'answer' } }];
  if (summary) projectEvidence(state);
  ensureUnifiedPlans(state, undefined, today);
  expect(state.plans.find(plan => plan.id === 'yesterday')).toMatchObject({ status: 'completed', completedAt, dateKey: '2026-11-16' });
  if (summary) expect(state.examAttempts).toEqual([]);
});

test.each([false, true])('saved prompt groups recover only after every bound prompt (%s)', summary => {
  const state = fixture();
  Object.assign(state.plans[0], { kind: 'speaking-p1', skill: 'speaking', target: { type: 'question', skill: 'speaking', questionId: 'topic', part: '1', mode: 'timed', prompts: [{ promptKey: 'one' }, { promptKey: 'two' }] } });
  state.sessions = ['one', 'two'].map((promptKey, i) => ({ id: `response-${i}`, planId: 'yesterday', promptKey, skill: 'speaking', questionId: 'topic', part: '1', practiceMode: 'timed', date: completedAt }));
  if (summary) projectEvidence(state);
  ensureUnifiedPlans(state, undefined, today);
  expect(state.plans.find(plan => plan.id === 'yesterday')).toMatchObject({ status: 'completed', completedAt, completedPromptKeys: ['one', 'two'] });
});

test('a partial saved prompt counter retains the actual last response time during recovery', () => {
  const state = fixture();
  Object.assign(state.plans[0], { kind: 'speaking-p1', skill: 'speaking', completedPromptKeys: ['two'], target: { type: 'question', skill: 'speaking', questionId: 'topic', part: '1', mode: 'timed', prompts: [{ promptKey: 'one' }, { promptKey: 'two' }] } });
  state.sessions = ['one', 'two'].map((promptKey, i) => ({ id: `response-${i}`, planId: 'yesterday', promptKey, skill: 'speaking', questionId: 'topic', part: '1', practiceMode: 'timed', date: i ? completedAt : '2026-11-16T10:10:00Z' }));
  ensureUnifiedPlans(state, undefined, today);
  expect(state.plans.find(plan => plan.id === 'yesterday')).toMatchObject({ status: 'completed', completedAt, linkedSessionId: 'response-1' });
});

test('already-carried completed work returns to its actual completion day and refresh is idempotent', () => {
  const state = fixture();
  Object.assign(state.plans[0], { dateKey: '2026-11-17', originalDateKey: '2026-11-01', rescheduledAt: '2026-11-17T08:00:00Z' });
  ensureUnifiedPlans(state, undefined, today);
  expect(state.plans.find(plan => plan.id === 'yesterday')).toMatchObject({ status: 'completed', dateKey: '2026-11-16', originalDateKey: '2026-11-01' });
  const before = structuredClone(state.plans);
  ensureUnifiedPlans(state, undefined, today);
  expect(state.plans).toEqual(before);
});

test.each(['other-plan', 'other-sentence', 'before-start', 'pending', 'skipped', 'restored'])('does not complete unrelated or deliberately reset listening work: %s', variant => {
  const state = fixture();
  const plan = state.plans[0], row = state.intensiveSessions[0];
  if (variant === 'other-plan') row.listeningReviews[0].planId = 'another';
  if (variant === 'other-sentence') { delete plan.sentenceId; row.sentenceId = 'another'; }
  if (variant === 'before-start') row.listeningReviews[0].reviewedAt = '2026-11-15T10:00:00Z';
  if (variant === 'pending' || variant === 'skipped') plan.status = variant;
  if (variant === 'restored') plan.restoredAt = '2026-11-17T08:00:00Z';
  ensureUnifiedPlans(state, undefined, today);
  expect(state.plans.find(task => task.id === 'yesterday')?.status).not.toBe('completed');
});

test('incomplete reading diagnosis and unanswered questions remain unfinished', () => {
  for (const kind of ['reading-review', 'reading-practice']) {
    const state = fixture();
    Object.assign(state.plans[0], { kind, skill: 'reading', attemptId: 'exam', target: kind.endsWith('review')
      ? { type: 'exam-review', skill: 'reading', attemptId: 'exam' }
      : { type: 'section', skill: 'reading', sectionId: 'section', mode: 'practice', questionIds: ['q1', 'q2'] } });
    state.examAttempts = [{ id: 'exam', planId: 'yesterday', skill: 'reading', status: 'completed', mode: 'practice', sectionIds: ['section'], completedAt, updatedAt: completedAt,
      questionSnapshot: [{ id: 'q1' }, { id: 'q2' }], results: { q1: false, q2: false }, responses: { q1: 'answer', q2: '' }, errorReasons: { q1: 'Reason' }, evidence: { q1: 'Paragraph A' } }];
    projectEvidence(state);
    ensureUnifiedPlans(state, undefined, today);
    expect(state.plans.find(plan => plan.id === 'yesterday').status).toBe('in_progress');
  }
});

test('one saved prompt never completes a two-prompt speaking task', () => {
  const state = fixture();
  Object.assign(state.plans[0], { kind: 'speaking-p1', skill: 'speaking', target: { type: 'question', skill: 'speaking', questionId: 'topic', part: '1', mode: 'timed', prompts: [{ promptKey: 'one' }, { promptKey: 'two' }] } });
  state.sessions = [{ id: 'response', planId: 'yesterday', promptKey: 'one', skill: 'speaking', questionId: 'topic', part: '1', practiceMode: 'timed', date: completedAt }];
  projectEvidence(state);
  ensureUnifiedPlans(state, undefined, today);
  expect(state.plans.find(plan => plan.id === 'yesterday')).toMatchObject({ status: 'in_progress', completedPromptKeys: ['one'] });
});

test('saved vocabulary assessment is reconciled before its frozen batch can carry forward', () => {
  const state = fixture(), cards = [{ entryId: 'word', senseId: 'sense' }];
  Object.assign(state.plans[0], { kind: 'vocabulary', skill: 'vocabulary', target: { type: 'vocabulary', mode: 'due-review', assessmentMode: 'dictation', binding: 'frozen', cards } });
  state.vocabularySessions = [{ id: 'assessment', planId: 'yesterday', status: 'submitted', mode: 'dictation', startedAt, submittedAt: completedAt, results: [{ ...cards[0], response: 'wrong answer', result: 'failure' }] }];
  projectEvidence(state);
  state.vocabularySessions = [];
  ensureUnifiedPlans(state, undefined, today);
  expect(state.plans.find(plan => plan.id === 'yesterday')).toMatchObject({ status: 'completed', completedAt, dateKey: '2026-11-16', linkedSessionId: 'assessment' });
  expect(state.vocabularySessions).toEqual([]);
});

test('recovery never advances a saved mock stage or mutates shared evidence', () => {
  const state = fixture();
  Object.assign(state.plans[0], { kind: 'speaking-mock', skill: 'speaking', stage: 'p2', target: { type: 'question', skill: 'speaking', questionId: 'topic', part: '2', mode: 'timed' } });
  state.sessions = [{ id: 'response', planId: 'yesterday', skill: 'speaking', questionId: 'topic', part: '1', practiceMode: 'timed', date: completedAt }];
  const before = structuredClone(state.sessions);
  Object.freeze(state.sessions[0]); Object.freeze(state.sessions);
  ensureUnifiedPlans(state, undefined, today);
  expect(state.plans.find(plan => plan.id === 'yesterday')).toMatchObject({ status: 'in_progress', stage: 'p2' });
  expect(state.sessions).toEqual(before);
});
