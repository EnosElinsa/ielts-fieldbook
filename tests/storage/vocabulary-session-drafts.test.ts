import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, test, vi } from 'vitest';
import { createVocabularyDraftStore } from '../../src/storage/vocabularySessionDrafts';
import { createVocabularySession, updateVocabularySessionAnswer } from '../../src/domain/vocabulary/session';
import { writeVocabularyDraft, readVocabularyDraft } from '../../src/storage/vocabularyDrafts';
import type { ReviewCard } from '../../src/domain/vocabulary/types';
const card={id:'entry:sense:dictation',entryId:'entry',senseId:'sense',mode:'dictation',entry:{term:'answer'}} as ReviewCard;
const session=()=>createVocabularySession([card],'dictation',{});
beforeEach(()=>{localStorage.clear();vi.restoreAllMocks();});
test('keeps multiple sessions per account and removes only the selected draft',async()=>{
 const store=createVocabularyDraftStore(new IDBFactory());const first=session(),second=session();second.planId='plan';
 const a=await store.save('alice',first),b=await store.save('alice',second);
 expect((await store.list('alice')).map(row=>row.session.id).sort()).toEqual([first.id,second.id].sort());
 expect(await store.list('bob')).toEqual([]);
 await store.remove('alice',first.id,a.revision);expect((await store.list('alice')).map(row=>row.session.id)).toEqual([second.id]);expect(b.revision).toBe(1);
});
test('detects stale cross-tab writes and deletes atomically without overwriting answers',async()=>{
 const factory=new IDBFactory(),one=createVocabularyDraftStore(factory),two=createVocabularyDraftStore(factory),draft=session();
 const original=await one.save('alice',draft);const stale=(await two.list('alice'))[0];
 const edited=updateVocabularySessionAnswer(draft,card.id,'first tab');await one.save('alice',edited,original.revision);
 await expect(two.save('alice',updateVocabularySessionAnswer(draft,card.id,'second tab'),stale.revision)).rejects.toThrow(/another tab/);
 await expect(two.remove('alice',draft.id,stale.revision)).rejects.toThrow(/another tab/);
 expect((await two.list('alice'))[0].session.answers[card.id].response).toBe('first tab');
});
test('migrates the legacy draft only after a verified IndexedDB write and is idempotent',async()=>{
 const store=createVocabularyDraftStore(new IDBFactory()),draft=session();writeVocabularyDraft('alice',draft);
 await store.migrate('alice');expect(readVocabularyDraft('alice')).toBeNull();expect((await store.list('alice'))[0].session.id).toBe(draft.id);
 await store.migrate('alice');expect(await store.list('alice')).toHaveLength(1);
});
test('a failed migration retains the legacy draft and rejects malformed session writes',async()=>{
 const draft=session();writeVocabularyDraft('alice',draft);const blocked={open(){throw new Error('Storage blocked');}} as unknown as IDBFactory;
 await expect(createVocabularyDraftStore(blocked).migrate('alice')).rejects.toThrow();expect(readVocabularyDraft('alice')?.id).toBe(draft.id);
 await expect(createVocabularyDraftStore(new IDBFactory()).save('alice',{...draft,status:'submitted'})).rejects.toThrow(/Invalid/);
});
