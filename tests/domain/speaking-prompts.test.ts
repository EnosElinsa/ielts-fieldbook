import { expect, test } from 'vitest';
import { createAttempt, emptyState, normalizeDraft } from '../../src/domain/state';
import { speakingPrompts, speakingResponseDraft } from '../../src/domain/speaking';
import { bindSpeakingPlan, completePlanIfMatched } from '../../src/domain/plans';

const topic = { id: 'home', part: '1', title: 'Home', questions: ['Where do you live?', 'What do you like?'] };

test('prompt identity survives reordering and isolates responses from legacy topic text', () => {
  const prompts = speakingPrompts(topic, '1');
  expect(speakingPrompts({ ...topic, questions: [...topic.questions].reverse() }, '1')[1].promptKey).toBe(prompts[0].promptKey);
  const raw = { transcript: 'legacy response', notes: 'old notes', responses: { [prompts[0].promptKey]: { ...prompts[0], transcript: 'first response', notes: 'first notes', parentSessionId: 'parent', targetErrorIds: ['error'] } } };
  const recovered = normalizeDraft(raw);
  expect(recovered.transcript).toBe('legacy response');
  expect(speakingResponseDraft(recovered, prompts[0].promptKey)).toMatchObject({ transcript: 'first response', parentSessionId: 'parent', targetErrorIds: ['error'], ...prompts[0] });
  expect(speakingResponseDraft(recovered, prompts[1].promptKey).transcript).toBe('');
});

test('attempts retain exact prompt metadata with topic questionId', () => {
  const prompt = speakingPrompts(topic, '1')[1];
  const attempt = createAttempt(emptyState(), { skill: 'speaking', questionId: topic.id, essay: 'answer', ...prompt });
  expect(attempt).toMatchObject({ questionId: 'home', ...prompt });
});

test('bound speaking groups only complete after every unique prompt and keep their frozen set', () => {
  const state = emptyState(); state.speakingTopics = [topic];
  const plan = { id: 'plan', kind: 'speaking-p1', status: 'in_progress', startedAt: '2026-10-14T00:00:00Z', target: { type: 'question', questionId: 'home', mode: 'timed', part: '1' } };
  state.plans = [plan]; state.activePlanId = plan.id;
  bindSpeakingPlan(plan, topic, '1');
  const bound = structuredClone(plan.target.prompts);
  bindSpeakingPlan(plan, { ...topic, questions: ['changed question'] }, '1');
  expect(plan.target.prompts).toEqual(bound);
  const attempt = (index: number) => ({ id: `a${index}`, skill: 'speaking', questionId: 'home', part: '1', promptKey: bound[index].promptKey, planId: plan.id, practiceMode: 'timed', date: '2026-10-14T01:00:00Z' });
  completePlanIfMatched(state, plan.id, attempt(0));
  completePlanIfMatched(state, plan.id, attempt(0));
  expect(plan.status).toBe('in_progress');
  expect(plan.completedPromptKeys).toEqual([bound[0].promptKey]);
  completePlanIfMatched(state, plan.id, attempt(1));
  expect(plan.status).toBe('completed');
});

test('mock stages wait for whole groups and bind all three stages before bank changes', () => {
  const long = { id: 'long', part: '2', title: 'Long turn', cueCard: 'Describe a friend', part3: ['Why are friends useful?', 'Can friendships change?'] };
  const state = emptyState(); state.speakingTopics = [topic, long];
  const plan = { id: 'mock', kind: 'speaking-mock', stage: 'p1', status: 'in_progress', target: { type: 'question', questionId: 'home', part: '1', mode: 'timed' }, startedAt: '2026-10-14T00:00:00Z' };
  state.plans = [plan]; bindSpeakingPlan(plan, topic, '1', undefined, state.speakingTopics);
  const first = plan.target.prompts;
  const save = (prompt, questionId, part) => completePlanIfMatched(state, plan.id, { id: prompt.promptKey, skill: 'speaking', questionId, part, promptKey: prompt.promptKey, planId: plan.id, practiceMode: 'timed', date: '2026-10-14T01:00:00Z' });
  save(first[0], 'home', '1'); expect(plan.stage).toBe('p1');
  state.speakingTopics = [];
  save(first[1], 'home', '1'); expect(plan.stage).toBe('p2');
  save(plan.target.prompts[0], 'long', '2'); expect(plan.stage).toBe('p3');
  save(plan.target.prompts[0], 'long', '3'); expect(plan.status).toBe('in_progress');
  save(plan.target.prompts[1], 'long', '3'); expect(plan.status).toBe('completed');
});
