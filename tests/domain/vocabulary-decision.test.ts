import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import { hasVocabularySenseEdits, learningTask } from '../../src/domain/vocabulary/content';
import { isVocabularyReadingNote, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import { getVocabularySenseDiagram } from '../../src/domain/vocabulary/media';
import { getVocabularyDiagramPackId } from '../../src/features/vocabulary/diagramPacks';
import { getVocabularyPronunciation, freezeVocabularyPronunciation } from '../../src/domain/vocabulary/sensePronunciation';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const terms = ['choose', 'decide', 'determine', 'resolve'];
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const raw = (term: string): VocabularySense[] => JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses;
const entry = (term: string): VocabularyEntry => catalog.entries.find((e: VocabularyEntry) => e.term === term);
const records = ledger.records.filter(r => terms.includes(r.term));
const rows = corrections.filter(r => records.some(l => l.entryId === r.entryId && l.senseId === r.senseId));
const at = (term: string, i: number) => {
  const row = rows.find(r => r.entryId === entry(term).id && r.senseId === raw(term)[i].id);
  expect(row, `${term} meaning ${i}`).toBeDefined(); return row!;
};


test('all 41 choice and resolution meanings retain their original source records and reviewed defaults',()=>{
 expect(records).toHaveLength(41);expect(rows).toHaveLength(41);
 for(const term of terms)for(const[i,s]of raw(term).entries()){expect(at(term,i).originalSense).toEqual(s);expect(records.find(r=>r.senseId===s.id)?.sourceHash).toBe(createHash('sha256').update(JSON.stringify(s)).digest('hex'));}
 for(const[term,i]of [['choose',0],['decide',1],['determine',1],['resolve',0]]as const)expect(defaults.find(r=>r.entryId===entry(term).id)?.sense.id).toBe(raw(term)[i].id);
});
test('binomial choose counts unordered subsets without replacement instead of broken imported notation',()=>{
 expect(at('choose',4).example).toContain('five choose two equals ten');expect(at('choose',4).distinctions.join(' ')).toContain('order does not matter');expect(at('choose',4).distinctions.join(' ')).toContain('without replacement');expect(at('choose',4).example).not.toContain('tbinom');
 expect(at('choose',3).learningPriority).toBeUndefined();expect(at('choose',5).learningPriority).toBe('historical');expect(at('choose',6).exampleKind).toBe('reading-note');
});
test('deciding in computability requires a correct answer and termination on every input',()=>{
 const row=at('decide',3);expect(row.definition).toContain('halt');expect(row.definition).toContain('every');expect(row.example).toContain('finite binary string');expect(row.distinctions.join(' ')).toContain('recognizer');expect(row.distinctionTask?.answer).toContain('every input');expect(at('decide',4).exampleKind).toBe('reading-note');
});
test('determining boundaries, finding an answer and shaping an outcome are separate meanings',()=>{
 expect(at('determine',0).example).toContain('boundaries');expect(at('determine',1).example).toContain('determine whether');expect(at('determine',2).example).toContain('final score');expect(at('determine',4).definition).toContain('authoritative');expect(at('determine',5).distinctions.join(' ')).toContain('does not establish completion');
});
test('the source-qualified legal termination sense is current law rather than universally obsolete',()=>{
 expect(at('determine',7).usage).toContain('otherwise obsolete');expect(at('determine',7).learningPriority).toBe('specialist');expect(at('determine',7).distinctions.join(' ')).toContain('not limited to expiry');expect(at('determine',3).exampleKind).toBe('reading-note');expect(at('determine',6).example).toContain('polygon');
});
test('resolve separates a solution, clarification, firm intention and making peace',()=>{
 expect(at('resolve',0).example).toContain('resolve the booking problem');expect(at('resolve',1).example).toContain('ambiguity');expect(at('resolve',2).example).toContain('resolve to');expect(at('resolve',2).distinctions.join(' ')).toContain('does not establish completion');expect(at('resolve',4).distinctionTask?.answer).toContain('differences');expect(at('resolve',3).learningPriority).toBeUndefined();expect(at('resolve',6).learningPriority).toBeUndefined();
});
test('technical resolution does not confuse magnification, DNS lookup, symbol binding and enantiomer conversion',()=>{
 expect(at('resolve',8).distinctions.join(' ')).toContain('magnification');const computing=at('resolve',9);expect(computing.definition).toContain('source-code symbol');expect(computing.usage).toContain('multiple');expect(computing.distinctions.join(' ')).toContain('connection');expect(at('resolve',15).distinctions.join(' ')).toContain('not convert');expect(at('resolve',15).example).toContain('enantiomers');
});
test('dated medical discuss means disperse, and rare melting senses are not silently relabelled obsolete',()=>{
 expect(at('resolve',13).example).toContain('disperse');expect(at('resolve',13).distinctions.join(' ')).toContain('not conversation');for(const i of[10,11]){expect(at('resolve',i).usage).toContain('Rare');expect(at('resolve',i).learningPriority).toBeUndefined();}expect(at('resolve',19).synonyms).toEqual([]);
});
test('18 typed reading explanations cannot become contextual sentence gaps',()=>{
 const notes=rows.filter(r=>r.exampleKind==='reading-note');expect(notes).toHaveLength(18);
 for(const row of notes){const sense=supplementVocabularySense(row.entryId,row.originalSense as VocabularySense,[],hasVocabularySenseEdits);const term=records.find(r=>r.senseId===row.senseId)!.term;expect(isVocabularyReadingNote(row.entryId,sense)).toBe(true);expect(learningTask({...entry(term),senses:[sense]},sense,'cloze')).toBeUndefined();}
});
test('23 contextual tasks have exact-meaning gaps and authored contrasts',()=>{
 const current=rows.filter(r=>!r.exampleKind);expect(current).toHaveLength(23);
 for(const row of current){const term=records.find(r=>r.senseId===row.senseId)!.term;const sense=supplementVocabularySense(row.entryId,row.originalSense as VocabularySense,[],hasVocabularySenseEdits);const word={...entry(term),senses:[sense]};expect(learningTask(word,sense,'cloze')?.acceptedAnswers).toContain(term);expect(learningTask(word,sense,'distinction')?.acceptedAnswers).toEqual([row.distinctionTask!.answer]);}
});
test('23 diagrams bind exact meanings in the existing C/D/R packs without attaching to personal edits',()=>{
 const current=diagrams.filter(d=>terms.includes(d.term));expect(current).toHaveLength(23);
 for(const row of current){expect(getVocabularyDiagramPackId(row.kind)).toBe(row.term[0]);const sense={id:row.senseId,definition:row.definition,pos:row.pos,example:''};const resolved={entry:entry(row.term),sense,contentReviewed:false}as any;expect(getVocabularySenseDiagram(resolved)?.kind).toBe(row.kind);expect(getVocabularySenseDiagram({...resolved,sense:{...sense,definition:'My own meaning.'}})).toBeUndefined();}
});
test('resolve keeps ordinary /z/ playback separate from re-solve /s/ and freezes exact identities',()=>{
 for(const[i]of raw('resolve').entries()){const row=at('resolve',i);const sense=supplementVocabularySense(row.entryId,row.originalSense as VocabularySense,[],hasVocabularySenseEdits);const match=getVocabularyPronunciation(entry('resolve'),sense);expect(match.required).toBe(true);expect(match.group?.id).toBe(i===20?'resolve-again':'resolve-ordinary');expect(freezeVocabularyPronunciation(entry('resolve'),sense)).toEqual({version:1,bindingId:match.binding!.id});if(i===20){expect(match.group?.ipa.us).toContain('sɑ');expect(match.recordings).toEqual([]);expect(row).not.toHaveProperty('referenceOnly');}else{expect(match.group?.ipa.us).toContain('zɑ');expect(match.recordings).toHaveLength(1);}expect(getVocabularyPronunciation(entry('resolve'),{...sense,definition:'My own meaning.'}).recordings).toEqual([]);expect(getVocabularyPronunciation(entry('resolve'),sense,'legacy').required).toBe(false);}
});
