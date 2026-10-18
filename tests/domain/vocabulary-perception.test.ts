import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import {hasVocabularySenseEdits,learningTask} from '../../src/domain/vocabulary/content';
import {getVocabularyLearningPriority,isVocabularyReadingNote,supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
import {resolveVocabularyLearningContext} from '../../src/domain/vocabulary/context';
import type {VocabularyEntry,VocabularySense} from '../../src/domain/vocabulary/types';

const terms=['observe','perceive','notice','detect'];
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const originals=Object.fromEntries(terms.map(term=>[term,JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses as VocabularySense[]]));
const entry=(term:string)=>catalog.entries.find((item:VocabularyEntry)=>item.term===term) as VocabularyEntry;
const raw=(term:string,at:number)=>originals[term][at];
const row=(term:string,at:number)=>corrections.find(item=>item.entryId===entry(term).id&&item.senseId===raw(term,at).id)!;
const selected=(term:string,at:number)=>supplementVocabularySense(entry(term).id,raw(term,at),[],hasVocabularySenseEdits);

test('all twenty-two perception records keep their independent source identities',()=>{
 const records=ledger.records.filter(item=>terms.includes(item.term));expect(records).toHaveLength(22);
 for(const term of terms)for(const [at,sense]of originals[term].entries()){
  expect(row(term,at).originalSense).toEqual(sense);expect(row(term,at).referenceUrl).toMatch(/oldid=\d+$/);
 }
});
test('observation, rule compliance, occasion keeping and making a remark stay distinct',()=>{
 expect(row('observe',0).distinctions.join(' ')).toContain('does not by itself establish why');
 expect(row('observe',1).distinctionTask?.answer).toBe('comply with the limit');
 expect(row('observe',2).distinctionTask?.answer).toBe('mark or celebrate the occasion');
 expect(row('observe',2).usage).toContain('time convention');
 expect(row('observe',3).distinctionTask?.answer).toBe('a remark she made');
});
test('perception distinguishes sensory awareness from an interpretation without guaranteeing accuracy',()=>{
 expect(row('perceive',0).distinctionTask?.answer).toBe('become aware of the sound');
 expect(row('perceive',1).distinctionTask?.answer).toBe('their interpretations of it');
 expect(row('perceive',1).usage).toContain('as');expect(row('perceive',1).distinctions.join(' ')).toContain('accurate');
});
test('notice separates awareness, written announcement, formal notification and critical review',()=>{
 expect(row('notice',0).usage).toContain('Uncountable');expect(row('notice',1).usage).toContain('Countable');
 expect(row('notice',2).example).toContain('a formal notice');expect(row('notice',2).distinctions.join(' ')).toContain('overlap');
 expect(row('notice',4).distinctionTask?.answer).toBe('a published critical review');
});
test('employment notice uses an example-specific contract and prior notice need not concern employment',()=>{
 expect(row('notice',3).example).toContain('Under her contract');
 expect(row('notice',3).distinctions.join(' ')).toContain('not to every employment relationship');
 expect(row('notice',5).example).toContain('booking');expect(row('notice',8).distinctions.join(' ')).toContain('overlap');
});
test('detection does not prove a cause and informal detective work does not guarantee a solved case',()=>{
 expect(row('detect',0).example).toContain('0.2°C');expect(row('detect',0).distinctions.join(' ')).toContain('diagnosis');
 expect(row('detect',1).usage).toContain('intransitive');expect(row('detect',1).distinctions.join(' ')).toContain('does not guarantee');
});
test('dated source uses retain reading guidance, while unclassified uses acquire no invented historical label',()=>{
 for(const [term,at]of [['observe',4],['notice',6],['notice',7],['notice',9],['notice',10],['notice',11],['detect',2]] as const){
  const sense=selected(term,at);expect(isVocabularyReadingNote(entry(term).id,sense)).toBe(true);
  expect(learningTask({...entry(term),senses:[sense]},sense,'cloze')).toBeUndefined();
 }
 for(const at of [10,11])expect(getVocabularyLearningPriority(entry('notice').id,selected('notice',at))).toBeUndefined();
 expect(getVocabularyLearningPriority(entry('detect').id,selected('detect',1))).toBeUndefined();
 expect(row('notice',11).example).toContain('prejudicial claim, not evidence');expect(row('notice',11)).not.toHaveProperty('distinctionTask');
});
test('notice opens on ordinary becoming-aware while all four explicit defaults preserve exact sense choices',()=>{
 for(const [term,at]of [['observe',0],['perceive',0],['notice',8],['detect',0]] as const){
  expect(resolveVocabularyLearningContext(entry(term),{}).sense?.id).toBe(raw(term,at).id);
 }
 const personal={...selected('notice',3),definition:'My contract requires six weeks of notice.',example:'My own note.'};
 expect(supplementVocabularySense(entry('notice').id,personal,[],hasVocabularySenseEdits)).toEqual(personal);
});
