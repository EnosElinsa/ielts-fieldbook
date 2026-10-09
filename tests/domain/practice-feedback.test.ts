import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as core from '../../src/domain';

const now = '2026-10-10T02:00:00.000Z';
const feedback = (mode = 'overview') => `review_contract_version: writing3
session_id: drill
question_id: q1
skill: writing
task: Task 1
practice_mode: ${mode}
target_error_ids: old-error
overall: unscored (focused practice)

## Candidate response

Overall, sales increased.

## Criteria

| Criterion | Feedback | Evidence |
|---|---|---|
| Task Achievement | needs work | The overview misses the falling series. |

## Summary

Include both main trends.

## Priorities

Name the falling series.

## Edits

| Original issue | Revised | Reason | Error tag |
|---|---|---|---|
| sales increased | sales rose while cycling fell | missing trend | TA-OVERVIEW |

## Full rewrite

Overall, sales rose while cycling fell.

## Vocabulary suggestions

| Type | Expression | Meaning / Usage | Example | Tags |
|---|---|---|---|---|
| phrase | in contrast | comparison | In contrast, cycling fell. | Task 1 |

## Next practice

Write another overview.

Official criteria: https://ielts.org/cdn/ielts-guides/ielts-writing-key-assessment-criteria.pdf
`;

test('v9 migration preserves lineage and target errors while old modes stay unknown', () => {
  const state = core.migrateState({
    schemaVersion: 8,
    sessions: [{ id: 'old', mode: 'full', parentSessionId: 'parent', essay: 'Old response.' }],
    drafts: { old: { text: 'Draft.', mode: 'timed', parentSessionId: 'parent' }, modern: { text: 'Modern.', practiceMode: 'body', targetErrorIds: ['e1'] } },
  });
  assert.equal(state.schemaVersion, 9);
  assert.equal(state.sessions[0].practiceMode, 'unknown');
  assert.equal(state.sessions[0].parentSessionId, 'parent');
  assert.equal(state.drafts.old.practiceMode, 'unknown');
  assert.equal(state.drafts.old.parentSessionId, 'parent');
  assert.equal(state.drafts.modern.practiceMode, 'body');
  assert.deepEqual(state.drafts.modern.targetErrorIds, ['e1']);
  const attempt = core.createAttempt(state, { questionId: 'q1', essay: 'New.', practiceMode: 'compare', targetErrorIds: ['e1'], parentSessionId: 'old' });
  assert.equal(attempt.practiceMode, 'compare');
  assert.deepEqual(attempt.targetErrorIds, ['e1']);
  assert.equal(attempt.parentSessionId, 'old');
  assert.equal(core.createAttempt(state, { questionId: 'q2', essay: 'Compatible.' }).practiceMode, 'full');
});

test('short writing drills request focused non-band feedback without whole-essay limits', () => {
  for (const mode of ['overview', 'outline', 'compare', 'body']) {
    const request = core.buildAssessmentRequest({ id: 'drill', essay: 'Short response.', words: 2, practiceMode: mode, targetErrorIds: ['e1'] }, { id: 'q1', type: '1', prompt: 'Describe the chart.' });
    assert.match(request, /review_contract_version: writing3/);
    assert.match(request, new RegExp(`practice_mode: ${mode}`));
    assert.match(request, /target_error_ids: e1/);
    assert.match(request, /Do not assign an overall IELTS band/);
    assert.doesNotMatch(request, /at least 150|at least 250|Produce a complete rewritten answer/);
    for (const heading of ['Criteria', 'Summary', 'Priorities', 'Edits', 'Full rewrite', 'Vocabulary suggestions', 'Next practice']) assert.ok(request.includes(`## ${heading}`));
  }
});

test('English focused feedback parses corrections without full rewrite minimum', () => {
  const parsed = core.parseAssessmentFile(feedback(), 'overview.md');
  assert.equal(parsed.practiceMode, 'overview');
  assert.deepEqual(parsed.targetErrorIds, ['old-error']);
  assert.equal(parsed.summary, 'Include both main trends.');
  assert.equal(parsed.criteria[0].score, 'needs work');
  assert.equal(parsed.editRows[0].tag, 'TA-OVERVIEW');
  assert.equal(parsed.rewriteTooShort, false);
  assert.equal(parsed.rewrittenResponse, 'Overall, sales rose while cycling fell.');
  assert.equal(parsed.lexiconSuggestions[0].term, 'in contrast');
});

test('score trends include full and timed responses only while unknown history survives', () => {
  const state = core.migrateState({
    sessions: ['unknown', 'overview', 'full', 'timed'].map((practiceMode, index) => ({ id: `s${index}`, practiceMode, skill: 'writing' })),
    assessments: ['unknown', 'overview', 'full', 'timed'].map((practiceMode, index) => ({ id: `a${index}`, sessionId: `s${index}`, overall: '6', date: `2026-10-0${index + 1}`, rawText: `raw-${index}`, criteria: [{ name: 'Task Achievement', score: '6' }] })),
  });
  assert.deepEqual(core.numericOveralls(state, 'writing').map(item => item.id), ['a2', 'a3']);
  assert.deepEqual(core.criterionSeries(state, 'writing').map(item => item.id), ['a2', 'a3']);
  assert.equal(core.criterionBands(state, 'writing').count, 2);
  assert.equal(state.assessments.length, 4);
  state.assessments[0].practiceMode = 'full';
  assert.equal(core.assessmentIsComparable(state, state.assessments[0]), false);
});

test('a new drill review updates the nearest future ordinary plan without touching today or mocks', () => {
  const state = core.migrateState({
    sessions: [{ id: 'drill', questionId: 'q1', practiceMode: 'overview', essay: 'Overall, sales increased.' }],
    plans: [
      { id: 'today', dateKey: '2026-10-10', kind: '1', status: 'in_progress', title: 'Keep today' },
      { id: 'mock', dateKey: '2026-10-10', kind: 'writing-mock', status: 'pending', title: 'Keep mock' },
      { id: 'speaking', dateKey: '2026-10-10', kind: 'speaking-p1', status: 'pending', title: 'Keep speaking' },
      { id: 'future', dateKey: '2026-10-11', kind: '2', status: 'pending', title: 'Change future' },
      { id: 'later', dateKey: '2026-10-12', kind: '1', status: 'pending', title: 'Keep later' },
    ],
  });
  const first = core.importAssessmentText(state, feedback(), 'overview.md', { id: () => 'a1', now: () => now });
  assert.equal(first.recommendation.deskMode, 'overview');
  assert.equal(first.updatedPlan.id, 'future');
  assert.equal(state.plans.find(plan => plan.id === 'future').deskMode, 'overview');
  assert.equal(state.plans.find(plan => plan.id === 'today').title, 'Keep today');
  assert.equal(state.plans.find(plan => plan.id === 'mock').title, 'Keep mock');
  assert.equal(state.plans.find(plan => plan.id === 'later').title, 'Keep later');
  const snapshot = JSON.stringify(state);
  const duplicate = core.importAssessmentText(state, feedback(), 'overview.md', { id: () => 'a2', now: () => now });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.recommendation, undefined);
  assert.equal(JSON.stringify(state), snapshot);
});

test('invalid import leaves the complete state untouched and persistence retains raw feedback', () => {
  const state = core.migrateState({ sessions: [{ id: 'drill', questionId: 'q1', practiceMode: 'overview' }] });
  const before = JSON.stringify(state);
  assert.equal(core.importAssessmentText(state, '## Candidate response\n\nOnly a request.', 'request.md').invalid, true);
  assert.equal(JSON.stringify(state), before);
  const result = core.importAssessmentText(state, feedback(), 'overview.md', { id: () => 'a1', now: () => now });
  assert.equal(core.persistShape(state).assessments[0].rawText, feedback());
  assert.equal(result.assessment.sessionId, 'drill');
  assert.equal(state.sessions[0].assessmentId, 'a1');
  const request = core.buildAssessmentRequest({ id: 'request', essay: 'Short.', practiceMode: 'overview', words: 1 }, { id: 'q1', type: '1', prompt: 'Chart.' });
  const importedState = JSON.stringify(state);
  assert.equal(core.importAssessmentText(state, request, 'request.md').invalid, true);
  assert.equal(JSON.stringify(state), importedState);
});

test('blank metadata never consumes the next line and unknown legacy feedback can guide a plan', () => {
  const text = feedback('full').replace('target_error_ids: old-error', 'target_error_ids:').replace('overall: unscored (focused practice)', 'overall: 6').replace('| Task Achievement | needs work |', '| Task Achievement | 5 |');
  const parsed = core.parseAssessmentFile(text, 'full.md');
  assert.deepEqual(parsed.targetErrorIds, []);
  assert.equal(parsed.overall, '6');
  const state = core.migrateState({
    sessions: [{ id: 'drill', questionId: 'q1', practiceMode: 'unknown' }],
    plans: [{ id: 'pending', dateKey: '2026-10-10', status: 'pending', kind: '2' }],
  });
  const imported = core.importAssessmentText(state, text.replace('practice_mode: full', ''), 'legacy.md', { id: () => 'a1', now: () => now });
  assert.equal(imported.recommendation.driver, 'criterion:TA');
  assert.equal(imported.updatedPlan.id, 'pending');
  assert.deepEqual(core.numericOveralls(state, 'writing'), []);
});

test('short drill feedback remains the next practice when no comparable bands exist', async () => {
  const state = core.migrateState({
    sessions: [{ id: 'drill', questionId: 'q1', practiceMode: 'overview', essay: 'Overall, sales increased.' }],
  });
  core.importAssessmentText(state, feedback(), 'overview.md', { id: () => 'a1', now: () => now });
  assert.equal(core.todaySession(state, now, 'writing').practice.deskMode, 'overview');
  const { ensurePlans } = await import('../../src/lib/planTemplates');
  const plans = ensurePlans(state, 'writing');
  assert.equal(plans[0].deskMode, 'overview');
});
