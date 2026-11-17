// @ts-nocheck
import { expect, test, vi } from 'vitest';
import { emptyState, migrateState, migrateStateAsync, persistShape } from '../../src/domain/state';
import { mergeBackup, validateBackup } from '../../src/domain/backup';

test('cooperative hydration preserves legacy identities, personal text and migration results',async()=>{
 const raw={
  lexicon:[{term:'mitigate',meaning:'Reduce the severity.',reviewCount:2}],
  wordbookProgress:Array.from({length:300},(_,i)=>({id:`progress-${i}`,bookId:'guixue:2',unitId:'2001',completedEntryIds:[],status:'learning',updatedAt:'2026-10-01'})),
  plans:[{id:'p',kind:'lexicon',target:{bookId:'guixue:2',unitId:'2001'}}],
  drafts:{q:{text:'My personal writing.'}},
 };
 const before=structuredClone(raw);
 const clock=vi.spyOn(performance,'now');let elapsed=0;clock.mockImplementation(()=>elapsed+=10);
 // Match migration defaults without freezing browser task scheduling.
 const at=new Date('2026-10-20T12:00:00Z');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(at);
 let responsive=false;const beat=setTimeout(()=>responsive=true,0);
 try {
  expect(await migrateStateAsync(raw)).toEqual(migrateState(raw));
  expect(responsive).toBe(true);expect(raw).toEqual(before);
 }finally{clearTimeout(beat);clock.mockRestore();vi.useRealTimers();}
});

test('v10 state has independent personal vocabulary collections and removes legacy runtime keys', () => {
  const state = migrateState({ lexicon: [{ id: 'old-1', term: 'mitigate', meaning: 'reduce the severity', example: 'Trees mitigate heat.', reviewCount: 4, skill: 'writing' }], plans: [{ id: 'p1', kind: 'lexicon' }] });
  expect(state.schemaVersion).toBe(13);
  expect(state).not.toHaveProperty('lexicon');
  expect(state.vocabulary.length).toBe(1);
  expect(state.vocabularyStates.length).toBeGreaterThan(0);
  expect(state.plans[0].kind).toBe('vocabulary');
  expect(persistShape(state)).not.toHaveProperty('lexicon');
  expect(emptyState().vocabularyEvidence).toEqual([]);
});

test('backup recognizes and validates every personal vocabulary collection', () => {
  expect(validateBackup({ vocabulary: [{ id: 'entry', term: 'mitigate' }], vocabularyEvidence: [{ id: 'ev' }] })).toMatchObject({ valid: true, counts: { vocabulary: 1, vocabularyEvidence: 1 } });
  expect(validateBackup({ vocabularyStates: {} })).toMatchObject({ valid: false });
  expect(validateBackup({ lexicon: [] })).toMatchObject({ valid: true });
});

test('legacy assessment suggestions become English vocabulary suggestions', () => {
  const state = migrateState({ assessments: [{ id: 'assessment', lexiconSuggestions: [{ term: 'mitigate', category: 'word', meaning: '\u51cf\u8f7b', example: 'Trees mitigate heat.', tags: ['academic'] }] }] });
  expect(state.assessments[0]).not.toHaveProperty('lexiconSuggestions');
  expect(state.assessments[0].vocabularySuggestionsList).toEqual([{ term: 'mitigate', category: 'word', meaning: '', example: 'Trees mitigate heat.', tags: ['academic'] }]);
});

test('backup merges vocabulary edits by timestamp and keeps evidence immutable', () => {
  const current = { vocabulary: [{ id: 'entry', term: 'mitigate', lemma: 'mitigate', updatedAt: '2026-10-01T00:00:00Z' }], vocabularyEvidence: [{ id: 'ev', quote: 'Original evidence', updatedAt: '2026-10-01T00:00:00Z' }] };
  const incoming = { vocabulary: [{ id: 'entry', term: 'mitigate', lemma: 'mitigate', tags: ['academic'], updatedAt: '2026-10-02T00:00:00Z' }], vocabularyEvidence: [{ id: 'ev', quote: 'Changed evidence', updatedAt: '2026-10-02T00:00:00Z' }, { id: 'ev2', quote: 'Additional evidence' }] };
  const merged = mergeBackup(current, incoming);
  expect(merged.vocabulary[0].tags).toContain('academic');
  expect(merged.vocabularyEvidence.find(row => row.id === 'ev').quote).toBe('Original evidence');
  expect(merged.vocabularyEvidence.map(row => row.id)).toContain('ev2');
});
