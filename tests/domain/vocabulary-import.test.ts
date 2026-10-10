import { describe, expect, it } from 'vitest';
import { parseVocabularyImport, previewVocabularyImport, mergeVocabularyImport } from '../../src/domain/vocabulary/import';

const empty = () => ({ vocabulary: [], vocabularyStates: [], vocabularyEvidence: [], vocabularyReviews: [], vocabularyActivities: [], wordbookProgress: [], wordbookEnrollments: [], vocabularyImportBatches: [] });
const snapshot = (records: unknown[]) => JSON.stringify({ schemaVersion: 1, provider: 'guixue', accountId: '83722298', books: [], records });
const word = { sourceBookId: '10174', unitId: '21795', sourceWordId: 'w1', term: 'significant', wrongCount: 3, lastCorrect: '2', repaired: false, history: [{ id: 'h1', date: '2026-10-09T10:00:00Z', response: 'signficant', correct: false }] };

describe('vocabulary migration', () => {
  it('preserves authenticated identity, failures and repaired source summaries', () => {
    const batch = parseVocabularyImport(snapshot([word, { ...word, sourceWordId: 'w2', term: 'affect', last_correct: '2', is_fix: '1', history: [] }]));
    expect(batch.accountId).toBe('83722298');
    expect(batch.records[0].wrongCount).toBe(3);
    expect(batch.records[0].currentlyWrong).toBe(true);
    expect(batch.records[1].repaired).toBe(true);
    expect(batch.records[1].currentlyWrong).toBe(false);
  });
  it('uses a CSV parser for escaped quotes, commas and multiline cells', () => {
    const batch = parseVocabularyImport('term,meaning,example\r\n"account for","explain, or represent","The model accounts for\n""most"" differences."', 'csv');
    expect(batch.records[0].term).toBe('account for');
    expect(batch.records[0].example).toBe('The model accounts for\n"most" differences.');
  });
  it('does not turn summary counts or undated history into scheduling events', () => {
    const state = empty();
    mergeVocabularyImport(state, parseVocabularyImport(snapshot([{ ...word, history: [{ correct: false, response: 'x' }] }])));
    expect(state.vocabularyEvidence).toHaveLength(0);
    expect(state.vocabularyImportBatches[0].summaries[0].wrongCount).toBe(3);
    expect(state.vocabularyStates[0].wrong.active).toBe(true);
    expect(state.vocabularyStates[0].wrong.lastFailureAt).toBeUndefined();
    expect(state.vocabularyReviews).toHaveLength(1);
    expect(state.vocabularyReviews[0].occurredAt).toBeNull();
    expect(state.vocabularyReviews[0].scheduling).toBe(false);
    expect(previewVocabularyImport(state, parseVocabularyImport(snapshot([word]))).manualReviewRequired).toBe(0);
  });
  it('is idempotent while retaining multiple source memberships and event identities', () => {
    const state = empty();
    const batch = parseVocabularyImport(snapshot([word, { ...word, sourceBookId: '10176', unitId: '21937' }]));
    mergeVocabularyImport(state, batch);
    const after = JSON.stringify(state);
    mergeVocabularyImport(state, batch);
    expect(JSON.stringify(state)).toBe(after);
    expect(state.vocabulary).toHaveLength(1);
    expect(state.vocabularyEvidence).toHaveLength(4);
    expect(state.vocabularyReviews).toHaveLength(2);
    expect(state.vocabulary[0].sources).toHaveLength(2);
  });
  it('validates every row before mutating state', () => {
    const state = empty();
    const before = JSON.stringify(state);
    const batch = parseVocabularyImport(snapshot([word, { ...word, term: '' }]));
    expect(() => mergeVocabularyImport(state, batch)).toThrow(/invalid/i);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('requires a source account and rejects unsupported or malformed inputs', () => {
    expect(() => parseVocabularyImport('{')).toThrow();
    expect(() => parseVocabularyImport(JSON.stringify({ provider: 'guixue', schemaVersion: 1, records: [] }))).toThrow(/account/i);
    expect(() => parseVocabularyImport(JSON.stringify({ provider: 'guixue', schemaVersion: 99, accountId: '1', records: [] }))).toThrow(/version/i);
  });
  it('interprets Guixue local date-time as Asia/Shanghai and never clears local wrongs on repair', () => {
    const state=empty();
    mergeVocabularyImport(state,parseVocabularyImport(snapshot([{...word,history:[{id:'h2',date:'2026-10-09 10:00:00',response:'x',correct:false}]}])));
    expect(state.vocabularyEvidence[0].occurredAt).toBe('2026-10-09T02:00:00.000Z');
    mergeVocabularyImport(state,parseVocabularyImport(snapshot([{...word,repaired:true,history:[]}])));
    expect(state.vocabularyStates[0].wrong.active).toBe(true);
  });
  it('strips source-language meanings before runtime fingerprinting and treats CSV as personal', () => {
    const state=empty();
    mergeVocabularyImport(state,parseVocabularyImport(snapshot([{...word,meaning:'\u91cd\u8981',example:'\u793a\u4f8b'}])));
    expect(JSON.stringify(state)).not.toMatch(/[\u3400-\u9fff]/);
    const personal=empty();
    mergeVocabularyImport(personal,parseVocabularyImport('term,meaning\ninnovative,Introducing new ideas','csv'));
    expect(personal.vocabulary[0].sources[0].type).toBe('personal');
    expect(personal.vocabulary[0].sources[0].bookId).toBeUndefined();
  });
  it('merges licensed dictionary enrichment without inventing learning history', () => {
    const state=empty();
    const batch=parseVocabularyImport(JSON.stringify({schemaVersion:1,provider:'dictionary',entries:[{term:'innovative',senses:[{id:'kaikki:adjective:0',definition:'Introducing new ideas.',example:'The innovative design reduced material waste.',pos:'adjective',source:'Kaikki.org English Wiktionary export',license:'CC-BY-SA-4.0'}]}]}));
    mergeVocabularyImport(state,batch);
    expect(state.vocabulary[0].meaning).toBe('Introducing new ideas.');
    expect(state.vocabulary[0].senses[0].license).toBe('CC-BY-SA-4.0');
    expect(state.vocabularyEvidence).toHaveLength(0);
    expect(state.vocabulary[0].enrichmentPending).toBe(false);
  });
});
