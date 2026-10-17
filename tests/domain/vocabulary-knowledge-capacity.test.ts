import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
const terms=['knowledge','skill','ability','capacity'];
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const raw=(term:string,n:number)=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses[n];
const records=ledger.records.filter(r=>terms.includes(r.term));
const rows=corrections.filter(r=>records.some(l=>l.entryId===r.entryId&&l.senseId===r.senseId));
const at=(term:string,n:number)=>rows.find(r=>r.senseId===raw(term,n).id);
const children=sources.filter(s=>terms.includes(s.term));
const child=(pattern:RegExp)=>rows.find(r=>children.some(c=>c.sense.id===r.senseId&&pattern.test(c.sense.definition)));

test('all 42 preserved records and four capacity children have independent source-bound reviews',()=>{
 expect(records).toHaveLength(46);expect(rows).toHaveLength(46);expect(children).toHaveLength(4);
 for(const term of terms){const original=JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8'));for(const s of original.senses)expect(rows.some(r=>r.senseId===s.id)).toBe(true);}
 for(const s of children){expect(s.term).toBe('capacity');expect(rows.some(r=>r.senseId===s.sense.id)).toBe(true);expect(rows.find(r=>r.senseId===s.parentSenseId)).not.toHaveProperty('meaningGroup');}
});
test('knowledge is normally uncountable but its independently preserved countable use is not declared impossible or obsolete',()=>{
 expect(at('knowledge',0)?.usage).toMatch(/uncountable/);expect(at('knowledge',8)?.exampleKind).toBe('reading-note');
 expect(at('knowledge',8)?.distinctions.join(' ')).toMatch(/not labelled obsolete/);expect(at('knowledge',8)).not.toHaveProperty('learningPriority');
 expect(at('knowledge',7)?.distinctionTask?.answer).toMatch(/body of information/);
});
test('justified true belief is a debated philosophical analysis, and the intimacy sense retains archaic or legal scope',()=>{
 expect(at('knowledge',4)?.definition).toMatch(/traditional.*analysis/);expect(at('knowledge',4)?.distinctions.join(' ')).toMatch(/sufficiency.*disputed/);
 expect(at('knowledge',4)?.exampleKind).toBe('reading-note');expect(at('knowledge',5)?.usage).toMatch(/Archaic or legal/);expect(at('knowledge',5)?.learningPriority).toBe('specialist');
});
test('route familiarity and the capitalised Knowledge course stay separate, with 320 scoped to All London',()=>{
 expect(at('knowledge',11)?.distinctionTask?.answer).toMatch(/familiarity with routes/);expect(at('knowledge',13)?.originalSense.sourceUrl).toContain('/Knowledge');
 expect(at('knowledge',13)?.distinctions.join(' ')).toMatch(/All London.*320/);expect(at('knowledge',13)?.distinctions.join(' ')).toMatch(/suburban sectors/);
 expect(at('knowledge',13)?.learningPriority).toBe('proper-name');
});
test('skill is usually acquired rather than an absolute learned versus innate division, while its AI meaning is lexical content',()=>{
 expect(at('skill',0)?.definition).toMatch(/usually acquired or learned/);expect(at('skill',0)?.distinctions.join(' ')).toMatch(/not an absolute/);
 expect(at('skill',1)?.distinctionTask?.answer).toMatch(/reusable task configuration/);expect(at('skill',1)?.distinctions.join(' ')).toMatch(/not an instruction/);
 expect(at('skill',12)?.distinctionTask?.answer).toMatch(/spending acquired game points/);
});
test('unlabelled and regional skill verbs do not inherit an unsupported historical priority',()=>{
 for(const n of[6,7,8,9,10]){expect(at('skill',n)?.exampleKind).toBe('reading-note');expect(at('skill',n)).not.toHaveProperty('learningPriority');}
 expect(at('skill',8)?.usage).toMatch(/Scotland and northern England/);expect(at('skill',11)?.learningPriority).toBe('historical');
 expect(at('skill',5)?.usage).toMatch(/UK slang/);expect(at('skill',5)).not.toHaveProperty('learningPriority');
});
test('ability keeps dialectal physical power separate from legal wherewithal and ordinary capability',()=>{
 expect(at('ability',3)?.usage).toMatch(/Scottish dialects/);expect(at('ability',3)).not.toHaveProperty('learningPriority');
 expect(at('ability',2)?.distinctionTask?.answer).toMatch(/legal wherewithal/);expect(at('ability',1)?.distinctions.join(' ')).toMatch(/does not establish.*actually/);
 expect(at('ability',5)?.distinctions.join(' ')).toMatch(/not an intelligence score/);expect(at('ability',6)?.usage).toMatch(/Countable/);
});
test('holding capacity separates potential, measured volume and maximum amount from actual contents',()=>{
 expect(at('capacity',0)?.distinctionTask?.answer).toMatch(/ability to absorb/);expect(at('capacity',1)?.example).toMatch(/2 litres/);
 const limit=child(/maximum amount/i);expect(limit?.example).toMatch(/0.5 litres/);expect(limit?.distinctionTask?.answer).toBe('2 litres');
 expect(limit?.distinctions.join(' ')).toMatch(/actual contents/);
});
test('production capacity requires a time unit and a rating does not establish current output',()=>{
 expect(at('capacity',3)?.example).toMatch(/per day/);const output=child(/machine or in a facility/);
 expect(output?.example).toMatch(/per hour/);expect(output?.distinctionTask?.answer).toMatch(/maximum.*not actual/);
 expect(output?.distinctions.join(' ')).toMatch(/conditions/);
});
test('growth, mental learning, role and legal authority retain independent meanings without guarantees',()=>{
 expect(at('capacity',4)?.distinctions.join(' ')).toMatch(/does not establish.*occurred/);expect(at('capacity',5)?.distinctionTask?.answer).toMatch(/role/);
 expect(child(/Mental ability/)?.distinctions.join(' ')).toMatch(/not an intelligence score/);expect(child(/Legal authority/)?.distinctions.join(' ')).toMatch(/does not grant.*every/);
});
test('electrical capacity is capacitance in farads rather than energy, and a capacity crowd uses the adjective',()=>{
 expect(at('capacity',6)?.distinctionTask?.answer).toMatch(/capacitance.*farads/);expect(at('capacity',6)?.distinctions.join(' ')).toMatch(/energy.*joules/);
 expect(at('capacity',7)?.originalSense.pos).toBe('adj');expect(at('capacity',7)?.distinctionTask?.answer).toMatch(/all available seats/);
});
test('the batch has exact defaults, 20 reading notes, 26 exercises and 25 diagrams',()=>{
 expect(rows.filter(r=>r.exampleKind==='reading-note')).toHaveLength(20);expect(rows.filter(r=>r.distinctionTask)).toHaveLength(26);expect(diagrams.filter(d=>terms.includes(d.term))).toHaveLength(25);
 for(const [term,n]of[['knowledge',0],['skill',0],['ability',1],['capacity',0]] as const)expect(defaults.find(d=>d.entryId===at(term,n)?.entryId)?.sense.id).toBe(at(term,n)?.senseId);
});
