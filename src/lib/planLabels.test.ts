import { expect, test } from 'vitest';
import { planMinutesLabel, planSkill } from './planTemplates';

test('legacy tasks without a skill take it from their kind', () => {
  expect(planSkill({ kind: '1' })).toBe('writing');
  expect(planSkill({ kind: '2' })).toBe('writing');
  expect(planSkill({ kind: 'speaking-p2' })).toBe('speaking');
  expect(planSkill({ kind: 'stories' })).toBe('speaking');
  expect(planSkill({ kind: 'reading-practice' })).toBe('reading');
  expect(planSkill({ kind: 'listening-intensive' })).toBe('listening');
  expect(planSkill({ kind: 'vocabulary' })).toBe('vocabulary');
  expect(planSkill({ kind: 'review' })).toBe('writing');
  expect(planSkill({ kind: '1', skill: 'speaking' })).toBe('speaking');
});

test('task minutes read as minutes or as no estimate', () => {
  expect(planMinutesLabel({ estimatedMinutes: 20 })).toBe('20 min');
  expect(planMinutesLabel({ estimatedMinutes: '15' })).toBe('15 min');
  expect(planMinutesLabel({})).toBe('No time estimate');
  expect(planMinutesLabel({ estimatedMinutes: 0 })).toBe('No time estimate');
  expect(planMinutesLabel(null)).toBe('No time estimate');
});
