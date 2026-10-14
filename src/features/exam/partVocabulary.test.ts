import { expect, test } from 'vitest';
import { buildPartVocabularyCandidates } from './partVocabulary';
import type { ExamCatalog, ExamAttempt } from '../../domain/exam/types';
const provenance = { sourceUrl: '', sourceVersion: '1', fetchedAt: '', contentHash: '', authorization: 'owned' };
const catalog = { schemaVersion: 1, papers: [], assets: [], sections: [{ id: 'one', skill: 'reading', part: 1, sentences: [], provenance }, { id: 'two', skill: 'reading', part: 2, sentences: [], provenance }],
  passages: [{ id: 'p', sectionId: 'one', paragraphs: [{ id: 'A', text: 'A bank borders another bank. The ancient forest is quiet.' }], provenance }, { id: 'other', sectionId: 'two', paragraphs: [{ id: 'B', text: 'Other material.' }], provenance }],
  questions: [{ id: 'q', sectionId: 'one', number: 1, answer: 'bank', explanation: 'The bank is land.', evidence: { paragraphId: 'A', text: 'another bank' }, provenance }] } as unknown as ExamCatalog;
const attempt = { id: 'attempt', sectionIds: ['one', 'two'], status: 'completed', skill: 'reading', mode: 'mock' } as ExamAttempt;
const index = { bank: 'aa.json', ancient: 'bb.json', forest: 'cc.json', other: 'dd.json', 'ancient forest': 'ee.json' };
test('Part candidates rank answer and evidence hits deterministically and retain exact repeated offsets', () => {
  const rows = buildPartVocabularyCandidates(catalog, attempt, 'one', index);
  expect(rows[0].term).toBe('bank');
  expect(rows.find(row => row.term === 'other')).toBeUndefined();
  expect(rows[0].sources.filter(source => source.exam?.paragraphId === 'A').map(source => source.exam?.start)).toEqual([2, 23]);
  expect(rows[0].sources[0]).toMatchObject({ id: 'one', type: 'reading', exam: { sectionId: 'one', attemptId: 'attempt', passageId: 'p', paragraphId: 'A', quote: 'bank', start: 2, end: 6 } });
  expect(rows.find(row => row.term === 'ancient forest')).toBeDefined();
  expect(buildPartVocabularyCandidates(catalog, attempt, 'one', index)).toEqual(rows);
});
test('unsubmitted mock attempts and unrelated sections expose no vocabulary candidates', () => {
  expect(buildPartVocabularyCandidates(catalog, { ...attempt, status: 'active' }, 'one', index)).toEqual([]);
  expect(buildPartVocabularyCandidates(catalog, attempt, 'missing', index)).toEqual([]);
});
test('listening candidates anchor sentence text offsets independently from audio seconds', () => {
  const listening = { ...catalog, passages: [], questions: [], sections: [{ id: 'one', skill: 'listening', part: 1, sentences: [{ id: 's1', text: 'A bank.', start: 100, end: 105 }], provenance }] } as unknown as ExamCatalog;
  const rows = buildPartVocabularyCandidates(listening, { ...attempt, skill: 'listening' }, 'one', index);
  expect(rows[0].sources[0]).toMatchObject({ type: 'listening', exam: { sentenceId: 's1', start: 2, end: 6 } });
});
