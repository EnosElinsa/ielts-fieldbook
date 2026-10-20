import {expect, test} from 'vitest';
import type {VocabularyStore} from './types';
import {vocabularyReviewTeaching} from './reviewTeaching';

const now = Date.parse('2026-10-21T10:00:00Z');
function store(due: unknown, extra = {}): Partial<VocabularyStore> {
  return {
    vocabulary: [{id:'saved', tags:[]}],
    vocabularyStates: [{entryId:'saved', senseId:'meaning', cards:{definition:{due}}, ...extra}],
  } as unknown as Partial<VocabularyStore>;
}

test.each([undefined, null, '', 'invalid', new Date(NaN)])('missing or invalid schedule %s cannot prepare a due word', due => {
  expect(vocabularyReviewTeaching(store(due), 'definition', true, false, now)).toEqual({entryIds:[], nextChangeAt:null});
});

test('only current-mode schedules count, with an exact inclusive due boundary', () => {
  const state=store(new Date(now), {cards:{definition:{due:new Date(now)}, dictation:{due:new Date(now+1000)}}});
  expect(vocabularyReviewTeaching(state, 'definition', true, false, now)).toEqual({entryIds:['saved'], nextChangeAt:null});
  expect(vocabularyReviewTeaching(state, 'dictation', true, false, now)).toEqual({entryIds:[], nextChangeAt:now+1000});
  expect(vocabularyReviewTeaching(state, 'cloze', true, false, now)).toEqual({entryIds:[], nextChangeAt:null});
});

test('archived and unsaved schedules do not load teaching or wake the setup clock', () => {
  const state=store(new Date(now+1000));
  state.vocabulary![0].tags=['archived'];
  expect(vocabularyReviewTeaching(state, 'definition', true, false, now)).toEqual({entryIds:[], nextChangeAt:null});
  state.vocabulary=[];
  expect(vocabularyReviewTeaching(state, 'definition', true, false, now)).toEqual({entryIds:[], nextChangeAt:null});
});

test('retry requires both current-mode and overall unresolved state, without requiring a schedule', () => {
  const state=store(undefined, {wrong:{active:true, modes:{definition:{active:true}}}});
  expect(vocabularyReviewTeaching(state, 'definition', false, true, now).entryIds).toEqual(['saved']);
  expect(vocabularyReviewTeaching(state, 'dictation', false, true, now).entryIds).toEqual([]);
  expect(vocabularyReviewTeaching(store(undefined, {wrong:{active:false, modes:{definition:{active:true}}}}), 'definition', false, true, now).entryIds).toEqual([]);
});

test('last duplicate state wins and multiple meanings load one word, waking at the earliest future schedule', () => {
  const state=store(new Date(now-1000));
  state.vocabularyStates!.push({...state.vocabularyStates![0], cards:{definition:{due:new Date(now+3000)}}} as any);
  state.vocabularyStates!.push({...state.vocabularyStates![0], senseId:'second', cards:{definition:{due:new Date(now+1000)}}} as any);
  expect(vocabularyReviewTeaching(state, 'definition', true, false, now)).toEqual({entryIds:[], nextChangeAt:now+1000});
  expect(vocabularyReviewTeaching(state, 'definition', true, false, now+3000)).toEqual({entryIds:['saved'], nextChangeAt:null});
});

test('custom selection restores all saved nonarchived words including words without a schedule', () => {
  const state=store(undefined);
  state.vocabularyStates=[];
  state.vocabulary!.push({...state.vocabulary![0],id:'other'});
  state.vocabulary!.push({...state.vocabulary![0],id:'archived',tags:['archived']});
  expect(vocabularyReviewTeaching(state,'definition',false,false,now)).toEqual({entryIds:['other','saved'],nextChangeAt:null});
});
