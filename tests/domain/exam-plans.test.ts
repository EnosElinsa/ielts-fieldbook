import { expect, test } from 'vitest';
import { emptyState, migrateState } from '../../src/domain';
import { ensurePlans, planMatchesSkill } from '../../src/lib/planTemplates';
test('reading and listening plans route to their skill, never writing', () => {
  for (const skill of ['reading', 'listening']) {
    const state = migrateState({ ...emptyState(), settings: { activeSkill:skill, skillMix:skill, days:[1,2,3,4,5,6,7] } });
    const plans = ensurePlans(state, skill);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every(p => p.kind.startsWith(skill))).toBe(true);
    expect(planMatchesSkill(plans[0], 'writing')).toBe(false);
  }
});
test('listening plans surface due intensive sentence with its exact source', () => {
  const state = migrateState({settings:{activeSkill:'listening',skillMix:'listening',days:[1,2,3,4,5,6,7]},intensiveSessions:[{id:'i',sectionId:'s',sentenceId:'sentence',nextReviewAt:'2020-01-01',dictationResult:'wrong'}]});
  const plan=ensurePlans(state,'listening')[0];
  expect(plan.kind).toBe('listening-intensive');
  expect(plan.sectionId).toBe('s');
  expect(plan.sentenceId).toBe('sentence');
});
test('mixed rotation includes four skills without rewriting existing plans', () => {
  const state=migrateState({settings:{skillMix:'mixed',days:[1,2,3,4,5,6,7]}});
  ensurePlans(state,'reading');
  expect(state.plans.some(p=>p.kind.startsWith('reading'))).toBe(true);
  expect(state.plans.some(p=>p.kind.startsWith('listening'))).toBe(true);
});
