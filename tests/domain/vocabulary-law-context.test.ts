import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { resolveVocabularyLearningContext } from '../../src/domain/vocabulary/context';
import { learningTask } from '../../src/domain/vocabulary/content';
import { buildUnitPracticeQueue } from '../../src/domain/vocabulary/selection';
import { createVocabularySession, evaluateVocabularySessionAnswer } from '../../src/domain/vocabulary/session';
import { vocabularyTeaching } from '../../src/domain/vocabulary/runtimeData';
import type { VocabularyEntry } from '../../src/domain/vocabulary/types';

const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const previous = structuredClone(VOCABULARY_CATALOG);
const scope = { bookId: 'ielts-vocabulary', unitId: 'ielts-vocabulary-chapter-17-group-01' };
const entry = (term: string): VocabularyEntry => structuredClone(released.entries.find((row: VocabularyEntry) => row.term === term));
beforeEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(released)));
afterEach(() => Object.assign(VOCABULARY_CATALOG, structuredClone(previous)));

test('controversy teaches modern public disagreement with useful contextual contrasts', () => {
  const resolved = resolveVocabularyLearningContext(entry('controversy'), scope);
  expect(resolved.sense?.definition).toMatch(/public disagreement/);
  expect(resolved.sense?.example).not.toMatch(/ſ|\bdoth\b|\[A\]nd/);
  expect(resolved.sense?.distinctions?.join(' ')).toMatch(/debate.*dispute/i);
  const task = learningTask(resolved.entry, resolved.sense!, 'distinction');
  expect(task?.options?.length).toBeGreaterThan(1);
  expect(task?.explanation).toMatch(/controversy/i);
});

test('all 37 revised law-group cards teach a contextual contrast and enter the actual group queue', () => {
  const rows = vocabularyTeaching.curriculum.topics.filter(row => row.unitId === scope.unitId && row.sense.editorial?.source === 'Fieldbook law-group teaching review');
  expect(rows).toHaveLength(37);
  const queue = buildUnitPracticeQueue({}, scope.bookId, scope.unitId, 'distinction');
  for (const row of rows) {
    const raw = entry(row.term), before = structuredClone(raw);
    const resolved = resolveVocabularyLearningContext(raw, scope);
    expect(resolved.sense?.id, row.term).toBe(row.sense.id);
    expect(resolved.contentReviewed, row.term).toBe(true);
    expect(resolved.curriculumCurrent, row.term).toBe(true);
    expect(resolved.sense?.example, row.term).not.toMatch(/ſ|\b(?:doth|hath|thou)\b|\[…\]/);
    expect(resolved.sense?.collocations?.length, row.term).toBeGreaterThan(1);
    expect(resolved.sense?.distinctions?.length, row.term).toBeGreaterThan(0);
    const task = learningTask(resolved.entry, resolved.sense!, 'distinction')!;
    expect(task, row.term).toBeDefined();
    expect(task.options, row.term).toContain(task.acceptedAnswers[0]);
    expect(new Set(task.options).size, row.term).toBe(task.options?.length);
    expect(queue.cards.find(card => card.entryId === raw.id)?.task, row.term).toEqual(task);
    expect(raw).toEqual(before);
  }
});

test.each([
  ['regulation', 'kaikki:ac60c6ffaab517860a', /official rule/],
  ['norm', 'kaikki:59351ba1d955d6e40e', /community/],
  ['admission', 'kaikki:3e36e144cab0bea0c5', /Permission to enter/],
  ['official', 'kaikki:3e3792961080473149', /appropriate authority/],
  ['mediate', 'kaikki:8abfe999aea3f7e9a9', /help opposing sides/i],
  ['murmur', 'kaikki:05ca12343db8fed4f4', /speech/],
  ['silent', 'kaikki:04ba261bc01489628c', /Not speaking/],
] as const)('%s selects a distinct source meaning while an explicit older meaning stays accessible', (term, senseId, definition) => {
  const raw = entry(term), original = structuredClone(raw.senses[0]);
  const current = resolveVocabularyLearningContext(raw, scope);
  expect(current.sense).toMatchObject({ id: senseId, definition: expect.stringMatching(definition) });
  expect(current.sense?.id).not.toBe(original.id);
  expect(current.entry.senses.some(sense => sense.id === original.id)).toBe(true);
  expect(resolveVocabularyLearningContext(raw, { ...scope, senseId: original.id }).sense?.id).toBe(original.id);
  expect(raw.senses[0]).toEqual(original);
});

test('prior published teaching upgrades while a personal example or deliberately cleared notes are preserved', () => {
  const baseline = JSON.parse(readFileSync('src/domain/vocabulary/resourceLawGroupTeachingBaseline.json', 'utf8'));
  const old = baseline.restoreTopicRows.find((row: { term: string }) => row.term === 'controversy');
  const saved = { ...entry('controversy'), senses: [structuredClone(old.sense)] };
  expect(resolveVocabularyLearningContext(saved, scope).sense?.definition).toMatch(/public disagreement/);
  const edited = structuredClone(saved);
  edited.senses[0].example = 'My tutor’s saved controversy example.';
  expect(resolveVocabularyLearningContext(edited, scope).sense?.example).toBe(edited.senses[0].example);
  const cleared = structuredClone(saved);
  cleared.senses[0].collocations = [];
  expect(resolveVocabularyLearningContext(cleared, scope).sense?.collocations).toEqual([]);
});

test('an already frozen distinction keeps its question, answer and explanation after new group teaching', () => {
  const raw = entry('controversy');
  const oldTask = { prompt: 'Old saved prompt.', acceptedAnswers: ['old accepted answer'], options: ['old accepted answer', 'other answer'], explanation: 'Old saved explanation.' };
  const card = { id: `${raw.id}:${raw.senses[0].id}:distinction`, entryId: raw.id, senseId: raw.senses[0].id,
    mode: 'distinction' as const, entry: raw, sources: [], dimension: 'meaning' as const, dueAt: '2026-01-01T00:00:00.000Z', task: oldTask };
  const session = createVocabularySession([card], 'distinction', {}, {});
  resolveVocabularyLearningContext(raw, scope);
  expect(session.cardSnapshots?.[0].task).toEqual(oldTask);
  expect(evaluateVocabularySessionAnswer(session.cardSnapshots![0], 'old accepted answer').result).toBe('success');
});
