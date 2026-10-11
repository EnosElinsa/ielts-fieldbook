import { afterEach, beforeEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { resolveVocabularyLearningContext } from '../../src/domain/vocabulary/context';
import { buildUnitPracticeQueue } from '../../src/domain/vocabulary/selection';
import { learningTask } from '../../src/domain/vocabulary/content';
import { createVocabularySession, buildVocabularySessionCommit, updateVocabularySessionAnswer } from '../../src/domain/vocabulary/session';
import { getVocabularyReviewQueue } from '../../src/domain/vocabulary';
import type { VocabularyEntry } from '../../src/domain/vocabulary/types';
const original={...VOCABULARY_CATALOG};
const released=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
beforeEach(()=>Object.assign(VOCABULARY_CATALOG,released));
afterEach(()=>Object.assign(VOCABULARY_CATALOG,original));

test('all public words have a complete core definition and usable example',()=>{
 const failures:string[]=[];
 for (const entry of released.entries as VocabularyEntry[]) {
  const sense=resolveVocabularyLearningContext(entry).sense;
  if (!sense?.definition.trim() || !sense.example.trim() || /\ufffd|:\s*$/.test(sense.definition)) failures.push(`${entry.term}: ${sense?.definition || 'missing'} / ${sense?.example || 'missing'}`);
 }
 expect(failures).toEqual([]);
});

test('all groups keep membership order and all words with legacy sense-scoped sources',()=>{
 for (const unit of released.units.filter((u:{kind:string})=>u.kind==='group')) {
  const members=released.memberships.filter((m:{bookId:string;unitId:string})=>m.bookId===unit.bookId && m.unitId===unit.id).sort((a:{order:number},b:{order:number})=>a.order-b.order);
  const ids=[...new Set<string>(members.map((m:{entryId:string})=>m.entryId))];
  const vocabulary=(released.entries as VocabularyEntry[]).filter(e=>ids.includes(e.id)).map(e=>({...e,sources:[{type:'wordbook' as const,id:'legacy',bookId:unit.bookId,unitId:unit.id,senseId:e.senses[0].id}]}));
  const queue=buildUnitPracticeQueue({vocabulary},unit.bookId,unit.id,'dictation');
  expect(queue.cards.map(card=>card.entryId),`${unit.bookId}/${unit.id}`).toEqual(ids);
 }
},15_000);

test('new public core content preserves original IDs and learner edits without mutating records',()=>{
 const raw=structuredClone(released.entries.find((e:VocabularyEntry)=>e.term==='short-day')) as VocabularyEntry;
 const before=structuredClone(raw);
 const updated=resolveVocabularyLearningContext(raw);
 expect(updated.sense?.id).toBe(raw.senses[0].id);
 expect(updated.sense?.definition).toContain('flower');
 expect(updated.status).toBe('unreviewed');
 expect(raw).toEqual(before);
 const saved=structuredClone(updated.entry);
 saved.senses[0].definition='My greenhouse note.';
 saved.senses[0].example='My own example.';
 const edited=resolveVocabularyLearningContext(saved);
 expect(edited.sense?.definition).toBe('My greenhouse note.');
 expect(edited.sense?.example).toBe('My own example.');
 expect(learningTask(edited.entry,edited.sense!,'definition')).toBeUndefined();
});
test('an existing pending word receives its core content before the full public catalog loads',()=>{
 const raw=structuredClone(released.entries.find((e:VocabularyEntry)=>e.term==='short-day'));
 Object.assign(VOCABULARY_CATALOG,original);
 expect(resolveVocabularyLearningContext(raw).sense?.definition).toContain('flower');
});
test('same-ID example supplements work before catalog loading while protecting notes',()=>{
 const raw=structuredClone(released.entries.find((e:VocabularyEntry)=>e.term==='hydrosphere'));
 Object.assign(VOCABULARY_CATALOG,original);
 const resolved=resolveVocabularyLearningContext(raw);
 expect(resolved.sense?.example.trim()).toBeTruthy();
 raw.senses[0].definition='My special definition.';
 expect(resolveVocabularyLearningContext(raw).sense?.definition).toBe('My special definition.');
});

test('a learner-edited primary sense remains the standalone default when public curation adds another sense',()=>{
 const raw=structuredClone(released.entries.find((e:VocabularyEntry)=>e.term==='topic')) as VocabularyEntry;
 raw.senses[0].definition='My course-specific topic meaning.';raw.senses[0].example='My course example.';
 const result=resolveVocabularyLearningContext(raw);
 expect(result.sense?.id).toBe(raw.senses[0].id);
 expect(result.sense?.definition).toBe('My course-specific topic meaning.');
});
test('a raw dictionary sense already saved by a learner is supplemented rather than mistaken for a personal edit',()=>{
 const raw=structuredClone(released.entries.find((e:VocabularyEntry)=>e.term==='fresher')) as VocabularyEntry;
 const index=JSON.parse(readFileSync('public/dictionary/index.json','utf8'));
 const dictionary=JSON.parse(readFileSync(`public/dictionary/${index.fresher}`,'utf8'));
 raw.senses.unshift(dictionary.senses.find((s:{id:string})=>s.id==='kaikki:ddce4eb4f3da3f28ee'));
 const result=resolveVocabularyLearningContext(raw);
 expect(result.sense?.id).toBe('kaikki:ddce4eb4f3da3f28ee');
 expect(result.sense?.example.trim()).toBeTruthy();
});
test.each([['topic','subject'],['expire','validity'],['wit','amusing'],['relax','rest'],['draft','writing']])('common default for %s uses its real stable dictionary sense', (term,meaning)=>{
 const raw=released.entries.find((e:VocabularyEntry)=>e.term===term);
 const resolved=resolveVocabularyLearningContext(raw);
 expect(resolved.sense?.id).toMatch(/^kaikki:/);
 expect(resolved.sense?.definition.toLowerCase()).toContain(meaning);
 expect(resolved.entry.senses).toContainEqual(raw.senses[0]);
});

test.each(['Adelaide','Boston','Victoria','widow','introverted','lemon tree'])('new editorial default for %s can submit with an existing legacy learner entry',term=>{
 const raw=structuredClone(released.entries.find((e:VocabularyEntry)=>e.term===term));
 const card=getVocabularyReviewQueue({vocabulary:[raw]},{mode:'dictation',dueOnly:false})[0];
 expect(card.senseId).toMatch(/^editorial:/);
 const state={vocabulary:[raw],vocabularyStates:[],vocabularyEvidence:[],vocabularyReviews:[],vocabularyActivities:[],wordbookProgress:[],wordbookEnrollments:[],vocabularyImportBatches:[],vocabularySessions:[]};
 const draft=updateVocabularySessionAnswer(createVocabularySession([card],'dictation',{}),card.id,term);
 const commit=buildVocabularySessionCommit(state,draft,[card]);
 expect(commit.results[0].result).toBe('success');
 expect(commit.state.vocabulary[0].senses.some(s=>s.id===card.senseId)).toBe(true);
 expect(commit.state.vocabulary[0].senses.some(s=>s.id===raw.senses[0].id)).toBe(true);
});
