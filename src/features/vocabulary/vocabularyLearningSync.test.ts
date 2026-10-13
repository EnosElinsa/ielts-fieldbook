import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { acquireVocabularyLearningSync, vocabularyLearningPendingKey } from './vocabularyLearningSync';

const key = vocabularyLearningPendingKey('one', 'book', 'group');
const learning = (id: string) => ({ viewedEntryIds: ['first'], currentEntryId: id, updatedAt: '2026-10-13T00:00:00Z' });
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

test('same-timestamp revisions serialize and keep a newer draft through an older acknowledgment', async () => {
  let resolve!: (saved: boolean) => void;
  const save = vi.fn().mockImplementationOnce(() => new Promise<boolean>(r => { resolve = r; })).mockResolvedValue(false);
  const sync = acquireVocabularyLearningSync({ owner: 'one', bookId: 'book', unitId: 'group', currentOwner: () => 'one', save });
  const statuses: string[] = [];
  const release = sync.subscribe(snapshot => statuses.push(snapshot.status));
  sync.update(learning('second'));
  await vi.advanceTimersByTimeAsync(800);
  sync.update(learning('third'));
  sync.update(learning('fourth'));
  await vi.advanceTimersByTimeAsync(800);
  expect(save).toHaveBeenCalledTimes(1);
  resolve(true); await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith(learning('fourth'));
  expect(statuses).not.toContain('saved');
  expect(sync.snapshot().status).toBe('failed');
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject(learning('fourth'));
  save.mockResolvedValue(true); sync.flush(); await vi.advanceTimersByTimeAsync(0);
  expect(sync.snapshot().status).toBe('saved');
  expect(localStorage.getItem(key)).toBeNull(); release();
});

test('leaving flushes before debounce and remounting shares the existing in-flight save', async () => {
  let resolve!: (saved: boolean) => void;
  const save = vi.fn().mockImplementationOnce(() => new Promise<boolean>(r => { resolve = r; })).mockResolvedValue(true);
  const options = { owner: 'one', bookId: 'book', unitId: 'group', currentOwner: () => 'one', save };
  const sync = acquireVocabularyLearningSync(options);
  const release = sync.subscribe(() => {});
  sync.update(learning('second')); release();
  expect(save).toHaveBeenCalledTimes(1);
  const returned = acquireVocabularyLearningSync(options);
  const releaseReturned = returned.subscribe(() => {});
  returned.update(learning('third')); returned.flush();
  expect(save).toHaveBeenCalledTimes(1);
  resolve(true); await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenCalledTimes(2);
  expect(returned.snapshot().status).toBe('saved'); releaseReturned();
});

test('account switch cancels queued writes and prevents clearing the previous account draft', async () => {
  let owner = 'one';
  let resolve!: (saved: boolean) => void;
  const save = vi.fn(() => new Promise<boolean>(r => { resolve = r; }));
  const sync = acquireVocabularyLearningSync({ owner: 'one', bookId: 'book', unitId: 'group', currentOwner: () => owner, save });
  const release = sync.subscribe(() => {});
  sync.update(learning('second')); sync.flush(); sync.update(learning('third'));
  owner = 'two'; release(); resolve(true); await vi.advanceTimersByTimeAsync(1000);
  expect(save).toHaveBeenCalledTimes(1);
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject(learning('third'));
  expect(sync.snapshot().status).not.toBe('saved');
  expect(sync.snapshot().pending).toEqual(learning('third'));
});

test('legacy session drafts migrate to durable storage and retry without losing progress', async () => {
  sessionStorage.setItem(key, JSON.stringify(learning('second')));
  const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
  const sync = acquireVocabularyLearningSync({ owner: 'one', bookId: 'book', unitId: 'group', currentOwner: () => 'one', save });
  const release = sync.subscribe(() => {});
  expect(sync.snapshot()).toMatchObject({status:'failed',pending:learning('second')});
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject(learning('second'));
  sync.flush(); await vi.advanceTimersByTimeAsync(0);
  expect(sync.snapshot().status).toBe('failed');
  sync.flush(); await vi.advanceTimersByTimeAsync(0);
  expect(sync.snapshot().status).toBe('saved');
  expect(sessionStorage.getItem(key)).toBeNull(); release();
});

test('blocked browser storage reports memory-only progress but still acknowledges a successful retry', async () => {
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new Error('storage blocked'); });
  const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const sync = acquireVocabularyLearningSync({ owner:'one',bookId:'book',unitId:'group',currentOwner:()=> 'one',save });
  const release = sync.subscribe(() => {});
  sync.update(learning('second')); sync.flush(); await vi.advanceTimersByTimeAsync(0);
  expect(sync.snapshot()).toMatchObject({status:'failed',savedOnDevice:false,pending:learning('second')});
  sync.flush(); await vi.advanceTimersByTimeAsync(0);
  expect(sync.snapshot().status).toBe('saved'); release();
  vi.restoreAllMocks();
});

test('a newer session fallback survives old local storage and old acknowledgments, then restores on return', async () => {
  localStorage.setItem(key, JSON.stringify({...learning('old'),revision:'old',sequence:1}));
  const originalSet = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage, name:string,value:string) {
    if (this === localStorage) throw new Error('quota');
    originalSet.call(this,name,value);
  });
  let resolve!: (saved:boolean)=>void;
  const save = vi.fn().mockImplementationOnce(()=>new Promise<boolean>(r=>{resolve=r;})).mockResolvedValue(false);
  const options={owner:'one',bookId:'book',unitId:'group',currentOwner:()=> 'one',save};
  const sync=acquireVocabularyLearningSync(options);
  const release=sync.subscribe(()=>{});
  sync.update(learning('second'));sync.flush();sync.update(learning('third'));
  resolve(true);await vi.advanceTimersByTimeAsync(0);
  expect(JSON.parse(sessionStorage.getItem(key)!)).toMatchObject(learning('third'));
  expect(sync.snapshot().status).toBe('failed');
  release();await vi.advanceTimersByTimeAsync(0);
  const returned=acquireVocabularyLearningSync(options);
  const releaseReturned=returned.subscribe(()=>{});
  expect(returned.snapshot().pending).toEqual(learning('third'));
  save.mockResolvedValue(true);returned.flush();await vi.advanceTimersByTimeAsync(0);
  expect(returned.snapshot().status).toBe('saved');
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(localStorage.getItem(key)).toBeNull();releaseReturned();vi.restoreAllMocks();
});

test('an acknowledgment preserves a newer draft in the other storage area', async () => {
  let resolve!: (saved:boolean)=>void;
  const save=vi.fn(()=>new Promise<boolean>(r=>{resolve=r;}));
  const sync=acquireVocabularyLearningSync({owner:'one',bookId:'book',unitId:'group',currentOwner:()=> 'one',save});
  const release=sync.subscribe(()=>{});
  sync.update(learning('second'));sync.flush();
  const submitted=JSON.parse(localStorage.getItem(key)!);
  sessionStorage.setItem(key,JSON.stringify({...learning('third'),revision:'external-newer',sequence:submitted.sequence+1}));
  resolve(true);await vi.advanceTimersByTimeAsync(0);
  expect(sync.snapshot().status).not.toBe('saved');
  expect(JSON.parse(sessionStorage.getItem(key)!)).toMatchObject({currentEntryId:'third',revision:'external-newer'});
  release();resolve(false);await vi.advanceTimersByTimeAsync(0);
});

test('a successful memory-only save acknowledges newer progress and removes an older persistent draft', async () => {
  localStorage.setItem(key,JSON.stringify({...learning('old'),revision:'old',sequence:1}));
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('storage blocked');});
  let resolve!: (saved:boolean)=>void;
  const save=vi.fn(()=>new Promise<boolean>(r=>{resolve=r;}));
  const sync=acquireVocabularyLearningSync({owner:'one',bookId:'book',unitId:'group',currentOwner:()=> 'one',save});
  const release=sync.subscribe(()=>{});
  sync.update(learning('second'));sync.flush();
  expect(sync.snapshot()).toMatchObject({status:'saving',savedOnDevice:false,pending:learning('second')});
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({currentEntryId:'old'});
  resolve(true);await vi.advanceTimersByTimeAsync(0);
  expect(sync.snapshot().status).toBe('saved');
  expect(sync.snapshot().pending).toBeUndefined();
  expect(localStorage.getItem(key)).toBeNull();
  release();vi.restoreAllMocks();
});
