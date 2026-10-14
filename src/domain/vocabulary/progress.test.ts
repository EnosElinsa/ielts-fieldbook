import { describe, expect, it, vi } from 'vitest';
import { getDueVocabularyReviewQueue, getLearnedVocabularyIds, getVocabularyPracticeResults, vocabularyGroupProgress } from './progress';
vi.mock('./catalog', () => ({ VOCABULARY_CATALOG: { entries: [], memberships: [{ bookId: 'book', unitId: 'group', entryId: 'one' }] } }));
const group = { id: 'group', bookId: 'book', studyEntryIds: ['one', 'two'] };
describe('account-scoped vocabulary learning evidence', () => {
  it('recognizes a reliable historical group attempt including zero grade', () => {
    const state: any = { wordbookProgress: [{ bookId: 'book', unitId: 'group', sourceRecord: { id: 'attempt', book_hierarchy_id: 'group', correct_rate: '0' } }] };
    expect(vocabularyGroupProgress(state, group)).toBe('Studied');
    expect(getLearnedVocabularyIds(state).has('one')).toBe(true);
    expect(getLearnedVocabularyIds({}).size).toBe(0);
  });
  it('does not treat enrollment, total counts or ungraded summaries as attempts', () => {
    const state: any = { wordbookEnrollments: [{bookId:'book'}], wordbookProgress: [{bookId:'book',unitId:'group',status:'completed',sourceRecord:{id:'row',correct_rate:''},sourceReports:{allCount:100}}] };
    expect(vocabularyGroupProgress(state, group)).toBe('Not started');
    expect(getLearnedVocabularyIds(state).size).toBe(0);
  });
  it('keeps partial and specialist attempts in progress', () => {
    const state: any = { vocabularySessions: [{status:'submitted',mode:'dictation',selection:{kind:'batch'},results:[{entryId:'one',response:'x'}]}] };
    expect(vocabularyGroupProgress(state, group)).toBe('In progress');
    expect([...getLearnedVocabularyIds(state)]).toEqual(['one']);
    state.vocabularySessions[0].results.push({entryId:'two',response:'y'});
    expect(vocabularyGroupProgress(state, group)).toBe('In progress');
    state.vocabularySessions[0].selection={kind:'unit',bookId:'book',unitId:'group'};
    expect(vocabularyGroupProgress(state, group)).toBe('Studied');
  });
});

it('blank objective submissions do not manufacture learned evidence',()=>{const state:any={vocabularyReviews:[{entryId:'one',response:'',result:'failure'}],vocabularyEvidence:[{entryId:'one',response:'',mode:'dictation',verification:'objective'}],vocabularySessions:[{status:'submitted',mode:'dictation',results:[{entryId:'one',response:''}]}]};expect(getLearnedVocabularyIds(state).size).toBe(0);expect(vocabularyGroupProgress(state,group)).toBe('Not started');});

it('due review excludes unlearned words and respects mode and scheduled dates', () => {
  const state: any = {
    vocabulary: ['one', 'two'].map(id => ({ id, term: id, tags: [], sources: [], senses: [{ id: 'sense', definition: 'Meaning', example: '' }], createdAt: '2026-01-01' })),
    vocabularyReviews: [{ entryId: 'one', response: 'Meaning', result: 'success' }],
  };
  expect(getDueVocabularyReviewQueue(state, { now: '2026-10-13' }).map(card => card.mode).sort()).toEqual(['definition', 'dictation', 'production']);
  expect(getDueVocabularyReviewQueue(state, { mode: 'definition', now: '2026-10-13' })).toHaveLength(1);
  state.vocabularyStates = [{ entryId: 'one', senseId: 'sense', cards: { definition: { due: '2027-01-01' } } }];
  expect(getDueVocabularyReviewQueue(state, { mode: 'definition', now: '2026-10-13' })).toHaveLength(0);
});

it('range results exclude undated imports and do not count a review again for each dimension', () => {
  const state: any = {
    vocabularyReviews: [{ id: 'recent', entryId: 'one', occurredAt: '2026-10-12', mode: 'dictation' }, { id: 'old', entryId: 'two', occurredAt: '2026-01-01' }, { id: 'import', entryId: 'three', occurredAt: null, updatedAt: '2026-10-12' }],
    vocabularyEvidence: [{ id: 'recent:listening', entryId: 'one', dimension: 'listening', sourceId: 'recent', occurredAt: '2026-10-12' }, { id: 'recent:spelling', entryId: 'one', dimension: 'spelling', sourceId: 'recent', occurredAt: '2026-10-12' }, { id: 'independent', entryId: 'two', dimension: 'meaning', occurredAt: '2026-10-11' }],
  };
  expect(getVocabularyPracticeResults(state, Date.parse('2026-10-06')).map(row => row.id)).toEqual(['recent', 'independent']);
  expect(getVocabularyPracticeResults(state, 0)).toHaveLength(4);
});
