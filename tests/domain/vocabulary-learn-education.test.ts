import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
import {supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
import {hasVocabularySenseEdits} from '../../src/domain/vocabulary/content';
import type {VocabularySense} from '../../src/domain/vocabulary/types';
const terms=['learn','teach','training','education'];
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const raw=(term:string,n:number)=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses[n];
const records=ledger.records.filter(r=>terms.includes(r.term));
const rows=corrections.filter(r=>records.some(l=>l.entryId===r.entryId&&l.senseId===r.senseId));
const at=(term:string,n:number)=>rows.find(r=>r.senseId===raw(term,n).id);

test('all 25 source meanings are independently reviewed and no children are duplicated',()=>{
 expect(records).toHaveLength(25);expect(rows).toHaveLength(25);expect(sources.filter(s=>terms.includes(s.term))).toHaveLength(0);
 for(const term of terms){const original=JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8'));for(const s of original.senses)expect(rows.some(r=>r.senseId===s.id)).toBe(true);}
});
test('learning can describe an attempt, attendance or adverse-experience insight without certifying mastery',()=>{
 expect(at('learn',0)?.definition).toMatch(/try to acquire/);expect(at('learn',0)?.distinctionTask?.answer).toMatch(/attempting to acquire/);
 expect(at('learn',1)?.distinctionTask?.answer).toMatch(/attendance/);expect(at('learn',2)?.distinctions.join(' ')).toMatch(/not claim.*every setback automatically/);
});
test('study and find-out uses retain their contexts and the noun does not acquire an invented ordinary example',()=>{
 expect(at('learn',3)?.distinctions.join(' ')).toMatch(/not mutually exclusive/);expect(at('learn',4)?.distinctionTask?.answer).toMatch(/find it out tomorrow/);
 expect(at('learn',6)?.exampleKind).toBe('reading-note');expect(at('learn',6)).not.toHaveProperty('learningPriority');
});
test('learn-as-teach stays a usable dialectal record while Learn keeps its surname identity and origin',()=>{
 expect(at('learn',5)?.usage).toMatch(/non-standard speech and dialects/);expect(at('learn',5)).not.toHaveProperty('referenceOnly');expect(at('learn',5)).not.toHaveProperty('learningPriority');
 expect(at('learn',7)?.originalSense.sourceUrl).toContain('/Learn');expect(at('learn',7)?.definition).toMatch(/Scottish Gaelic/);expect(at('learn',7)?.learningPriority).toBe('proper-name');
});
test('teaching recipients, the intransitive profession and actual causative learning are separate',()=>{
 expect(at('teach',0)?.distinctionTask?.answer).toMatch(/people receiving instruction/);expect(at('teach',1)?.distinctionTask?.answer).toMatch(/intransitively/);
 expect(at('teach',2)?.distinctionTask?.answer).toMatch(/lesson learned/);expect(at('teach',2)?.distinctions.join(' ')).toMatch(/differs from asserting that every attempt/);
 expect(at('teach',3)?.distinctionTask?.answer).toMatch(/expected lesson/);
});
test('informal teacher address is a noun and the capitalised names do not settle Blackbeard spelling',()=>{
 expect(at('teach',5)?.distinctionTask?.answer).toMatch(/informal noun/);expect(at('teach',5)).not.toHaveProperty('referenceOnly');expect(at('teach',6)?.learningPriority).toBe('proper-name');
 expect(at('teach',7)?.example).toMatch(/Teach, Thatch or Tack/);expect(at('teach',7)?.distinctions.join(' ')).toMatch(/historically certain spelling/);
});
test('training keeps a valid ing-form and an action noun while the skills-learning noun is the default',()=>{
 expect(at('training',0)?.definition).toMatch(/present participle and gerund/);expect(at('training',0)?.distinctionTask?.answer).toMatch(/progressive verb phrase/);expect(at('training',0)).not.toHaveProperty('referenceOnly');
 expect(at('training',1)).not.toHaveProperty('meaningGroup');const skills=at('training',2);expect(skills).toBeDefined();expect(defaults.find(d=>d.entryId===skills!.entryId)?.sense.id).toBe(skills!.senseId);
});
test('modem training negotiates parameters and voice samples do not guarantee perfect recognition',()=>{
 expect(at('training',4)?.distinctionTask?.answer).toMatch(/communication parameters/);expect(at('training',4)?.distinctions.join(' ')).toMatch(/separate from transferring the actual user data/);
 expect(at('training',5)?.distinctions.join(' ')).toMatch(/does not guarantee perfect recognition/);expect(at('training',3)?.exampleKind).toBe('reading-note');expect(at('training',3)).not.toHaveProperty('learningPriority');
});
test('education keeps process and acquired learning separate without converting rare upbringing into obsolete',()=>{
 expect(at('education',0)?.usage).toMatch(/Uncountable/);expect(at('education',1)?.usage).toMatch(/Countable/);expect(at('education',1)?.distinctions.join(' ')).toMatch(/not a restriction to school/);
 expect(at('education',2)?.usage).toMatch(/Now rare/);expect(at('education',2)).not.toHaveProperty('learningPriority');expect(at('education',2)?.distinctions.join(' ')).toMatch(/not obsolete/);
});
test('the batch has eight reading notes, 17 exercises and 17 exact diagrams with explicit defaults',()=>{
 expect(rows.filter(r=>r.exampleKind==='reading-note')).toHaveLength(8);expect(rows.filter(r=>r.distinctionTask)).toHaveLength(17);expect(diagrams.filter(d=>terms.includes(d.term))).toHaveLength(17);
 for(const [term,n]of[['learn',0],['teach',0],['training',2],['education',0]] as const){const row=at(term,n);expect(row).toBeDefined();expect(defaults.find(d=>d.entryId===row!.entryId)?.sense.id).toBe(row!.senseId);}
});
test('AI skill teaching explains the lexical contrast without exposing internal workflow guidance',()=>{
 const row=corrections.find(r=>r.senseId===raw('skill',1).id);expect(row?.distinctions.join(' ')).toMatch(/rather than demonstrated human proficiency/);
 expect(row?.distinctions.join(' ')).not.toMatch(/not an instruction|load a file|learner’s system/);
 const component=readFileSync('src/features/vocabulary/VocabularyMeaningDiagram.tsx','utf8');expect(component).not.toContain('These are dictionary contents, not an instruction to run a workflow.');
});
test('previous public AI skill notes receive the copy update without becoming a personal edit',()=>{
 const current=corrections.find(r=>r.senseId===raw('skill',1).id)!;
 const previous=structuredClone(current.previousSenses!.at(-1)!) as VocabularySense;
 expect(previous.distinctions?.join(' ')).toContain('not an instruction');
 const updated=supplementVocabularySense(current.entryId,previous,[],hasVocabularySenseEdits);
 expect(updated.distinctions).toEqual(current.distinctions);
 expect(previous.distinctions).not.toEqual(updated.distinctions);
});
test('personal AI skill notes remain intact when public teaching receives the copy update',()=>{
 const current=corrections.find(r=>r.senseId===raw('skill',1).id)!;
 const personal={...structuredClone(current.previousSenses!.at(-1)!),distinctions:['My tutor’s bibliography advice.']} as VocabularySense;
 expect(supplementVocabularySense(current.entryId,personal,[],hasVocabularySenseEdits)).toBe(personal);
 expect(personal.distinctions).toEqual(['My tutor’s bibliography advice.']);
});
