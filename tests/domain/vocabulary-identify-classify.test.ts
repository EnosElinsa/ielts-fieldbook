import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
import {hasVocabularySenseEdits,learningTask} from '../../src/domain/vocabulary/content';
import {getVocabularyLearningPriority,isVocabularyReadingNote,isVocabularySpellingReference,supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
import {resolveVocabularyLearningContext} from '../../src/domain/vocabulary/context';
import {getVocabularySenseDiagram} from '../../src/domain/vocabulary/media';
import type {VocabularyEntry,VocabularySense} from '../../src/domain/vocabulary/types';
const terms=['identify','recognise','recognize','classify'];
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const originals=Object.fromEntries(terms.map(term=>[term,JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses as VocabularySense[]]));
const raw=(term:string,n:number)=>originals[term][n];
const records=ledger.records.filter(r=>terms.includes(r.term));
const rows=corrections.filter(r=>records.some(l=>l.entryId===r.entryId&&l.senseId===r.senseId));
const at=(term:string,n:number)=>rows.find(r=>r.senseId===raw(term,n).id)!;
const entry=(term:string)=>catalog.entries.find((e:VocabularyEntry)=>e.term===term) as VocabularyEntry;
const selected=(term:string,n:number)=>supplementVocabularySense(entry(term).id,raw(term,n),[],hasVocabularySenseEdits);
test('all twenty preserved meanings receive source-bound reviews without duplicate restored children',()=>{
 expect(records).toHaveLength(20);expect(rows).toHaveLength(20);expect(sources.filter(s=>terms.includes(s.term))).toEqual([]);
 for(const term of terms)for(const sense of originals[term]){const row=rows.find(r=>r.senseId===sense.id);expect(row?.originalSense).toEqual(sense);expect(row?.referenceUrl).toMatch(/oldid=\d+$/);}
});
test('establishing and disclosing identity are independent actions',()=>{
 expect(at('identify',0).distinctionTask?.answer).toContain('establish');expect(at('identify',1).distinctionTask?.answer).toContain('disclosing');
 expect(at('identify',1).example).toContain('will not identify');expect(at('identify',0).distinctions.join(' ')).toContain('mistaken');
});
test('taxonomic identification does not invent a new species and mathematical identification equates points',()=>{
 expect(at('identify',2).distinctionTask?.answer).toContain('existing taxonomic group');expect(at('identify',2).learningPriority).toBe('specialist');
 expect(at('identify',3).distinctionTask?.answer).toContain('treats the two points as one');expect(at('identify',3).example).toContain('quotient');
});
test('reflexive affinity, group association and identity-as keep their constructions',()=>{
 expect(at('identify',4).usage).toContain('Reflexive');expect(at('identify',4).distinctionTask?.answer).toContain('affinity');
 expect(at('identify',5).usage).toContain('Intransitive');expect(at('identify',5).distinctions.join(' ')).toContain('without asserting formal membership');
 expect(at('identify',6).collocations).toContain('identify oneself as');expect(at('identify',6).distinctionTask?.answer).toContain('uses for herself');
});
test('recognise is valid British spelling, remains learnable and does not inherit the misleading imported label',()=>{
 const sense=selected('recognise',0),row=at('recognise',0);
 expect(raw('recognise',0).register).toContain('nonstandard');expect(sense.register).toBe('');expect(row.originalSense.register).toContain('nonstandard');
 expect(isVocabularySpellingReference(entry('recognise').id,sense)).toBe(false);expect(isVocabularyReadingNote(entry('recognise').id,sense)).toBe(false);
 expect(learningTask({...entry('recognise'),senses:[sense]},sense,'distinction')).toBeDefined();
 expect(row.distinctions.join(' ')).toContain('Oxford-style');expect(row.distinctions.join(' ')).toContain('applies more broadly');
 expect(getVocabularyLearningPriority(entry('recognise').id,sense)).toBe('general');
});
test('memory, accepted validity, acknowledgment and discovering a nature remain distinct recognize meanings',()=>{
 expect(at('recognize',0).distinctionTask?.answer).toContain('earlier encounter');expect(at('recognize',1).distinctionTask?.answer).toContain('stated purpose');
 expect(at('recognize',2).usage).toContain('clause');expect(at('recognize',3).distinctionTask?.answer).toContain('realized');
 expect(at('recognize',3).distinctions.join(' ')).toContain('repairing');expect(at('recognize',4).distinctionTask?.answer).toContain('plans');
});
test('immunological recognition concerns binding without a diagnostic or complete-response guarantee',()=>{
 const row=at('recognize',7);expect(row.learningPriority).toBe('specialist');expect(row.distinctionTask?.answer).toContain('binding');
 expect(row.distinctions.join(' ')).toContain('does not by itself establish');expect(row.distinctions.join(' ')).toContain('clinical diagnosis');
});
test('classification uses an explicit criterion and secrecy classification does not establish truth or encryption',()=>{
 expect(at('classify',0).example).toContain('less than two kilometres');expect(at('classify',0).distinctionTask?.answer).toBe('a short trip');
 expect(at('classify',1).distinctionTask?.answer).toBe('a security classification');expect(at('classify',1).distinctions.join(' ')).toContain('encrypt');expect(at('classify',1).distinctions.join(' ')).toContain('true');
});
test('only two obsolete senses are historical; repeated cognition and make-classy retain unclassified reading guidance',()=>{
 for(const [term,n]of [['recognize',5],['recognize',6],['recognize',8],['classify',2]] as const){const row=at(term,n),sense=selected(term,n);expect(row.exampleKind).toBe('reading-note');expect(isVocabularyReadingNote(entry(term).id,sense)).toBe(true);expect(learningTask({...entry(term),senses:[sense]},sense,'cloze')).toBeUndefined();}
 expect(at('recognize',5).learningPriority).toBe('historical');expect(at('recognize',6).learningPriority).toBe('historical');expect(at('recognize',8)).not.toHaveProperty('learningPriority');expect(at('classify',2)).not.toHaveProperty('learningPriority');
});
test('sixteen exact diagrams and exercises bind the current meanings with everyday defaults',()=>{
 expect(rows.filter(r=>r.distinctionTask)).toHaveLength(16);expect(rows.filter(r=>r.exampleKind==='reading-note')).toHaveLength(4);
 const batch=diagrams.filter(d=>terms.includes(d.term));expect(batch).toHaveLength(16);
 for(const d of batch){const row=rows.find(r=>r.entryId===d.entryId&&r.senseId===d.senseId);expect(d.definition).toBe(row?.definition);expect(d.pos).toBe(row?.originalSense.pos);}
 for(const term of terms){const row=at(term,0);expect(defaults.find(d=>d.entryId===row.entryId)?.sense.id).toBe(raw(term,0).id);}
});
test('a private edit preserves the learner definition and cannot inherit another meaning s diagram',()=>{
 const base=entry('identify'),original=selected('identify',0),edited={...original,definition:'A private classroom instruction.',example:'My own sentence.'};
 const resolved=resolveVocabularyLearningContext({...base,senses:[edited]});expect(resolved.sense?.definition).toBe(edited.definition);expect(resolved.sense?.example).toBe(edited.example);expect(getVocabularySenseDiagram(resolved)).toBeUndefined();
});
