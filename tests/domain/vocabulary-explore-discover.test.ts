import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import {hasVocabularySenseEdits,learningTask} from '../../src/domain/vocabulary/content';
import {getVocabularyLearningPriority,isVocabularyReadingNote,supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
import {resolveVocabularyLearningContext} from '../../src/domain/vocabulary/context';
import type {VocabularyEntry,VocabularySense} from '../../src/domain/vocabulary/types';
const terms=['explore','inspect','investigate','discover'];
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const originals=Object.fromEntries(terms.map(term=>[term,JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses as VocabularySense[]]));
const entry=(term:string)=>catalog.entries.find((item:VocabularyEntry)=>item.term===term) as VocabularyEntry;
const raw=(term:string,at:number)=>originals[term][at];
const row=(term:string,at:number)=>corrections.find(item=>item.entryId===entry(term).id&&item.senseId===raw(term,at).id)!;
const selected=(term:string,at:number)=>supplementVocabularySense(entry(term).id,raw(term,at),[],hasVocabularySenseEdits);

test('twenty-five independently reviewed records retain lowercase and capitalised source identities',()=>{
 expect(ledger.records.filter(item=>terms.includes(item.term))).toHaveLength(25);
 for(const term of terms)for(const [at,sense]of originals[term].entries())expect(row(term,at).originalSense).toEqual(sense);
 for(const at of [8,9]){
  expect(row('discover',at).referenceUrl).toMatch(/title=Discover&oldid=/);
  expect(raw('discover',at).sourceUrl).toContain('/Discover#');
 }
});
test('explore starts with ordinary systematic examination while obsolete search remains an independent reading',()=>{
 expect(raw('explore',0).register).toContain('obsolete');
 expect(resolveVocabularyLearningContext(entry('explore'),{}).sense?.id).toBe(raw('explore',1).id);
 expect(row('explore',1).distinctionTask?.answer).toBe('examining the alternatives');
 expect(isVocabularyReadingNote(entry('explore').id,selected('explore',0))).toBe(true);
});
test('travel and first-hand experience neither erase earlier visitors nor assert completed intentions',()=>{
 expect(row('explore',2).distinctions.join(' ')).toContain('without making them the first people ever');
 expect(row('explore',4).example).toContain('wanted');expect(row('explore',4).distinctionTask?.answer).toContain('first-hand experience');
 expect(row('explore',5).usage).toContain('Intransitive');expect(row('explore',5).distinctions.join(' ')).toContain('without restricting');
 expect(row('explore',6).distinctions.join(' ')).toContain('planned or systematic');
 expect(row('explore',8).usage).toContain('countable noun');
});
test('diagnostic and sexual-variety readings remain explicitly scoped without invented sentence gaps',()=>{
 for(const at of [3,7]){
  const sense=selected('explore',at);expect(isVocabularyReadingNote(entry('explore').id,sense)).toBe(true);
  expect(learningTask({...entry('explore'),senses:[sense]},sense,'cloze')).toBeUndefined();
 }
 expect(row('explore',3).usage).toContain('intransitive');expect(getVocabularyLearningPriority(entry('explore').id,selected('explore',3))).toBe('specialist');
 expect(getVocabularyLearningPriority(entry('explore').id,selected('explore',7))).toBeUndefined();
});
test('inspection separates careful checking, deeper examination and official capacity without guaranteeing approval',()=>{
 expect(row('inspect',0).distinctions.join(' ')).toContain('does not guarantee');
 expect(row('inspect',1).distinctions.join(' ')).toContain('need not involve cutting');
 expect(row('inspect',2).distinctionTask?.answer).toBe('a planned official examination');
});
test('investigation of an allegation does not prove its claim and its intransitive construction remains modern',()=>{
 expect(row('investigate',1).example).toContain('allegations');expect(row('investigate',1).distinctions.join(' ')).toContain('rather than proof');
 expect(row('investigate',2).distinctionTask?.answer).toBe('has no stated direct object');
});
test('discover distinguishes personal learning, a cleared chess attack line and jurisdiction-specific discovery questioning',()=>{
 expect(row('discover',0).distinctionTask?.answer).toBe('my knowledge of the opening hours');
 expect(row('discover',3).distinctionTask?.answer).toBe('create the attack by clearing the line');
 expect(row('discover',3).distinctions.join(' ')).toContain('full position');
 const legal=selected('discover',4);expect(isVocabularyReadingNote(entry('discover').id,legal)).toBe(true);
 expect(row('discover',4).distinctions.join(' ')).toContain('procedure available in every jurisdiction');
});
test('now rare is distinguished from the import’s archaic label and Discover names retain their own priorities',()=>{
 expect(raw('discover',2).register).toContain('archaic');expect(row('discover',2).usage).toContain('Now rare');
 expect(getVocabularyLearningPriority(entry('discover').id,selected('discover',2))).toBeUndefined();
 for(const at of [8,9])expect(getVocabularyLearningPriority(entry('discover').id,selected('discover',at))).toBe('proper-name');
 expect(row('discover',8).definition).toContain('credit card');expect(row('discover',9).definition).toContain('1980');
 const personal={...selected('explore',1),definition:'Our tutor’s own interpretation.',example:'My own class note.'};
 expect(supplementVocabularySense(entry('explore').id,personal,[],hasVocabularySenseEdits)).toEqual(personal);
});
