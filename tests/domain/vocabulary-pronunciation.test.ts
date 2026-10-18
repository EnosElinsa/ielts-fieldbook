import { readFileSync } from 'node:fs';
import { afterEach, expect, test } from 'vitest';
import { addVocabularyItem, getVocabularyReviewQueue } from '../../src/domain/vocabulary';
import { createVocabularySession, buildVocabularySessionCommit, updateVocabularySessionAnswer } from '../../src/domain/vocabulary/session';
import { resolveVocabularyRetry } from '../../src/domain/vocabulary/retry';
import { readVocabularyDraft, writeVocabularyDraft } from '../../src/storage/vocabularyDrafts';
import { freezeVocabularyPronunciation, getVocabularyPronunciation, isFrozenVocabularyPronunciation } from '../../src/domain/vocabulary/sensePronunciation';
import registry from '../../src/domain/vocabulary/sensePronunciations.json';
import type { VocabularyEntry, VocabularySense, VocabularyStore } from '../../src/domain/vocabulary/types';

const corrections=JSON.parse(readFileSync('src/domain/vocabulary/readinessCorrections.json','utf8'));
const catalog=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
function fixture(id='kaikki:5386f9871d2cf75669') {
  const row=corrections.find((r:any)=>r.senseId===id);
  const sense:VocabularySense={...row.originalSense,definition:row.definition,example:row.example,pos:row.pos||row.originalSense.pos};
  const raw=catalog.entries.find((e:VocabularyEntry)=>e.id===row.entryId);
  const store={} as VocabularyStore;
  const entry=addVocabularyItem(store,{...structuredClone(raw),senses:[sense]}).item!;
  return {store,entry,sense:entry.senses.find(s=>s.id===id)!};
}
afterEach(()=>localStorage.clear());

test.each([
  ['kaikki:5386f9871d2cf75669','record-first'],['kaikki:a81bc2a2a960622df9','record-second'],
  ['kaikki:639d878dc02160a47c','present-first'],['kaikki:40e41329b227d2f52a','present-second'],
  ['kaikki:6c4af84b649b2187ca','lead-metal'],['kaikki:7f8be4cf71977d7495','lead-metal'],
  ['kaikki:5c5155babfffec48aa','lead-metal'],['wiktionary:restored:07336d59cf1c0fc771','lead-guide'],
  ['kaikki:164479ea57dc2a8e1f','lead-guide'],['kaikki:6de32a49723c010e1e','object-first'],
  ['kaikki:32ef4998a39ea98f2c','object-second'],['kaikki:aba05dffc1740caa0c','subject-first'],
  ['kaikki:2c642b68badbf91db9','subject-second'],['kaikki:743cc6ac48226bdb77','minute-time'],
  ['kaikki:d45c6a59c287883588','minute-time'],['kaikki:e9990863a191afdc6c','minute-small'],
])('binds %s to the reviewed reading %s',(id,group)=>{
  const {entry,sense}=fixture(id);
  const result=getVocabularyPronunciation(entry,sense);
  expect(result.required).toBe(true);expect(result.group?.id).toBe(group);
  expect(result.recordings.some(r=>r.accent==='us')).toBe(true);
});

test('every exact binding retains current public identity and revision-bound provenance',()=>{
  expect(registry.groups).toHaveLength(12);expect(registry.recordings).toHaveLength(15);
  expect(new Set(registry.bindings.map(r=>r.id)).size).toBe(registry.bindings.length);
  expect(new Set(registry.groups.map(r=>r.id)).size).toBe(registry.groups.length);
  expect(new Set(registry.recordings.map(r=>r.id)).size).toBe(registry.recordings.length);
  for(const binding of registry.bindings){
    const row=corrections.find((r:any)=>r.entryId===binding.entryId&&r.senseId===binding.senseId);
    expect(row, binding.id).toBeDefined();
    expect(binding.definition).toBe(row.definition);expect(binding.pos).toBe(row.pos||row.originalSense.pos);
    expect(row.referenceOnly||row.meaningGroup||row.usageReference||binding.pos==='name').toBeFalsy();
    const group=registry.groups.find(g=>g.id===binding.groupId)!;
    expect(group.sourceUrl).toBe(row.referenceUrl);
    const {entry,sense}=fixture(binding.senseId);
    expect(getVocabularyPronunciation(entry,sense).binding?.id).toBe(binding.id);
    for(const recordingId of Object.values(group.recordings)){
      const audio=registry.recordings.find(r=>r.id===recordingId)!;
      expect(audio.fileSha1).toMatch(/^[0-9a-f]{40}$/);
      expect(audio.fileRevision).toBeGreaterThan(0);
      expect(audio.author).toBeTruthy();expect(audio.license).not.toBe('Unknown');
      expect(audio.sourceUrl).toContain('oldid=');
      expect(group.audioMarkup.join('\n').toLowerCase()).toContain(audio.title.toLowerCase());
      expect(audio.url).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
    }
  }
});

test.each(['definition','pos','id','source','entryId','term'])('an edited or mismatched %s cannot inherit a public binding',field=>{
  const {entry,sense}=fixture();const altered=structuredClone(sense),word=structuredClone(entry);
  if(field==='entryId')word.id='personal-record';else if(field==='term')word.term='Record';
  else if(field==='source')altered.source='Personal note';else altered[field as 'definition'|'pos'|'id']='changed';
  expect(getVocabularyPronunciation(word,altered).binding).toBeUndefined();
  expect(getVocabularyPronunciation(word,altered).required).toBe(true);
});

test.each(['kaikki:da6271c9e9c95cc4a8','kaikki:9431fac011bd6a7ee1','kaikki:72af5981da1184f8ca','kaikki:efa06ce0d178111a40','kaikki:4b00c069ab8ff3ecc9'])('names and source references have no inherited recording: %s',id=>{
  const {entry,sense}=fixture(id);expect(getVocabularyPronunciation(entry,sense).binding).toBeUndefined();
});
test.each(['wind','bow'])('unreviewed homograph %s exposes a missing meaning match',term=>{
  const entry=catalog.entries.find((e:VocabularyEntry)=>e.term===term);
  expect(getVocabularyPronunciation(entry,entry.senses[0])).toMatchObject({required:true,recordings:[]});
});
test('ordinary entries retain entry-level audio; legacy history makes no new meaning claim',()=>{
  const {entry,sense}=fixture();expect(getVocabularyPronunciation(entry,sense,'legacy')).toMatchObject({required:false,legacy:true,recordings:[]});
  expect(getVocabularyPronunciation({...entry,term:'significant'},sense).required).toBe(false);
});

test('new dictation freezes its reading through draft, submit and retry despite a changed current sense',()=>{
  const {store,entry,sense}=fixture();const cards=getVocabularyReviewQueue(store,{entryId:entry.id,senseId:sense.id,mode:'dictation',dueOnly:false});
  let session=createVocabularySession(cards,'dictation',{accent:'us'});
  expect(session.cardSnapshots![0].pronunciation).toEqual(freezeVocabularyPronunciation(entry,sense));
  expect(session.cardSnapshots![0].pronunciation).toHaveProperty('bindingId');
  expect(cards[0].pronunciation).toBeUndefined();
  expect(writeVocabularyDraft('audio-review',session)).toBe(true);
  expect(readVocabularyDraft('audio-review')?.cardSnapshots?.[0].pronunciation).toEqual(session.cardSnapshots![0].pronunciation);
  session=updateVocabularySessionAnswer(session,cards[0].id,'recod');
  const committed=buildVocabularySessionCommit(store,session,cards);
  const record=committed.sessionRecord,before=structuredClone(record);
  const current=committed.state.vocabulary.find(e=>e.id===entry.id)!;
  current.senses.find(s=>s.id===sense.id)!.definition='A personal replacement.';
  const retry=resolveVocabularyRetry(committed.state,record);
  expect(retry.unavailable).toEqual([]);
  const next=createVocabularySession(retry.cards,'dictation',record.preferences,{}, {kind:'retry'});
  expect(next.cardSnapshots![0].pronunciation).toEqual(record.cardSnapshots![0].pronunciation);
  const frozen=next.cardSnapshots![0];
  expect(getVocabularyPronunciation(frozen.entry,frozen.entry.senses.find(s=>s.id===frozen.senseId),frozen.pronunciation).group?.id).toBe('record-first');
  expect(record).toEqual(before);
});

test('a frozen missing match stays missing and malformed audio references are rejected',()=>{
  const {entry,sense}=fixture();const missing={version:1 as const,bindingId:null};
  expect(getVocabularyPronunciation(entry,sense,missing).recordings).toEqual([]);
  expect(isFrozenVocabularyPronunciation(missing,entry,sense)).toBe(true);
  expect(isFrozenVocabularyPronunciation({version:1,bindingId:'made-up',url:'javascript:alert(1)'},entry,sense)).toBe(false);
  const other=freezeVocabularyPronunciation(...(()=>{const v=fixture('kaikki:a81bc2a2a960622df9');return [v.entry,v.sense] as const;})());
  expect(isFrozenVocabularyPronunciation(other,entry,sense)).toBe(false);
  const {store}=fixture();const cards=getVocabularyReviewQueue(store,{mode:'dictation',dueOnly:false});
  const session=createVocabularySession(cards,'dictation',{});session.cardSnapshots![0].pronunciation={version:1,bindingId:'made-up'};
  expect(writeVocabularyDraft('invalid-audio',session)).toBe(false);
  expect(()=>buildVocabularySessionCommit(store,session,cards)).toThrow('Invalid frozen pronunciation.');
  expect(store.vocabularyReviews).toEqual([]);
});

test.each([true,false])('legacy retry retains unbound audio, with frozen content: %s',snapshots=>{
  const {store}=fixture();const cards=getVocabularyReviewQueue(store,{mode:'dictation',dueOnly:false});
  const session=updateVocabularySessionAnswer(createVocabularySession(cards,'dictation',{}),cards[0].id,'recod');
  if(snapshots)delete session.cardSnapshots![0].pronunciation;else{delete session.cardSnapshots;delete session.contentVersion;}
  const committed=buildVocabularySessionCommit(store,session,cards);
  const retry=resolveVocabularyRetry(committed.state,committed.sessionRecord);
  expect(retry.unavailable).toEqual([]);expect(retry.cards[0].pronunciation).toBe('legacy');
  expect(createVocabularySession(retry.cards,'dictation',{}).cardSnapshots![0].pronunciation).toBe('legacy');
});
test('a legacy record cannot inherit a matching current active card recording during retry',()=>{
  const {store}=fixture();const cards=getVocabularyReviewQueue(store,{mode:'dictation',dueOnly:false});
  const session=updateVocabularySessionAnswer(createVocabularySession(cards,'dictation',{}),cards[0].id,'recod');
  const active=structuredClone(session.cardSnapshots!);
  delete session.cardSnapshots;delete session.contentVersion;
  const committed=buildVocabularySessionCommit(store,session,cards);
  expect(active[0].pronunciation).toHaveProperty('bindingId');
  const retry=resolveVocabularyRetry(committed.state,committed.sessionRecord,active);
  expect(retry.unavailable).toEqual([]);expect(retry.cards[0].pronunciation).toBe('legacy');
});
