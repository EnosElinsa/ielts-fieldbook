import { afterEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { getVocabularyReviewQueue } from '../../src/domain/vocabulary';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { buildVocabularySessionCommit, createVocabularySession, evaluateVocabularySessionAnswer, updateVocabularySessionAnswer, type VocabularySessionRecord } from '../../src/domain/vocabulary/session';
import { resolveVocabularyRetry } from '../../src/domain/vocabulary/retry';
import type { VocabularyEntry } from '../../src/domain/vocabulary/types';

const original = {...VOCABULARY_CATALOG};
afterEach(()=>Object.assign(VOCABULARY_CATALOG, original));
function fixture() {
  Object.assign(VOCABULARY_CATALOG, JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8')));
  const raw = (VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]).find(entry=>entry.term==='core')!;
  const card = getVocabularyReviewQueue({vocabulary:[raw]}, {mode:'dictation',dueOnly:false,senseId:'kaikki:846f18ca02f7f1d01c'})[0];
  const session = createVocabularySession([card],'dictation',{});
  const record: VocabularySessionRecord = {...session,status:'submitted',submittedAt:session.startedAt,updatedAt:session.startedAt,results:[evaluateVocabularySessionAnswer(card,'cor')],summary:{total:1,correct:0,incorrect:1,pending:0},entryIds:[raw.id],reviewIds:[],selection:{kind:'unit',bookId:'guixue:10174',unitId:'21840'},filter:{bookId:'guixue:10174',unitId:'21840'}};
  // The frozen explicit-sense route must share the record's source context.
  card.context = {...card.context!,bookId:'guixue:10174',unitId:'21840'};
  record.cardSnapshots = [structuredClone(card)];
  return {raw,card,record};
}

test('frozen dictation retains original sense and does not alias the saved snapshot',()=>{
  const {raw,record} = fixture();
  const before = structuredClone(record);
  const retry = resolveVocabularyRetry({vocabulary:[raw]},record);
  expect(retry.unavailable).toEqual([]);
  expect(retry.cards[0].senseId).toBe('kaikki:846f18ca02f7f1d01c');
  retry.cards[0].entry.senses[0].definition='Caller edit';
  expect(record).toEqual(before);
});

test('frozen non-dictation keeps the historical geography sense and task in the current food group',()=>{
  const {raw,record} = fixture();
  const historical = record.cardSnapshots![0];
  record.mode='definition'; historical.mode='definition';
  historical.id='ve-7c70dbbe:kaikki:846f18ca02f7f1d01c:definition';
  historical.dimension='meaning';
  historical.task={prompt:'Historical question about the centre of the Earth.',acceptedAnswers:['old-answer'],explanation:'Old geography explanation.'};
  record.results=[evaluateVocabularySessionAnswer(historical,'wrong')];
  const before = structuredClone(record);
  const state={vocabulary:[raw],vocabularyStates:[],vocabularyEvidence:[],vocabularyReviews:[],vocabularyActivities:[],wordbookProgress:[],wordbookEnrollments:[],vocabularyImportBatches:[],vocabularySessions:[record]};
  const retry=resolveVocabularyRetry(state,record);
  expect(retry.unavailable).toEqual([]);
  const session=createVocabularySession(retry.cards,'definition',{},record.filter,{kind:'retry'});
  const answered=updateVocabularySessionAnswer(session,historical.id,'old-answer');
  const commit=buildVocabularySessionCommit(state,answered,retry.cards);
  expect(commit.results[0]).toMatchObject({result:'success',senseId:'kaikki:846f18ca02f7f1d01c',expectedAnswer:'old-answer',prompt:'Historical question about the centre of the Earth.'});
  expect(commit.state.vocabularyStates[0].senseId).toBe('kaikki:846f18ca02f7f1d01c');
  expect(commit.state.vocabularySessions[0]).toEqual(before);
  expect(record).toEqual(before);
});

test('legacy dictation remaps even a stale explicit sense filter and missing learner catalog entry',()=>{
  const {record} = fixture(); delete record.cardSnapshots;
  record.filter.senseId='kaikki:846f18ca02f7f1d01c';
  const retry = resolveVocabularyRetry({vocabulary:[]},record);
  expect(retry.unavailable).toEqual([]);
  expect(retry.cards[0].id).toBe('ve-7c70dbbe:editorial:core:fruit-centre:dictation');
});

test('legacy non-dictation never switches to a current group sense or rewritten same-ID question',()=>{
  const {raw,record} = fixture(); delete record.cardSnapshots;
  record.mode='definition';
  record.results[0].cardId='ve-7c70dbbe:kaikki:846f18ca02f7f1d01c:definition';
  record.results[0].definition='A frozen earlier definition.';
  const retry = resolveVocabularyRetry({vocabulary:[raw]},record);
  expect(retry.cards).toEqual([]);
  expect(retry.unavailable.map(row=>row.term)).toEqual(['core']);
});

test('malformed frozen mode or missing sense is explicitly unavailable',()=>{
  const {raw,record} = fixture();
  record.cardSnapshots![0].mode='synonym';
  expect(resolveVocabularyRetry({vocabulary:[raw]},record).unavailable).toHaveLength(1);
  record.cardSnapshots![0].mode='dictation';
  record.cardSnapshots![0].entry.senses=[];
  expect(resolveVocabularyRetry({vocabulary:[raw]},record).unavailable).toHaveLength(1);
});

test('archived entries cannot be reintroduced by historical snapshots',()=>{
  const {raw,record} = fixture();
  const archived = {...raw,tags:['archived']};
  expect(resolveVocabularyRetry({vocabulary:[archived]},record).unavailable).toHaveLength(1);
});
