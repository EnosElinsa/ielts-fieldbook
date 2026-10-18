import { expect, test } from 'vitest';
import forms from '../../src/domain/vocabulary/sentenceGapForms.json';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import catalog from '../../public/vocabulary-catalog.json';
import { learningTask, hasVocabularySenseEdits } from '../../src/domain/vocabulary/content';
import { supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import { createVocabularySession, evaluateVocabularySessionAnswer, buildVocabularySessionCommit } from '../../src/domain/vocabulary/session';
import { getVocabularyReviewQueue } from '../../src/domain/vocabulary';
import type { VocabularyEntry, VocabularyStore } from '../../src/domain/vocabulary/types';
const select = (row: typeof forms[number]) => {
 const correction = corrections.find(c => c.entryId === row.entryId && c.senseId === row.senseId)!;
 const sense = supplementVocabularySense(row.entryId, correction.originalSense, [], hasVocabularySenseEdits);
 const raw = catalog.entries.find(e => e.id === row.entryId)!;
 return { ...raw, senses: [sense] } as VocabularyEntry;
};
const store = (entry: VocabularyEntry) => ({vocabulary:[entry],vocabularyStates:[],vocabularyEvidence:[],vocabularyReviews:[],vocabularyActivities:[],wordbookProgress:[],wordbookEnrollments:[],vocabularyImportBatches:[],vocabularySessions:[]} as VocabularyStore);

test.each(forms)('$term accepts the authored form for the exact selected meaning and rejects an ungrammatical lemma', row => {
 const entry = select(row), sense = entry.senses[0];
 const task = learningTask(entry, sense, 'cloze');
 expect(task?.prompt).toBe(row.example.replace(row.form, '_____'));
 expect(task?.acceptedAnswers).toEqual([row.form]);
 const cards = getVocabularyReviewQueue(store(entry), {entryId:entry.id,senseId:sense.id,mode:'cloze',dueOnly:false});
 expect(cards).toHaveLength(1);
 expect(evaluateVocabularySessionAnswer(cards[0],row.form).result).toBe('success');
 expect(evaluateVocabularySessionAnswer(cards[0],row.term).result).toBe('failure');
 expect(evaluateVocabularySessionAnswer(cards[0],row.form.toUpperCase()).result).toBe('success');
});

test.each(forms)('$term never lends a form to another identity or edited meaning', row => {
 const entry = select(row), sense = entry.senses[0];
 const notAuthored = (task: ReturnType<typeof learningTask>) => {
  expect(task?.acceptedAnswers).not.toEqual([row.form]);
  expect(task?.prompt).not.toBe(row.example.replace(row.form, '_____'));
 };
 notAuthored(learningTask({...entry,id:'personal:different'},sense,'cloze'));
 notAuthored(learningTask({...entry,term:'different'},sense,'cloze'));
 for(const change of [{id:'personal:different'},{definition:'A personal meaning.'},{pos:'noun'},{example:row.example+' A personal continuation.'},{source:'Personal note'}]) {
  const altered = {...sense,...change};
  notAuthored(learningTask({...entry,senses:[altered]},altered,'cloze'));
 }
});

test('a sentence-gap task and accepted form remain frozen when the saved learning notes change', () => {
 const row = forms[0], entry = select(row), state=store(entry);
 const cards = getVocabularyReviewQueue(state,{entryId:row.entryId,senseId:row.senseId,mode:'cloze',dueOnly:false});
 expect(cards).toHaveLength(1);
 const session = createVocabularySession(cards,'cloze',{});
 session.answers[cards[0].id]={response:row.form,answeredAt:'2026-10-18T00:00:00Z',durationMs:1};
 state.vocabulary[0].senses[0]={...entry.senses[0],example:'Our own example.'};
 cards[0].task!.acceptedAnswers=[row.term];
 expect(session.cardSnapshots![0].task?.acceptedAnswers).toEqual([row.form]);
 expect(buildVocabularySessionCommit(state,session,cards).results[0].result).toBe('success');
});

test('each authored form has one scoped reviewed sentence and an inflected target', () => {
 expect(forms).toHaveLength(5);
 expect(new Set(forms.map(row=>row.entryId+'|'+row.senseId)).size).toBe(forms.length);
 for(const row of forms){
  const correction = corrections.find(c=>c.entryId===row.entryId&&c.senseId===row.senseId)!;
  expect(correction.example).toBe(row.example);
  expect(correction.definition).toBe(row.definition);
  expect(correction.originalSense.pos).toBe(row.pos);
  expect(correction).not.toHaveProperty('exampleKind');
  expect(row.form).not.toBe(row.term);
  expect(row.example.split(row.form)).toHaveLength(2);
 }
});
