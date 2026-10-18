import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
import {hasVocabularySenseEdits,learningTask} from '../../src/domain/vocabulary/content';
import {isVocabularyReadingNote,supplementVocabularySense} from '../../src/domain/vocabulary/readiness';
import type {VocabularyEntry,VocabularySense} from '../../src/domain/vocabulary/types';
const terms=['compare','contrast','distinguish','differentiate'];
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const raw=(term:string,n:number):VocabularySense=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses[n];
const records=ledger.records.filter(r=>terms.includes(r.term));
const rows=corrections.filter(r=>records.some(l=>l.entryId===r.entryId&&l.senseId===r.senseId));
const at=(term:string,n:number)=>rows.find(r=>r.senseId===raw(term,n).id);
const restored=sources.filter(s=>terms.includes(s.term));
test('all twenty-nine preserved meanings and only two omitted contrast children are independently reviewed',()=>{
 expect(records).toHaveLength(31);expect(rows).toHaveLength(31);expect(restored).toHaveLength(2);
 for(const term of terms)for(const sense of JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses){
  const row=rows.find(r=>r.senseId===sense.id);expect(row?.originalSense).toEqual(sense);expect(row?.referenceUrl).toMatch(/oldid=\d+$/);
 }
 expect(restored.every(s=>s.term==='contrast'&&s.parentSenseId===raw('contrast',0).id)).toBe(true);
 expect(restored.map(s=>s.sense.definition)).toEqual(['The degree of this difference.','A control on a television, etc, that adjusts the amount of contrast in the images being displayed.']);
 expect(sources.filter(s=>s.term==='differentiate')).toEqual([]);
});
test('comparison can find similarities or differences without imposing an absolute preposition rule',()=>{
 expect(at('compare',0)?.distinctionTask?.answer).toMatch(/similarities and differences/);
 expect(at('compare',0)?.distinctions.join(' ')).toMatch(/with and to.*overlap/i);
 expect(at('compare',1)?.distinctionTask?.answer).toContain('similarity in one respect');
});
test('grammatical degree formation, intransitive comparison and programming instructions stay distinct',()=>{
 expect(at('compare',2)?.distinctionTask?.answer).toBe('good, better, best');
 expect(at('compare',3)?.usage).toContain('Intransitive');
 expect(at('compare',5)?.example).toContain('beyond compare');
 expect(at('compare',6)?.distinctionTask?.answer).toContain('instruction');
 expect(at('compare',6)?.distinctions.join(' ')).toMatch(/depends on.*instruction set/);
});
test('colour contrast, its degree and the display control retain independent exact diagrams',()=>{
 const children=rows.filter(r=>r.entryId===at('contrast',0)?.entryId&&'dictionaryParentSenseId' in r);
 expect(children).toHaveLength(2);expect(children.every(r=>r.distinctionTask)).toBe(true);
 expect(children.map(r=>r.distinctionTask?.answer)).toEqual(['how strong the visual difference is','the display setting that adjusts contrast']);
 expect(diagrams.filter(d=>[raw('contrast',0).id,...children.map(r=>r.senseId)].includes(d.senseId))).toHaveLength(3);
});
test('contrasting items, rhetoric and medical contrast remain separate without universal administration claims',()=>{
 expect(at('contrast',2)?.distinctionTask?.answer).toContain('contrasting item');
 expect(at('contrast',3)?.usage).toContain('Rhetoric');
 expect(at('contrast',4)?.usage).toContain('Medicine');
 expect(at('contrast',4)?.distinctions.join(' ')).toMatch(/depends? on.*imaging method/);
 expect(at('contrast',4)?.distinctionTask?.answer).toContain('medium');
 expect(at('contrast',6)?.usage).toContain('Intransitive');
});
test('distinguishing by characteristics, perception, achievement and honour retain their constructions',()=>{
 expect(at('distinguish',0)?.collocations).toContain('distinguish between two things');
 expect(at('distinguish',0)?.distinctionTask?.answer).toContain('recognise a difference');
 expect(at('distinguish',1)?.distinctionTask?.answer).toContain('see clearly');
 expect(at('distinguish',2)?.usage).toContain('Reflexive');
 expect(at('distinguish',2)?.distinctionTask?.answer).toContain('achievement');
 expect(at('distinguish',3)?.distinctionTask?.answer).toContain('confer an honour');
});
test('creating, constituting and recognising a distinction are independent differentiate meanings',()=>{
 expect(at('differentiate',0)?.distinctionTask?.answer).toContain('create a difference');
 expect(at('differentiate',1)?.distinctionTask?.answer).toContain('is the distinguishing feature');
 expect(at('differentiate',2)?.distinctionTask?.answer).toContain('recognise a difference');
 expect(at('differentiate',5)?.usage).toContain('Intransitive');
});
test('derivative and multivariable differential have exact formulas and do not equate differential with finite change',()=>{
 expect(at('differentiate',3)?.distinctionTask?.answer).toBe('f′(x) = 2x');
 expect(at('differentiate',4)?.distinctionTask?.answer).toBe('dz = 2x dx + 2y dy');
 expect(at('differentiate',4)?.distinctions.join(' ')).toMatch(/not generally the exact finite change/);
});
test('educational adaptation and biological development do not become automatic learning or unlimited cell outcomes',()=>{
 expect(at('differentiate',6)?.distinctionTask?.answer).toContain('adapt the teaching');
 expect(at('differentiate',6)?.distinctions.join(' ')).toMatch(/does not guarantee.*progress/);
 expect(at('differentiate',7)?.example).toContain('can differentiate');
 expect(at('differentiate',7)?.distinctions.join(' ')).toMatch(/does not mean.*every.*cell type/);
 expect(at('differentiate',8)?.exampleKind).toBe('reading-note');
});
test('three obsolete meanings remain historical reading guidance and the geological noun is specialist',()=>{
 for(const [term,n]of [['compare',4],['compare',7],['distinguish',4]] as const){
  const row=at(term,n);expect(row?.learningPriority).toBe('historical');expect(row?.usage).toContain('Obsolete');
  const entry=catalog.entries.find((e:VocabularyEntry)=>e.term===term) as VocabularyEntry;
  const selected=supplementVocabularySense(entry.id,raw(term,n),[],hasVocabularySenseEdits);
  expect(isVocabularyReadingNote(entry.id,selected)).toBe(true);expect(learningTask({...entry,senses:[selected]},selected,'cloze')).toBeUndefined();
 }
 expect(at('differentiate',8)?.learningPriority).toBe('specialist');
});
test('the batch has contextual tasks, ordinary defaults and exact diagram bindings',()=>{
 expect(rows.filter(r=>r.exampleKind==='reading-note')).toHaveLength(4);expect(rows.filter(r=>r.distinctionTask)).toHaveLength(27);
 const batch=diagrams.filter(d=>terms.includes(d.term));expect(batch).toHaveLength(27);
 for(const d of batch){const row=rows.find(r=>r.entryId===d.entryId&&r.senseId===d.senseId);expect(d.definition).toBe(row?.definition);expect(d.pos).toBe(row?.originalSense.pos);}
 for(const [term,n]of [['compare',0],['contrast',1],['distinguish',0],['differentiate',2]] as const){const row=at(term,n);expect(row).toBeDefined();expect(defaults.find(d=>d.entryId===row!.entryId)?.sense.id).toBe(raw(term,n).id);}
});
