import { describe, expect, test } from 'vitest';
import * as vocabulary from '../../src/domain/vocabulary';

function fresh() {
  return { vocabulary: [], vocabularyStates: [], vocabularyEvidence: [], vocabularyReviews: [], vocabularyActivities: [], wordbookProgress: [], wordbookEnrollments: [], vocabularyImportBatches: [] } as any;
}
function add(state: any, definition = 'Large enough to matter.') {
  return vocabulary.addVocabularyItem(state, { term: 'significant', meaning: definition, example: 'There was a significant increase.', skill: 'writing', source: 'essay-1' }).item;
}

describe('unified vocabulary', () => {
  test('merges a term across skills while retaining independent senses and sources', () => {
    const state = fresh();
    const item = add(state);
    const second = vocabulary.addVocabularyItem(state, { term: ' Significant ', meaning: item.meaning, skill: 'speaking', source: 'speech-1' });
    expect(second.item.id).toBe(item.id);
    expect(state.vocabulary).toHaveLength(1);
    expect(item.sources.map((s: any) => s.skill)).toEqual(['writing', 'speaking']);
    add(state, 'Unlikely to be due to chance in a statistical test.');
    expect(item.senses).toHaveLength(2);
    expect(state.vocabularyStates).toHaveLength(2);
  });

  test('dictation updates listening and spelling without changing meaning or manual status', () => {
    const state = fresh(); const item = add(state);
    vocabulary.setVocabularyManualStatus(state, item.id, 'familiar');
    vocabulary.recordVocabularyReview(state, { entryId: item.id, mode: 'dictation', result: 'success', occurredAt: '2026-10-10T00:00:00Z' });
    const learning = state.vocabularyStates[0];
    expect(learning.manualStatus).toBe('familiar');
    expect(learning.dimensions.spelling.successes).toBe(1);
    expect(learning.dimensions.listening.successes).toBe(1);
    expect(learning.dimensions.meaning.successes).toBe(0);
    expect(learning.cards.dictation.reps).toBe(1);
    expect(state.vocabularyReviews).toHaveLength(1);
  });

  test('wrong words recover only after three spaced successes in the failed mode', () => {
    const state = fresh(); const item = add(state);
    const review = (result: string, date: string, mode = 'dictation') => vocabulary.recordVocabularyReview(state, { entryId: item.id, mode, result, occurredAt: date });
    review('failure', '2026-10-10T00:00:00Z');
    review('success', '2026-10-10T00:10:00Z');
    review('success', '2026-10-10T00:20:00Z');
    review('success', '2026-10-10T00:30:00Z', 'definition');
    expect(vocabulary.getActiveWrongWords(state)).toHaveLength(1);
    review('success', '2026-10-11T01:00:00Z');
    expect(vocabulary.getActiveWrongWords(state)).toHaveLength(0);
    review('failure', '2026-10-12T00:00:00Z');
    expect(vocabulary.getActiveWrongWords(state)).toHaveLength(1);
    expect(state.vocabularyEvidence.filter((e: any) => e.result === 'failure')).toHaveLength(4);
  });

  test('audio activity and pending production do not claim mastery or schedule a review', () => {
    const state = fresh(); const item = add(state);
    vocabulary.recordAudioActivity(state, item.id, '2026-10-10T00:00:00Z');
    vocabulary.recordVocabularyReview(state, { entryId: item.id, mode: 'production', result: 'pending', response: 'A significant effect.', occurredAt: '2026-10-10T00:01:00Z' });
    expect(state.vocabularyActivities).toHaveLength(1);
    expect(state.vocabularyStates[0].dimensions.usage.successes).toBe(0);
    expect(state.vocabularyStates[0].cards.production).toBeUndefined();
    expect(vocabulary.deriveVocabularyStatus(state.vocabularyStates[0])).toBe('new');
  });

  test('cross-source queue deduplicates cards and respects source filters', () => {
    const state = fresh(); const item = add(state);
    vocabulary.addVocabularyItem(state, { term: item.term, meaning: item.meaning, sources: [{ type: 'wordbook', id: 'b1:u1', bookId: 'b1', unitId: 'u1' }] });
    const queue = vocabulary.getVocabularyReviewQueue(state, { mode: 'definition', dueOnly: false });
    expect(queue).toHaveLength(1);
    expect(vocabulary.getVocabularyReviewQueue(state, { mode: 'definition', bookId: 'b1', dueOnly: false })).toHaveLength(1);
    expect(vocabulary.getVocabularyReviewQueue(state, { mode: 'definition', bookId: 'b2', dueOnly: false })).toHaveLength(0);
  });

  test('migrates legacy Chinese explanations out of runtime without losing term or old progress', () => {
    const raw = { lexicon: [{ id: 'old', term: 'account for', meaning: '\u5360\u636e', example: 'Sales account for half of revenue.', skill: 'writing', reviewCount: 7, status: 'mastered', nextReviewAt: '2026-10-20T00:00:00Z' }] };
    const data = vocabulary.migrateLegacyVocabulary(raw);
    expect(data.vocabulary[0].term).toBe('account for');
    expect(/[\u3400-\u9fff]/u.test(JSON.stringify(data))).toBe(false);
    expect(data.vocabularyStates[0].reviewCount).toBe(7);
    expect(data.vocabularyStates[0].legacyProgress.reviewCount).toBe(7);
  });

  test('accepts future reading evidence and is idempotent by event id', () => {
    const state = fresh(); const item = add(state);
    const input = { id: 'read-1', entryId: item.id, skill: 'reading', sourceType: 'reading', sourceId: 'passage-1', mode: 'definition', dimension: 'meaning', result: 'success', occurredAt: '2026-10-10T00:00:00Z' };
    vocabulary.recordVocabularyEvidence(state, input);
    vocabulary.recordVocabularyEvidence(state, input);
    expect(state.vocabularyEvidence).toHaveLength(1);
    expect(state.vocabularyStates[0].dimensions.meaning.successes).toBe(1);
  });

  test('missing enrichment prevents definition and cloze tasks but allows dictation', () => {
    const state = fresh(); vocabulary.addVocabularyItem(state, { term: 'unspecified' });
    expect(vocabulary.getVocabularyReviewQueue(state, { mode: 'definition', dueOnly: false })).toHaveLength(0);
    expect(vocabulary.getVocabularyReviewQueue(state, { mode: 'cloze', dueOnly: false })).toHaveLength(0);
    expect(vocabulary.getVocabularyReviewQueue(state, { mode: 'dictation', dueOnly: false })).toHaveLength(1);
  });

  test('renaming an entry retains its persistent identity and review history', () => {
    const state = fresh(); const entry = vocabulary.addVocabularyItem(state, { term: 'temporaryterm' }).item;
    vocabulary.recordVocabularyReview(state, { entryId: entry.id, mode: 'dictation', result: 'success' });
    vocabulary.updateVocabularyItem(state, entry.id, { term: 'significant' });
    const normalized = vocabulary.normalizeVocabularyCollections(state);
    expect(normalized.vocabulary[0].id).toBe(entry.id);
    expect(normalized.vocabularyReviews[0].entryId).toBe(normalized.vocabulary[0].id);
  });

  test('duplicate incoming sense ids never share distinct meaning progress', () => {
    const state = fresh();
    const entry = vocabulary.addVocabularyItem(state, { term: 'bank', senses: [{id:'noun:0',definition:'An institution that manages money.',example:'The bank lends money.',pos:'noun'},{id:'noun:0',definition:'The land beside a river.',example:'The bank was covered with grass.',pos:'noun'}] }).item;
    expect(new Set(entry.senses.map((s: any) => s.id)).size).toBe(2);
    expect(state.vocabularyStates).toHaveLength(2);
  });

  test('skill sources reference their own sense instead of all meanings', () => {
    const state = fresh();
    vocabulary.addVocabularyItem(state, { term: 'bank', meaning: 'Land beside a river.', skill: 'reading' });
    vocabulary.addVocabularyItem(state, { term: 'bank', meaning: 'An institution that manages money.', skill: 'writing' });
    const queue = vocabulary.getVocabularyReviewQueue(state, { skill: 'reading', mode: 'definition', dueOnly: false });
    expect(queue).toHaveLength(1);
    expect(queue[0].entry.senses.find((sense: any) => sense.id === queue[0].senseId).definition).toBe('Land beside a river.');
  });

  test('enrichment replaces the empty sense while retaining its book links and prior study', () => {
    const state = fresh();
    const entry = vocabulary.addVocabularyItem(state, { term: 'unlistedterm', sources: [{type:'wordbook',id:'source',bookId:'b1',unitId:'u1'}] }).item;
    const oldSense = entry.senses[0].id;
    vocabulary.recordVocabularyReview(state, { entryId: entry.id, mode: 'dictation', result:'success' });
    vocabulary.addVocabularyItem(state, { term: 'unlistedterm', senses: [{id:'open:noun:0',definition:'A supplied definition.',example:'An unlistedterm appeared.',pos:'noun',source:'English Wiktionary',license:'CC-BY-SA-4.0',synonyms:['expression']}] });
    expect(entry.senses).toHaveLength(1);
    expect(entry.senses[0].id).toBe(oldSense);
    expect(state.vocabularyStates[0].reviewCount).toBe(1);
    expect(entry.senses[0].source).toBe('English Wiktionary');
    expect(entry.senses[0].license).toBe('CC-BY-SA-4.0');
    expect(vocabulary.getVocabularyReviewQueue(state,{bookId:'b1',mode:'definition',dueOnly:false})).toHaveLength(1);
  });

  test('re-adding a renamed term allocates an unused identity', () => {
    const state = fresh(); const original = add(state);
    vocabulary.updateVocabularyItem(state, original.id, {term:'renamedterm'});
    const next = add(state);
    expect(next.id).not.toBe(original.id);
    expect(new Set(state.vocabulary.map((entry:any)=>entry.id)).size).toBe(2);
  });

  test('rapid correct drills cannot establish stable mastery', () => {
    const state = fresh(); const entry = add(state);
    for (let n=0;n<5;n++) {
      vocabulary.recordVocabularyReview(state,{entryId:entry.id,mode:'dictation',result:'success',occurredAt:`2026-10-10T00:00:0${n}Z`});
      vocabulary.recordVocabularyReview(state,{entryId:entry.id,mode:'cloze',result:'success',occurredAt:`2026-10-10T00:01:0${n}Z`});
    }
    expect(vocabulary.deriveVocabularyStatus(state.vocabularyStates[0])).not.toBe('mastered');
  });
});
