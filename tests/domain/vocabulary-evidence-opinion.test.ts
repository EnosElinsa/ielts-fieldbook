import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
// Fixed counts describe the original batch; later scope variants have separate source and route checks.
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
const terms=['evidence','proof','argument','opinion'];
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const raw=(term:string,at:number)=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses[at];
const records=ledger.records.filter(r=>terms.includes(r.term));
const rows=corrections.filter(r=>!('contentVariant' in r)&&records.some(l=>l.entryId===r.entryId&&l.senseId===r.senseId));
const at=(term:string,n:number)=>rows.find(r=>r.senseId===raw(term,n).id);

test('all 48 preserved identities and one omitted logical child have explicit reviews',()=>{
 expect(records).toHaveLength(49);expect(rows).toHaveLength(49);
 for(const term of terms){const original=JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8'));for(const s of original.senses)expect(rows.some(r=>r.senseId===s.id)).toBe(true);}
 const restored=sources.filter(s=>terms.includes(s.term));expect(restored).toHaveLength(1);expect(restored[0].parentSenseId).toBe(raw('argument',0).id);expect(restored[0].sense.definition).not.toMatch(/#(?:Adjective|Verb)/);
 expect(at('argument',0)).not.toHaveProperty('meaningGroup');
});
test('evidence supports a claim while legal admissibility does not establish guilt',()=>{
 expect(at('evidence',0)?.distinctionTask?.answer).toMatch(/strength still needs assessment/);
 expect(at('evidence',0)?.distinctions.join(' ')).toMatch(/uncountable/);
 expect(at('evidence',1)?.distinctionTask?.answer).toMatch(/may be considered/);
 expect(at('evidence',1)?.distinctions.join(' ')).toMatch(/does not itself establish guilt/);
});
test('witness evidence stays unclassified and the strict formulation does not redefine ordinary evidence',()=>{
 expect(at('evidence',2)?.exampleKind).toBe('reading-note');expect(at('evidence',2)).not.toHaveProperty('learningPriority');
 expect(at('evidence',2)?.distinctions.join(' ')).toMatch(/does not explicitly label.*obsolete/);
 expect(at('evidence',3)?.distinctions.join(' ')).toMatch(/must not make every instance of evidence conclusive/);
});
test('US proof, ABV, and historical British proof do not share one conversion',()=>{
 expect(at('proof',10)?.distinctionTask?.answer).toBe('40% alcohol by volume');
 expect(at('proof',10)?.distinctions.join(' ')).toMatch(/57.1% ABV/);
 expect(at('proof',13)?.example).toContain('80-proof');expect(at('proof',13)?.example).not.toContain('60% proof');
});
test('mathematical proof supplies a general domain while an inverse operation checks one result',()=>{
 expect(at('proof',7)?.example).toMatch(/any integer n/);expect(at('proof',7)?.distinctions.join(' ')).toMatch(/One example.*alone would not prove/);
 expect(at('proof',8)?.distinctionTask?.answer).toBe('this division result');
});
test('printing proof and proof coins do not promise correctness or financial value',()=>{
 expect(at('proof',5)?.distinctionTask?.answer).toMatch(/may contain errors/);
 expect(at('proof',6)?.distinctions.join(' ')).toMatch(/does not inherently.*increase in financial value/);
 expect(at('proof',14)?.distinctionTask?.answer).toMatch(/check the text/);
});
test('baking keeps rising shaped dough separate from checking yeast activity',()=>{
 expect(at('proof',17)?.distinctionTask?.answer).toBe('the yeast-containing dough to rise');
 expect(at('proof',18)?.distinctionTask?.answer).toBe('test the yeast’s activity');
 expect(at('proof',17)?.example).toMatch(/proof the shaped rolls/);
});
test('logical argument distinguishes validity from true premises and restores only the missing child',()=>{
 const child=sources.find(s=>s.term==='argument');expect(child).toBeDefined();const row=rows.find(r=>r.senseId===child?.sense.id);
 expect(row?.distinctionTask?.answer).toMatch(/conclusion follows logically/);expect(row?.distinctions.join(' ')).toMatch(/soundness also requires true premises/);
 expect(at('argument',0)?.distinctionTask?.answer).toBe('one supporting reason');expect(at('argument',3)?.distinctionTask?.answer).toBe('disagreed verbally');
});
test('technical arguments distinguish an input, phase angle, syntactic role and formal parameter',()=>{
 expect(at('argument',6)?.distinctionTask?.answer).toBe('3 and 9 respectively');
 expect(at('argument',7)?.distinctionTask?.answer).toMatch(/angle.*modulus/);expect(at('argument',7)?.distinctions.join(' ')).toMatch(/Zero has no defined argument/);
 expect(at('argument',9)?.distinctionTask?.answer).toBe('3, while x is a formal parameter');expect(at('argument',5)?.distinctionTask?.answer).toMatch(/time adjunct/);
});
test('an opinion may draw on evidence and an Advocate General does not decide the case',()=>{
 expect(at('opinion',0)?.distinctionTask?.answer).toMatch(/draw on evidence/);expect(at('opinion',4)?.distinctionTask?.answer).toMatch(/professional assessment/);
 expect(at('opinion',5)?.distinctionTask?.answer).toMatch(/does not bind the Court/);expect(at('opinion',5)?.distinctions.join(' ')).toMatch(/Not every case requires/);
});
test('reading notes, priorities and diagrams retain their separate meaning identities',()=>{
 expect(rows.filter(r=>r.exampleKind==='reading-note')).toHaveLength(18);expect(rows.filter(r=>r.distinctionTask)).toHaveLength(31);
 expect(diagrams.filter(d=>terms.includes(d.term))).toHaveLength(22);expect(at('proof',19)?.learningPriority).toBe('proper-name');expect(at('opinion',6)?.learningPriority).toBe('historical');
 for(const [term,n]of[['evidence',0],['proof',1],['argument',0],['opinion',0]] as const){const row=at(term,n);expect(defaults.find(d=>d.entryId===row?.entryId)?.sense.id).toBe(row?.senseId);}
});
