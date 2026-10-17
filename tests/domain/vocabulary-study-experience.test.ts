import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';
import ledger from '../../src/domain/vocabulary/dictionaryReviewLedger.json';
import sources from '../../src/domain/vocabulary/dictionarySenseSources.json';
import diagrams from '../../src/domain/vocabulary/senseDiagrams.json';
import defaults from '../../src/domain/vocabulary/readinessDefaults.json';
const terms=['study','research','experiment','experience'];
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const raw=(term:string,at:number)=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses[at];
const records=ledger.records.filter(r=>terms.includes(r.term));
const rows=corrections.filter(r=>records.some(l=>l.entryId===r.entryId&&l.senseId===r.senseId));
const at=(term:string,n:number)=>rows.find(r=>r.senseId===raw(term,n).id);

test('all 39 preserved records are reviewed without duplicating source meanings',()=>{
 expect(records).toHaveLength(39);expect(rows).toHaveLength(39);expect(sources.filter(s=>terms.includes(s.term))).toHaveLength(0);
 for(const term of terms){const original=JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8'));for(const s of original.senses)expect(rows.some(r=>r.senseId===s.id)).toBe(true);}
});
test('study separates revision, courses, intended application and close examination',()=>{
 expect(at('study',0)?.distinctionTask?.answer).toMatch(/previously learned/);expect(at('study',1)?.distinctionTask?.answer).toMatch(/completion still open/);
 expect(at('study',2)?.distinctionTask?.answer).toMatch(/intention to apply/);expect(at('study',3)?.distinctionTask?.answer).toMatch(/examination of the map/);
 expect(at('study',4)?.distinctions.join(' ')).toMatch(/overlap with examination or learning/);
});
test('a study room has no current restriction by gender, while an artwork and etude retain their purposes',()=>{
 expect(at('study',9)?.distinctions.join(' ')).toMatch(/not a modern restriction/);expect(at('study',10)?.distinctions.join(' ')).toMatch(/does not require that every study/);
 expect(at('study',12)?.distinctionTask?.answer).toMatch(/focused practice/);expect(at('study',12)?.distinctions.join(' ')).toMatch(/performed in concert/);
});
test('publication, theatrical learning and chess studies do not acquire unsupported guarantees',()=>{
 expect(at('study',13)?.distinctionTask?.answer).toMatch(/does not establish/);expect(at('study',13)?.distinctions.join(' ')).toMatch(/peer-review/);
 expect(at('study',14)?.distinctionTask?.answer).toBe('quick to learn the part');expect(at('study',15)?.exampleKind).toBe('reading-note');
 expect(at('study',15)?.distinctions.join(' ')).toMatch(/no invented position, legal move sequence/);
});
test('research preserves dialectal countability and dated countable instances without banning them all',()=>{
 expect(at('research',0)?.usage).toMatch(/some dialects/);expect(at('research',0)?.distinctions.join(' ')).toMatch(/normally uncountable/);
 expect(at('research',1)?.exampleKind).toBe('reading-note');expect(at('research',1)?.learningPriority).toBe('historical');
 expect(at('research',1)?.distinctions.join(' ')).toMatch(/countable research exists in some dialects/);
});
test('research keeps direct and prepositional topics separate and an ad receives rather than conducts research',()=>{
 expect(at('research',2)?.distinctionTask?.answer).toMatch(/direct object/);expect(at('research',3)?.distinctionTask?.answer).toMatch(/prepositional topic/);
 expect(at('research',5)?.distinctionTask?.answer).toMatch(/receive a favourable response/);expect(at('research',5)?.distinctions.join(' ')).toMatch(/does not.*establish later sales/);
 expect(at('research',4)?.definition).toMatch(/search again/);expect(at('research',4)).not.toHaveProperty('learningPriority');
});
test('capitalised Research keeps its place identity and the expanded source template',()=>{
 expect(at('research',6)?.definition).toMatch(/Shire of Nillumbik, Victoria, Australia/);expect(at('research',6)?.learningPriority).toBe('proper-name');
 expect(at('research',6)?.originalSense.sourceUrl).toContain('/Research');
});
test('experiments can challenge a hypothesis while exploratory layouts need not be a controlled scientific design',()=>{
 expect(at('experiment',0)?.distinctionTask?.answer).toMatch(/support or challenge/);expect(at('experiment',0)?.distinctions.join(' ')).toMatch(/without confirming it/);
 expect(at('experiment',5)?.distinctionTask?.answer).toMatch(/try layouts and observe/);expect(at('experiment',5)?.distinctions.join(' ')).toMatch(/need not describe a formal controlled/);
 for(const n of[1,3,4])expect(at('experiment',n)?.exampleKind).toBe('reading-note');
});
test('experience distinguishes countable activities, usually uncountable accumulated events and learned knowledge',()=>{
 expect(at('experience',1)?.distinctionTask?.answer).toBe('one countable activity');expect(at('experience',1)?.distinctions.join(' ')).toMatch(/several experiences/);
 expect(at('experience',2)?.usage).toMatch(/Usually uncountable/);expect(at('experience',2)?.distinctions.join(' ')).toMatch(/does not guarantee expertise/);
 expect(at('experience',3)?.distinctionTask?.answer).toMatch(/knowledge gained/);expect(at('experience',0)?.distinctions.join(' ')).toMatch(/infallible/);
});
test('customer and game experience keep their separate contexts and may experience does not imply enjoy',()=>{
 expect(at('experience',4)?.distinctionTask?.answer).toMatch(/customer’s participation/);expect(at('experience',5)).not.toHaveProperty('referenceOnly');expect(at('experience',5)?.distinctionTask?.answer).toMatch(/game experience points/);
 expect(at('experience',5)?.distinctions.join(' ')).toMatch(/depends on the game’s rules/);expect(at('experience',7)?.distinctionTask?.answer).toMatch(/delays are possible/);
});
test('the batch has 11 reading notes, 28 exercises and 20 exact diagrams with explicit learning defaults',()=>{
 expect(rows.filter(r=>r.exampleKind==='reading-note')).toHaveLength(11);expect(rows.filter(r=>r.distinctionTask)).toHaveLength(28);expect(diagrams.filter(d=>terms.includes(d.term))).toHaveLength(20);
 for(const [term,n]of[['study',1],['research',0],['experiment',0],['experience',3]] as const){const row=at(term,n);expect(defaults.find(d=>d.entryId===row?.entryId)?.sense.id).toBe(row?.senseId);}
});
