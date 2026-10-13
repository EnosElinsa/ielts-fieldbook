import { describe, expect, test } from 'vitest';
import { createExamAttempt, diffDictation, dueIntensive, examStats, gradeAttempt, gradeQuestion, normalizeAnswer, normalizeExamStore } from '../../src/domain/exam';
import type { ExamQuestion, ExamSection, IntensiveSession } from '../../src/domain/exam/types';
import { migrateState, persistShape } from '../../src/domain/state';
import { mergeBackup, validateBackup } from '../../src/domain/backup';
import { USER_LISTS, USER_TABLES } from '../../src/storage/sync';

const provenance = { sourceUrl: 'original-demo', sourceVersion: '1', fetchedAt: '', contentHash: 'demo', authorization: 'Original demo' };
const section: ExamSection = { id: 's', paperId: 'p', skill: 'reading', part: 1, title: 'Original demo', questionTypes: ['gap'], questionCount: 2, sentences: [], status: 'ready', provenance };
const question = (input: Partial<ExamQuestion> = {}): ExamQuestion => ({ id: 'q', paperId: 'p', sectionId: 's', skill: 'reading', number: 1, type: 'gap', prompt: 'Demo', answer: 'train station', provenance, ...input });
const stamp = '2026-10-11T00:00:00.000Z';

describe('exam scoring', () => {
  test('normalizes case, punctuation and whitespace while preserving meaningful internal characters', () => {
    expect(normalizeAnswer('  “TRAIN   Station!” ')).toBe('train station');
    expect(normalizeAnswer("mother-in-law's")).toBe("mother-in-law's");
  });
  test('accepts declared alternatives and enforces word limits without fuzzy matching', () => {
    expect(gradeQuestion(question({ alternatives: ['railway station'], maxWords: 2 }), 'Railway station.')).toBe(true);
    expect(gradeQuestion(question({ maxWords: 1 }), 'train station')).toBe(false);
    expect(gradeQuestion(question(), 'the train station')).toBe(false);
    expect(gradeQuestion(question({ answer: '' }), '')).toBe(false);
    expect(gradeQuestion(question(), undefined)).toBe(false);
  });
  test('multiple selections compare distinct nonempty choices without order sensitivity', () => {
    const q = question({ type: 'multiple', answer: ['A', 'C'] });
    expect(gradeQuestion(q, ['c', 'a', 'A', ''])).toBe(true);
    expect(gradeQuestion(q, ['A'])).toBe(false);
    expect(gradeQuestion(q, ['A', 'C', 'D'])).toBe(false);
    expect(gradeQuestion(question({ type: 'multiple', answer: [] }), [])).toBe(false);
  });
  test('one word and a number permits a number/date/postcode without consuming the word budget', () => {
    const limit = { instructions: 'Write ONE WORD AND/OR A NUMBER.', maxWords: 1 };
    expect(gradeQuestion(question({ ...limit, answer: '10 days' }), '10 days')).toBe(true);
    expect(gradeQuestion(question({ ...limit, answer: '24th April' }), '24th April')).toBe(true);
    expect(gradeQuestion(question({ ...limit, answer: 'DG7 4PH' }), 'DG7 4PH')).toBe(true);
    expect(gradeQuestion(question({ ...limit, answer: '10 extra days' }), '10 extra days')).toBe(false);
    expect(gradeQuestion(question({ maxWords: 1, answer: '10 days' }), '10 days')).toBe(false);
  });
  test('attempt grade uses selected sections and records weighted totals and completion', () => {
    const questions = [question(), question({ id: 'q2', number: 2, answer: 'bus', points: 2 }), question({ id: 'other', sectionId: 'other' })];
    const attempt = createExamAttempt([section], questions, 'mock', stamp);
    const graded = gradeAttempt({ ...attempt, responses: { q: 'TRAIN STATION', q2: '' } }, questions, stamp);
    expect(graded).toMatchObject({ results: { q: true, q2: false }, score: 1, total: 3, status: 'completed', completedAt: stamp });
    expect(graded.questionTypes).toEqual({ q: 'gap', q2: 'gap' });
    expect(attempt).toMatchObject({ status: 'active', hintsEnabled: false, sectionIds: ['s'], timeLimitSeconds: 1200 });
    expect(attempt).not.toHaveProperty('results');
  });
  test('rejects mixed skills, mixed papers, and empty attempts', () => {
    expect(() => createExamAttempt([], [], 'practice', stamp)).toThrow();
    expect(() => createExamAttempt([section, { ...section, id: 'l', skill: 'listening' }], [], 'practice', stamp)).toThrow();
    expect(() => createExamAttempt([section, { ...section, id: 'x', paperId: 'other' }], [], 'practice', stamp)).toThrow();
  });
  test('pooled multiple-choice questions award partial points but reject over-selection', () => {
    const q = question({ type: 'multiple', answer: ['A', 'C'], points: 2 });
    const attempt = createExamAttempt([section], [q], 'practice', stamp);
    expect(gradeAttempt({ ...attempt, responses: { q: ['A', 'B'] } }, [q], stamp)).toMatchObject({ score: 1, total: 2, results: { q: false }, earnedPoints: { q: 1 } });
    expect(gradeAttempt({ ...attempt, responses: { q: ['A', 'A', 'C'] } }, [q], stamp).score).toBe(2);
    expect(gradeAttempt({ ...attempt, responses: { q: ['A', 'B', 'C'] } }, [q], stamp).score).toBe(0);
  });
  test('completed scoring is idempotent and retains a question snapshot for weighted progress', () => {
    const q = question({ type: 'multiple', answer: ['A', 'C'], points: 2 });
    const attempt = createExamAttempt([section], [q], 'practice', stamp);
    const graded = gradeAttempt({ ...attempt, responses: { q: ['A', 'B'] } }, [q], stamp);
    expect(graded.questionSnapshot).toEqual([q]);
    expect(gradeAttempt(graded, [{ ...q, answer: ['B', 'D'] }], '2026-10-12T00:00:00Z')).toEqual(graded);
    expect(examStats([graded]).byType.multiple).toEqual({ correct: 1, total: 2 });
  });
});

test('word alignment distinguishes omissions, extras, replacements and repeated words', () => {
  expect(diffDictation('We need the red bus now', 'we need blue bus right now')).toEqual([
    { kind: 'equal', expected: 'We', actual: 'we' }, { kind: 'equal', expected: 'need', actual: 'need' },
    { kind: 'replacement', expected: 'the', actual: 'blue' }, { kind: 'omission', expected: 'red' },
    { kind: 'equal', expected: 'bus', actual: 'bus' }, { kind: 'extra', actual: 'right' }, { kind: 'equal', expected: 'now', actual: 'now' },
  ]);
  expect(diffDictation('go go now', 'go now').filter(token => token.kind === 'omission')).toHaveLength(1);
});

test('v10 migration preserves exam work separately and backup merges newer records', () => {
  const attempt = createExamAttempt([section], [question()], 'practice', stamp);
  const state = migrateState({ schemaVersion: 10, sessions: [{ id: 'writing', essay: 'Legacy essay' }], examAttempts: [attempt], intensiveSessions: [], settings: { activeSkill: 'reading', skillMix: 'listening' } });
  expect(state.schemaVersion).toBe(12);
  expect(state.sessions).toHaveLength(1);
  expect(state.examAttempts).toEqual([attempt]);
  expect(state.settings).toMatchObject({ activeSkill: 'reading', skillMix: 'listening' });
  expect(persistShape(state).examAttempts).toEqual([attempt]);
  expect(validateBackup({ examAttempts: [attempt] })).toMatchObject({ valid: true, counts: { examAttempts: 1 } });
  expect(validateBackup({ intensiveSessions: {} })).toMatchObject({ valid: false });
  expect(mergeBackup(state, { examAttempts: [{ ...attempt, responses: { q: 'new' }, updatedAt: '2026-10-12T00:00:00Z' }] }).examAttempts[0].responses).toEqual({ q: 'new' });
  expect(USER_LISTS).toContain('examAttempts');
  expect(USER_TABLES.intensiveSessions).toBe('intensive_sessions');
  expect(normalizeExamStore({ examAttempts: [null, { ...attempt, responses: null }] }).examAttempts[0].responses).toEqual({});
});

test('review and statistics exclude unfinished grades and future review sessions', () => {
  const active = createExamAttempt([section], [question()], 'practice', stamp);
  const complete = gradeAttempt({ ...active, responses: { q: 'train station' } }, [question()], stamp);
  expect(examStats([active, complete])).toMatchObject({ completed: 1, correct: 1, total: 1, accuracy: 1 });
  const base: IntensiveSession = { id: 'i', sectionId: 's', sentenceId: 'line', stage: 4, gist: '', transcriptInput: '', replayCount: 1, listened: true, revealed: false, dictationResult: 'partial', errorReasons: [], completedAt: stamp, updatedAt: stamp, speed: 1, loop: false, nextReviewAt: stamp };
  expect(dueIntensive([base, { ...base, id: 'later', nextReviewAt: '2026-10-12T00:00:00Z' }, { ...base, id: 'unfinished', completedAt: undefined }], stamp).map(row => row.id)).toEqual(['i']);
});
