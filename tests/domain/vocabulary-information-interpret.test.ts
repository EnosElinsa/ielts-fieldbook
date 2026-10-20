import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
// Fixed counts describe the original batch; later scope variants have separate source and route checks.
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
const terms=['information','data','analysis','interpret'];
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const raw=(term:string,n:number)=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses[n];
const records=ledger.records.filter(r=>terms.includes(r.term));
const rows=corrections.filter(r=>!('contentVariant' in r)&&records.some(l=>l.entryId===r.entryId&&l.senseId===r.senseId));
const at=(term:string,n:number)=>rows.find(r=>r.senseId===raw(term,n).id);

test('all 30 preserved meanings retain their source identity without duplicate restorations',()=>{
 expect(records).toHaveLength(30);expect(rows).toHaveLength(30);expect(sources.filter(s=>terms.includes(s.term))).toHaveLength(0);
 for(const term of terms){const original=JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8'));for(const s of original.senses)expect(rows.some(r=>r.senseId===s.id)).toBe(true);}
});
test('ordinary uncountable information remains separate from countable legal accusations',()=>{
 expect(at('information',1)?.usage).toMatch(/uncountable/);expect(at('information',1)?.distinctionTask?.answer).toMatch(/piece of information/);
 expect(at('information',3)?.usage).toMatch(/countable/);expect(at('information',3)?.distinctionTask?.answer).toMatch(/formal accusation/);
});
test('legal procedure is jurisdiction scoped and accusation is not guilt',()=>{
 expect(at('information',3)?.distinctions.join(' ')).toMatch(/depends on jurisdiction and offence/);
 expect(at('information',3)?.distinctions.join(' ')).toMatch(/does not establish guilt/);
 expect(at('information',4)?.learningPriority).toBe('historical');
});
test('now-rare education and forming senses preserve the import-label difference without becoming obsolete',()=>{
 for(const n of [5,6]){expect(at('information',n)?.usage).toMatch(/Now rare/);expect(at('information',n)?.originalSense.register).toContain('archaic');expect(at('information',n)).not.toHaveProperty('learningPriority');}
});
test('information theory permits fractional bit amounts rather than a universal whole-bit minimum',()=>{
 expect(-Math.log2(3/4)).toBeCloseTo(.4150375,6);
 expect(at('information',10)?.example).toContain('0.415 bits');expect(at('information',10)?.distinctionTask?.answer).toContain('fractional');
 expect(at('information',10)?.originalSense.definition).toContain('smallest possible unit');
 expect(at('information',10)?.distinctions.join(' ')).toMatch(/does not imply.*at least one whole bit/);
});
test('a representation convention does not establish a physical valve state',()=>{
 expect(at('information',7)?.distinctionTask?.answer).toMatch(/convention assigns/);
 expect(at('information',7)?.distinctions.join(' ')).toMatch(/does not independently establish.*actual physical state/);
});
test('organised output and ordered sequences do not automatically establish accuracy or decoding',()=>{
 expect(at('information',11)?.distinctions.join(' ')).toMatch(/does not itself establish.*accuracy/);
 expect(at('information',12)?.distinctionTask?.answer).toMatch(/not necessarily already decoded/);
});
test('religious attribution and telephone directory service retain their distinct meanings',()=>{
 expect(at('information',8)?.exampleKind).toBe('reading-note');expect(at('information',8)?.usage).toContain('Christianity');
 expect(at('information',9)?.distinctionTask?.answer).toContain('directory-enquiries');
});
test('data as plural datum is a usable grammatical record without banning collective singular agreement',()=>{
 expect(at('data',0)?.example).toBe('These data were recorded separately.');expect(at('data',0)).not.toHaveProperty('referenceOnly');
 expect(at('data',0)?.distinctions.join(' ')).toMatch(/singular agreement in many contexts/);
});
test('recorded data can contain assumptions and computer representations can be nonnumeric',()=>{
 expect(at('data',2)?.example).toContain('assumed values');expect(at('data',2)?.distinctionTask?.answer).toMatch(/inputs to the reasoning/);
 expect(at('data',1)?.distinctionTask?.answer).toContain('other than numbers');
});
test('mobile data has readable text and switching connection does not delete stored information',()=>{
 expect(at('data',3)?.definition).toContain('rather than Wi-Fi');expect(at('data',3)?.definition).not.toContain('�');
 expect(at('data',3)?.distinctionTask?.answer).toMatch(/cellular data to Wi-Fi/);
});
test('capitalised Data preserves its barangay identity and separate source page',()=>{
 expect(at('data',4)?.definition).toContain('Sabangan, Mountain Province, Philippines');expect(at('data',4)?.originalSense.sourceUrl).toContain('/Data');
 expect(at('data',4)?.learningPriority).toBe('proper-name');
});
test('analysis process and resulting account stay separate and mathematics exceeds elementary calculus',()=>{
 expect(at('analysis',0)?.distinctionTask?.answer).toMatch(/conceptual aspects/);expect(at('analysis',1)?.distinctionTask?.answer).toMatch(/resulting analytical account/);
 expect(at('analysis',2)?.distinctionTask?.answer).toMatch(/broader than elementary/);
});
test('the deductive example states both premises and rejects the converse',()=>{
 expect(at('analysis',3)?.distinctionTask?.answer).toBe('x is B');expect(at('analysis',3)?.distinctionTask?.options).toContain('all B must therefore be A');
 expect(at('analysis',3)?.distinctions.join(' ')).toContain('all A are B and x is A');
});
test('chemical analysis does not require literal decomposition of every sample',()=>{
 expect(at('analysis',4)?.distinctionTask?.answer).toMatch(/do not literally decompose/);
 expect(at('analysis',4)?.originalSense.definition).toContain('breaking down a substance');
});
test('music notes focus on musical relationships and psychoanalysis keeps its separate reading note',()=>{
 expect(at('analysis',5)?.distinctions.join(' ')).toMatch(/performing the work is a separate activity/);
 expect(at('analysis',6)?.exampleKind).toBe('reading-note');expect(at('analysis',6)?.definition).toContain('psychoanalysis');expect(at('analysis',6)?.distinctions.join(' ')).toContain('Other therapies');
});
test('interpreting includes artistic, signed-language and hybrid runtime meanings',()=>{
 expect(at('interpret',2)?.distinctionTask?.answer).toMatch(/artistic portrayals/);expect(at('interpret',3)?.distinctionTask?.answer).toMatch(/conveying meaning/);
 expect(at('interpret',3)?.distinctions.join(' ')).toMatch(/signed as well as spoken/);expect(at('interpret',4)?.distinctionTask?.answer).toMatch(/bytecode or just-in-time/);
});
test('the batch adds six reading notes, 24 exercises and 24 exact diagrams with everyday defaults',()=>{
 expect(rows.filter(r=>r.exampleKind==='reading-note')).toHaveLength(6);expect(rows.filter(r=>r.distinctionTask)).toHaveLength(24);expect(diagrams.filter(d=>terms.includes(d.term))).toHaveLength(24);
 for(const [term,n]of[['information',1],['data',2],['analysis',0],['interpret',1]] as const){const row=at(term,n);expect(row).toBeDefined();expect(defaults.find(d=>d.entryId===row!.entryId)?.sense.id).toBe(row!.senseId);}
});
