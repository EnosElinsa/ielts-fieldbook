import { describe, expect, it, vi } from 'vitest';
import { getLearnedVocabularyIds, vocabularyGroupProgress } from './progress';
vi.mock('./catalog', () => ({ VOCABULARY_CATALOG: { memberships: [{ bookId: 'book', unitId: 'group', entryId: 'one' }] } }));
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
