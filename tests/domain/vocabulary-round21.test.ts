import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import {hasVocabularySenseEdits,learningTask,reviewedEntry} from '../../src/domain/vocabulary/content';
import {resolveVocabularyLearningContext} from '../../src/domain/vocabulary/context';
import {getVocabularyLearningPriority,isVocabularyReadingNote,supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import type {VocabularyEntry,VocabularySense} from '../../src/domain/vocabulary/types';
const terms=['imply','infer','convince','persuade'];
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const entry=(term:string)=>catalog.entries.find((e:VocabularyEntry)=>e.term===term) as VocabularyEntry;
const raw=(term:string,at:number)=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses[at] as VocabularySense;
const teaching=(term:string,at:number)=>supplementVocabularySense(entry(term).id,raw(term,at),[raw(term,at)],hasVocabularySenseEdits);

test.each(terms)('%s preserves personal notes and an explicitly selected original meaning',term=>{
 const base=entry(term),personal={...base.senses[0],definition:'Our classroom meaning.',example:'Our own classroom example.'};
 expect(supplementVocabularySense(base.id,personal,[base.senses[0]],hasVocabularySenseEdits)).toEqual(personal);
 expect(reviewedEntry({...base,senses:[personal]}).senses[0].definition).toBe(personal.definition);
 expect(resolveVocabularyLearningContext({...base,senses:[raw(term,0)]},{senseId:raw(term,0).id}).sense?.id).toBe(raw(term,0).id);
});

test('imply opens with indirect suggestion while its logical consequence stays independently selectable',()=>{
 expect(reviewedEntry(entry('imply')).senses[0].id).toBe(raw('imply',2).id);
 expect(teaching('imply',0).definition).toMatch(/necessary consequence/);
 expect(teaching('imply',0).distinctions?.join(' ')).toMatch(/does not establish the premise.*causal mechanism.*reverse implication/);
 expect(teaching('imply',2).distinctions?.join(' ')).toMatch(/perceived implication can be mistaken/);
});

test('IMPLY keeps its uppercase source identity and exact material-implication truth table',()=>{
 const sense=teaching('imply',4);
 expect(sense.pos).toBe('noun');
 expect(sense.sourceUrl).toBe('https://en.wiktionary.org/wiki/IMPLY#English');
 expect(sense.definition).toMatch(/false only when the first input is true and the second is false/);
 expect(sense.distinctions?.join(' ')).toMatch(/00, 01 and 11 output 1; only 10 outputs 0/);
 expect(sense.distinctionTask?.answer).toBe('1');
 expect(getVocabularyLearningPriority(entry('imply').id,sense)).toBe('specialist');
});

test('imply and infer retain the direction of communication without guaranteeing a conclusion is true',()=>{
 expect(teaching('imply',1).distinctions?.join(' ')).toMatch(/speaker conveys.*listener may infer/);
 expect(teaching('infer',0).distinctions?.join(' ')).toMatch(/Some inferences are deductive.*others are uncertain/);
 expect(teaching('infer',0).example).toMatch(/sprinkler/);
 expect(teaching('infer',0).distinctionTask?.answer).toBe('reasoned but not guaranteed by that sign alone');
});

test('recorded and disputed infer-as-imply is not declared impossible or automatically classified as historical',()=>{
 const sense=teaching('infer',1);
 expect(sense.distinctions?.join(' ')).toMatch(/do not claim the recorded use has never existed/);
 expect(sense.distinctions?.join(' ')).toMatch(/not.*label it obsolete solely because it is disputed/);
 expect(getVocabularyLearningPriority(entry('infer').id,sense)).toBeUndefined();
 expect(isVocabularyReadingNote(entry('infer').id,sense)).toBe(true);
});

test('convince someone to is accepted and a person’s belief is distinct from proof',()=>{
 expect(teaching('convince',0).distinctions?.join(' ')).toMatch(/convinced of something false/);
 expect(teaching('convince',1).distinctions?.join(' ')).toMatch(/established modern construction/);
 expect(teaching('convince',1).distinctions?.join(' ')).toMatch(/not an absolute grammatical ban/);
 expect(teaching('convince',1).distinctionTask?.answer).toBe('an established modern construction');
 expect(teaching('convince',3).distinctionTask?.answer).toBe('a believable portrayal');
});

test('hope to persuade does not establish success and historical labels do not prohibit modern persuade-that',()=>{
 expect(teaching('persuade',0).distinctionTask?.answer).toBe('an intended attempt, with success still uncertain');
 expect(teaching('persuade',0).distinctions?.join(' ')).toMatch(/Persuade can also introduce a belief with that in modern use/);
 expect(teaching('persuade',1).distinctions?.join(' ')).toMatch(/does not make every modern persuade someone that construction obsolete/);
 expect(teaching('persuade',2).usage).toMatch(/Preserved source: archaic, regional; checked revision: now rare, regional/);
 expect(getVocabularyLearningPriority(entry('persuade').id,teaching('persuade',2))).toBeUndefined();
});

test('all eighteen originals have revision-bound reviews, nine tasks and nine exact diagrams',()=>{
 const rows=ledger.records.filter(row=>terms.includes(row.term));
 expect(rows).toHaveLength(18);
 const notes=corrections.filter(row=>rows.some(r=>r.entryId===row.entryId&&r.senseId===row.senseId));
 expect(notes.filter(row=>row.distinctionTask)).toHaveLength(9);
 expect(diagrams.filter(row=>terms.includes(row.term))).toHaveLength(9);
 expect(notes.filter(row=>row.exampleKind==='reading-note')).toHaveLength(9);
 for(const term of terms){
  const senses=JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses;
  senses.forEach((source:VocabularySense,at:number)=>{
   const sense=teaching(term,at);
   if(!isVocabularyReadingNote(entry(term).id,sense))return;
   expect(learningTask(entry(term),sense,'cloze')).toBeUndefined();
   expect(isVocabularyReadingNote(entry(term).id,{...sense,example:'Our independent classroom sentence.'})).toBe(false);
  });
 }
});
