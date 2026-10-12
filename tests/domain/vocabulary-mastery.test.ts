import { describe, expect, test } from 'vitest';
import * as vocabulary from '../../src/domain/vocabulary';
import type { VocabularyDimension, VocabularyEvidence, VocabularyStore } from '../../src/domain/vocabulary';

function fixture() {
  const store = vocabulary.normalizeVocabularyCollections({});
  const entry = vocabulary.addVocabularyItem(store, { term: 'livestock', meaning: 'Animals kept on a farm.' }).item!;
  return { store, entry, senseId: entry.senses[0].id };
}
function evidence(store: VocabularyStore, entryId: string, senseId: string, dimension: VocabularyDimension, day: number, extra: Partial<VocabularyEvidence> = {}) {
  vocabulary.recordVocabularyEvidence(store, { id: `${senseId}:${dimension}:${day}`, entryId, senseId, dimension, mode: dimension === 'usage' ? 'cloze' : dimension === 'meaning' ? 'definition' : 'dictation', result: 'success', sourceType: 'personal', sourceId: 'test', occurredAt: new Date(Date.UTC(2026, 9, 10) + day * 86400000).toISOString(), verification: 'objective', ...extra });
}

describe('evidence-based vocabulary mastery', () => {
  test('new states use automatic labels; manual New is explicit and reset retains evidence and scheduling', () => {
    const { store, entry, senseId } = fixture();
    expect(store.vocabularyStates[0].statusSource).toBe('automatic');
    evidence(store, entry.id, senseId, 'usage', 0); evidence(store, entry.id, senseId, 'usage', 1);
    expect(vocabulary.getVocabularyMastery(store, entry.id, senseId).effective).toBe('active');
    vocabulary.setVocabularyManualStatus(store, entry.id, 'new', senseId);
    expect(vocabulary.getVocabularyMastery(store, entry.id, senseId)).toMatchObject({ automatic: 'active', effective: 'new', manual: true });
    const before = structuredClone(store);
    vocabulary.setVocabularyManualStatus(store, entry.id, 'automatic', senseId);
    expect(vocabulary.getVocabularyMastery(store, entry.id, senseId)).toMatchObject({ effective: 'active', manual: false });
    expect(store.vocabularyEvidence).toEqual(before.vocabularyEvidence);
    expect(store.vocabularyStates[0].wrong).toEqual(before.vocabularyStates[0].wrong);
    expect(store.vocabularyStates[0].cards).toEqual(before.vocabularyStates[0].cards);
    expect(store.vocabularyStates[0].manualStatus).toBe('new');
  });

  test('only successes separated by 24 hours count, deduplicating IDs and sorting timestamps', () => {
    const { store, entry, senseId } = fixture();
    [2, 0, 0.5, 1, 1.5].forEach(day => evidence(store, entry.id, senseId, 'meaning', day));
    store.vocabularyEvidence.push(structuredClone(store.vocabularyEvidence[0]));
    const before = JSON.stringify(store);
    expect(vocabulary.getVocabularyMastery(store, entry.id, senseId).dimensions.meaning.spacedSuccesses).toBe(3);
    expect(JSON.stringify(store)).toBe(before);
    const boundary = fixture();
    [0, 1 - 1 / 86400000].forEach(day => evidence(boundary.store, boundary.entry.id, boundary.senseId, 'meaning', day));
    expect(vocabulary.getVocabularyMastery(boundary.store, boundary.entry.id).dimensions.meaning.spacedSuccesses).toBe(1);
  });

  test('Familiar needs all four dimensions and Mastered also needs assessed spaced production', () => {
    const { store, entry, senseId } = fixture();
    ['meaning', 'listening', 'spelling', 'usage'].forEach(dimension => [0, 1, 2].forEach(day => evidence(store, entry.id, senseId, dimension as VocabularyDimension, day)));
    expect(vocabulary.getVocabularyMastery(store, entry.id).automatic).toBe('familiar');
    ['meaning', 'listening', 'spelling', 'usage'].forEach(dimension => [3, 4].forEach(day => evidence(store, entry.id, senseId, dimension as VocabularyDimension, day)));
    expect(vocabulary.getVocabularyMastery(store, entry.id).automatic).toBe('familiar');
    [4, 4.5, 5].forEach(day => evidence(store, entry.id, senseId, 'usage', day, { id: `production:${day}`, mode: 'production', verification: 'assessed' }));
    expect(vocabulary.getVocabularyMastery(store, entry.id)).toMatchObject({ automatic: 'mastered', productionSuccesses: 2, missing: [] });
    store.vocabularyStates[0].wrong.active = true;
    expect(vocabulary.getVocabularyMastery(store, entry.id).automatic).toBe('unstable');
  });

  test('audio, self-report, pending, unverified and objective-only production cannot establish mastery', () => {
    const { store, entry, senseId } = fixture();
    const verifications = ['self-reported', 'pending', undefined, 'objective'] as const;
    verifications.forEach((verification, day) => evidence(store, entry.id, senseId, 'usage', day, { mode: 'production', verification }));
    evidence(store, entry.id, senseId, 'meaning', 5, { result: 'pending' });
    vocabulary.recordAudioActivity(store, entry.id);
    expect(vocabulary.getVocabularyMastery(store, entry.id)).toMatchObject({ automatic: 'new', productionSuccesses: 0 });
    expect(vocabulary.getVocabularyMastery(store, entry.id).missing.join(' ')).toContain('Meaning');
  });

  test('source-record evidence counts but legacy counters and missing dates do not fabricate spaced retrievals', () => {
    const { store, entry, senseId } = fixture();
    Object.values(store.vocabularyStates[0].dimensions).forEach(dimension => Object.assign(dimension, { successes: 20, firstSuccessAt: '2020-01-01', lastSuccessAt: '2026-01-01' }));
    expect(vocabulary.getVocabularyMastery(store, entry.id).dimensions.meaning.spacedSuccesses).toBe(0);
    [0, 1, 2].forEach(day => evidence(store, entry.id, senseId, 'meaning', day, { verification: 'source-record', imported: true }));
    store.vocabularyEvidence.push({ ...store.vocabularyEvidence[0], id: 'bad-date', occurredAt: '' });
    expect(vocabulary.getVocabularyMastery(store, entry.id).dimensions.meaning.spacedSuccesses).toBe(3);
    expect(vocabulary.getVocabularyMastery({}, entry.id).automatic).toBe('new');
  });

  test('legacy labels normalize independently, and backup data retains explicit automatic/manual choices', () => {
    const { store, entry } = fixture();
    delete store.vocabularyStates[0].statusSource;
    expect(vocabulary.normalizeVocabularyCollections(store).vocabularyStates[0].statusSource).toBe('automatic');
    store.vocabularyStates[0].manualStatus = 'familiar';
    expect(vocabulary.getVocabularyMastery(store, entry.id)).toMatchObject({ manual: true, effective: 'familiar', automatic: 'new' });
    expect(vocabulary.normalizeVocabularyCollections(store).vocabularyStates[0].statusSource).toBe('manual');
    store.vocabularyStates[0].statusSource = 'automatic';
    const normalized = vocabulary.normalizeVocabularyCollections(store);
    expect(vocabulary.getVocabularyMastery(normalized, entry.id)).toMatchObject({ manual: false, effective: 'new' });
    expect(normalized.vocabularyStates[0].id).toBe(store.vocabularyStates[0].id);
  });

  test('sense and account evidence stays isolated; entry summary conservatively includes learned senses', () => {
    const { store, entry, senseId } = fixture();
    ['meaning', 'listening', 'spelling', 'usage'].forEach(dimension => [0, 1, 2].forEach(day => evidence(store, entry.id, senseId, dimension as VocabularyDimension, day)));
    vocabulary.addVocabularyItem(store, { term: entry.term, meaning: 'A different meaning.' });
    const second = entry.senses[1].id;
    expect(vocabulary.getVocabularyMastery(store, entry.id).automatic).toBe('familiar');
    expect(vocabulary.getVocabularyMastery(store, entry.id, second).automatic).toBe('new');
    evidence(store, entry.id, second, 'meaning', 0);
    expect(vocabulary.getVocabularyMastery(store, entry.id).automatic).toBe('unstable');
    store.vocabularyStates[0].wrong.active = true;
    expect(vocabulary.getVocabularyMastery(store, entry.id).automatic).toBe('unstable');
    const other = vocabulary.normalizeVocabularyCollections({ vocabulary: [entry] });
    expect(vocabulary.getVocabularyMastery(other, entry.id).automatic).toBe('new');
  });

  test('dated legacy review without evidence cannot recreate unseen dimension successes', () => {
    const { store, entry, senseId } = fixture();
    store.vocabularyReviews.push({ id: 'legacy', entryId: entry.id, senseId, mode: 'dictation', result: 'success', occurredAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z', verification: 'source-record' });
    expect(vocabulary.getVocabularyMastery(store, entry.id).dimensions.listening.spacedSuccesses).toBe(0);
    vocabulary.recordVocabularyReview(store, { id: 'real-review', entryId: entry.id, senseId, mode: 'dictation', result: 'success', occurredAt: '2026-10-10T00:00:00Z' });
    vocabulary.recordVocabularyReview(store, { id: 'real-review', entryId: entry.id, senseId, mode: 'dictation', result: 'success', occurredAt: '2026-10-11T00:00:00Z' });
    expect(vocabulary.getVocabularyMastery(store, entry.id).dimensions.listening.spacedSuccesses).toBe(1);
  });

  test('entry automatic label remains consistent when wrong recovery coexists with a pending meaning', () => {
    const { store, entry, senseId } = fixture();
    vocabulary.addVocabularyItem(store, { term: entry.term, meaning: 'A second meaning.' });
    vocabulary.recordVocabularyReview(store, { entryId: entry.id, senseId, mode: 'dictation', result: 'failure', occurredAt: '2026-10-10T00:00:00Z' });
    evidence(store, entry.id, entry.senses[1].id, 'usage', 0, { result: 'pending', verification: 'pending', mode: 'production' });
    expect(vocabulary.getVocabularyMastery(store, entry.id)).toMatchObject({ automatic: 'unstable', effective: 'unstable', manual: false });
  });
});
