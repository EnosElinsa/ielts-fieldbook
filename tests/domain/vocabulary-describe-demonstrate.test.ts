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
import {resolveVocabularyLearningContext} from '../../src/domain/vocabulary/context';
import contextOverlay from '../../src/domain/vocabulary/contextSenseOverlay.json';

const terms=['describe','explain','illustrate','demonstrate'];
const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
const raw=(term:string,n:number):VocabularySense=>JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8')).senses[n];
const records=ledger.records.filter(r=>terms.includes(r.term));
const rows=corrections.filter(r=>records.some(l=>l.entryId===r.entryId&&l.senseId===r.senseId));
const at=(term:string,n:number)=>rows.find(r=>r.senseId===raw(term,n).id);

test('all eighteen original meanings have independent reviews and no duplicate restored children',()=>{
 expect(records).toHaveLength(18);expect(rows).toHaveLength(18);
 expect(sources.filter(s=>terms.includes(s.term))).toEqual([]);
 for(const term of terms){const original=JSON.parse(readFileSync('public/dictionary/'+index[term],'utf8'));for(const sense of original.senses){
  const row=rows.find(r=>r.senseId===sense.id);expect(row?.originalSense).toEqual(sense);expect(row?.referenceUrl).toMatch(/oldid=\d+$/);
 }}
});
test('describing features in words is distinct from explaining a cause',()=>{
 expect(at('describe',0)?.example).toBe('Please describe the room in a few sentences.');
 expect(at('describe',0)?.distinctionTask?.answer).toMatch(/what the room is like/);
 expect(at('describe',0)?.distinctions.join(' ')).toContain('describe the room to me');
 expect(at('explain',1)?.distinctionTask?.answer).toMatch(/possible cause.*not.*confirmed/);
});
test('tracing a circle stays separate from a formula generating a geometrical structure',()=>{
 expect(at('describe',1)?.distinctionTask?.answer).toMatch(/trace.*circular path/);
 expect(at('describe',2)?.example).toContain('y = x²');
 expect(at('describe',2)?.distinctionTask?.answer).toContain('(2, 4)');
 expect(at('describe',2)?.learningPriority).toBe('specialist');
});
test('taxonomic description introduces a taxon without asserting one universal naming procedure',()=>{
 expect(at('describe',3)?.distinctionTask?.answer).toMatch(/characteristics.*distinguish/);
 expect(at('describe',3)?.distinctions.join(' ')).toMatch(/naming codes.*different requirements/);
 expect(at('describe',3)?.originalSense.definition).toContain('new taxon');
});
test('explain retains the object-to-recipient pattern and independent intransitive construction',()=>{
 expect(at('explain',0)?.distinctionTask?.answer).toBe('explain the rule to me');
 expect(at('explain',0)?.distinctionTask?.options).toContain('explain me the rule');
 expect(at('explain',4)?.usage).toMatch(/Intransitive/);
 expect(at('explain',4)?.distinctionTask?.answer).toMatch(/no direct object/);
});
test('a proposed causal explanation need not excuse conduct or establish the cause',()=>{
 expect(at('explain',1)?.example).toContain('may explain');
 expect(at('explain',1)?.distinctions.join(' ')).toMatch(/does not.*excuse/);
});
test('illustration by an example does not prove every case and publication art has its own meaning',()=>{
 expect(at('illustrate',0)?.distinctionTask?.answer).toMatch(/one example.*not.*every/);
 expect(at('illustrate',1)?.distinctionTask?.answer).toMatch(/pictures or diagrams/);
 expect(at('illustrate',1)?.distinctions.join(' ')).toContain('decorative');
});
test('demonstrating a tool and demonstrating equation steps remain independent exercises',()=>{
 expect(at('demonstrate',0)?.distinctionTask?.answer).toMatch(/show how.*use/);
 expect(at('demonstrate',1)?.example).toContain('x + 3 = 7');
 expect(at('demonstrate',1)?.distinctionTask?.answer).toBe('subtract 3 from both sides to obtain x = 4');
});
test('public demonstration is intransitive and a display of skill is separate from logical proof',()=>{
 expect(at('demonstrate',2)?.usage).toMatch(/Intransitive/);
 expect(at('demonstrate',2)?.distinctionTask?.answer).toContain('public protest');
 expect(at('demonstrate',3)?.distinctionTask?.answer).toContain('display');
 expect(at('demonstrate',3)?.distinctions.join(' ')).toMatch(/strength.*depends on.*evidence/);
});
test('all five obsolete meanings remain reading notes without new sentence-gap exercises',()=>{
 const obsolete=[['describe',4],['explain',2],['explain',3],['illustrate',2],['illustrate',3]] as const;
 for(const [term,n]of obsolete){
  const row=at(term,n);expect(row?.learningPriority).toBe('historical');expect(row?.usage).toContain('Obsolete');expect(row?.exampleKind).toBe('reading-note');expect(row?.distinctionTask).toBeUndefined();
  const entry=catalog.entries.find((e:VocabularyEntry)=>e.term===term) as VocabularyEntry;
  const selected=supplementVocabularySense(entry.id,raw(term,n),[],hasVocabularySenseEdits);
  expect(isVocabularyReadingNote(entry.id,selected)).toBe(true);expect(learningTask({...entry,senses:[selected]},selected,'cloze')).toBeUndefined();
 }
});
test('ordinary defaults and all thirteen diagrams bind the exact reviewed meaning',()=>{
 expect(rows.filter(r=>r.distinctionTask)).toHaveLength(13);expect(rows.filter(r=>r.exampleKind==='reading-note')).toHaveLength(5);
 const batch=diagrams.filter(d=>terms.includes(d.term));expect(batch).toHaveLength(13);
 for(const term of terms){const row=at(term,0);expect(row).toBeDefined();expect(defaults.find(d=>d.entryId===row!.entryId)?.sense.id).toBe(raw(term,0).id);}
 for(const d of batch){const row=rows.find(r=>r.entryId===d.entryId&&r.senseId===d.senseId);expect(d.definition).toBe(row?.definition);expect(d.pos).toBe('verb');}
});
test('reviewed text upgrades original records but preserves a learner replacement sentence',()=>{
 const entry=catalog.entries.find((e:VocabularyEntry)=>e.term==='explain') as VocabularyEntry,original=raw('explain',0);
 const selected=supplementVocabularySense(entry.id,original,[original],hasVocabularySenseEdits);
 expect(selected.example).toBe('Could you explain the rule to me?');
 const edited={...selected,example:'Our teacher will explain our own classroom rule.'};
 expect(supplementVocabularySense(entry.id,edited,[original],hasVocabularySenseEdits)).toEqual(edited);
});
test('an older common default cannot displace the reviewed default or an explicit updated meaning',()=>{
 const entry=catalog.entries.find((e:VocabularyEntry)=>e.term==='demonstrate') as VocabularyEntry;
 const before=structuredClone(entry);
 expect(resolveVocabularyLearningContext(entry).sense?.id).toBe(raw('demonstrate',0).id);
 const specific=resolveVocabularyLearningContext({...entry,senses:[raw('demonstrate',3)]},{senseId:raw('demonstrate',3).id});
 expect(specific.sense?.example).toBe(at('demonstrate',3)?.example);
 expect(specific.sense?.distinctionTask).toEqual(at('demonstrate',3)?.distinctionTask);
 expect(entry).toEqual(before);
});
test('a saved older public default upgrades while actual personal edits retain their selected meaning',()=>{
 const entry=catalog.entries.find((e:VocabularyEntry)=>e.term==='demonstrate') as VocabularyEntry;
 const legacy=contextOverlay.defaults.find(row=>row.entryId===entry.id)!.sense as VocabularySense;
 const saved={...entry,senses:[structuredClone(legacy)]};
 expect(resolveVocabularyLearningContext(saved).sense?.id).toBe(raw('demonstrate',0).id);
 expect(resolveVocabularyLearningContext(saved,{senseId:legacy.id}).sense?.example).toBe(at('demonstrate',3)?.example);
 const personal={...saved,senses:[{...legacy,example:'I demonstrate this point with our own data.'}]};
 expect(resolveVocabularyLearningContext(personal).sense).toEqual(personal.senses[0]);
 expect(resolveVocabularyLearningContext(personal,{senseId:legacy.id}).sense).toEqual(personal.senses[0]);
});
