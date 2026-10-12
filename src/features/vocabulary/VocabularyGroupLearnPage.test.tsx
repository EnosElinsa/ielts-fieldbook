import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { VOCABULARY_CATALOG } from '../../domain/vocabulary/catalog';
import { VocabularyGroupLearnPage } from './VocabularyGroupLearnPage';

const mocks = vi.hoisted(() => ({ fb: null as any, owner: 'account-one' as string | null }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mocks.fb }));
vi.mock('../../storage/remote', () => ({ accountId: () => mocks.owner }));
vi.mock('./VocabularyPages', () => ({ VocabularyNavigation: () => <nav>Vocabulary</nav> }));
vi.mock('./Pronunciation', () => ({ Pronunciation: ({entry}: any) => <button>Play {entry.term}</button> }));
const original = structuredClone(VOCABULARY_CATALOG);
const path = '/vocabulary/wordbooks/book/groups/group/learn';
function entry(index: number) {
  return { id:`word-${index}`, term:`Word ${index}`, category:'word', meaning:`Meaning ${index}`, example:`Example ${index}.`, tags:[], sources:[{type:'wordbook',id:`source-${index}`,bookId:'book',unitId:'group'}], senses:[{id:`sense-${index}`,definition:`Meaning ${index}`,example:index===1?'Meronym: stock animal':`Example ${index}.`,pos:'noun',collocations:['reliable phrase']}], createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z' };
}
beforeEach(() => {
  mocks.owner='account-one';
  const entries=Array.from({length:12},(_,i)=>entry(i+1));
  Object.assign(VOCABULARY_CATALOG,{books:[{id:'book',title:'Wordbook'}],units:[{bookId:'book',id:'chapter',title:'Confirmed theme',kind:'chapter'},{bookId:'book',id:'group',title:'Group 1',parentId:'chapter',kind:'group',entryIds:entries.map(e=>e.id),totalSourceWords:12,contentStatus:'complete'}],memberships:entries.map((e,i)=>({bookId:'book',unitId:'group',entryId:e.id,order:i+1})),entries});
  const state={vocabulary:[],vocabularyStates:[],vocabularyEvidence:[],vocabularyReviews:[],vocabularyActivities:[],vocabularySessions:[],wordbookProgress:[],wordbookEnrollments:[],vocabularyImportBatches:[],settings:{}};
  mocks.fb={state,stateRef:{current:state},loadVocabularyCatalog:vi.fn(async()=>true),saveVocabularyLearning:vi.fn(async()=>true)};
  sessionStorage.clear();
});
afterEach(()=>{cleanup();Object.assign(VOCABULARY_CATALOG,structuredClone(original));vi.restoreAllMocks();});
function Location(){const location=useLocation();return <output aria-label="Route">{location.pathname+location.search}</output>;}
function mount(url=path){return render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/vocabulary/wordbooks/:bookId/groups/:unitId/learn" element={<VocabularyGroupLearnPage/>}/></Routes><Location/></MemoryRouter>);}

test('learns a source-ordered batch, keeps theme truthful and separates browsing from assessment',async()=>{
  const before=JSON.stringify(mocks.fb.state);
  mount();
  await screen.findByRole('heading',{name:'Word 1'});
  expect(screen.getByText('Wordbook / Confirmed theme / Group 1')).toBeInTheDocument();
  expect(screen.getByText('Batch 1 of 2 · Words 1–10')).toBeInTheDocument();
  expect(screen.getByText('Viewed 0 / 12')).toBeInTheDocument();
  expect(screen.getByText('Assessment: Not started')).toBeInTheDocument();
  expect(screen.queryByText('Meronym: stock animal')).not.toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Dictation · 12 words'})).toHaveAttribute('href',expect.stringContaining('mode=dictation'));
  expect(JSON.stringify(mocks.fb.state)).toBe(before);
  expect(mocks.fb.saveVocabularyLearning).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole('button',{name:'Mark viewed & next'}));
  expect(mocks.fb.saveVocabularyLearning).toHaveBeenCalledWith('book','group',expect.objectContaining({viewedEntryIds:['word-1'],currentEntryId:'word-2'}));
  expect(screen.getByRole('heading',{name:'Word 2'})).toBeInTheDocument();
  expect(screen.getByText('Viewed 1 / 12')).toBeInTheDocument();
  expect(screen.getByText('Progress saved')).toBeInTheDocument();
  expect(JSON.stringify(mocks.fb.state)).toBe(before);
});

test('restores saved position, ignores unavailable viewed words and offers ten-word batch navigation',async()=>{
  mocks.fb.state.wordbookProgress=[{id:'progress',bookId:'book',unitId:'group',status:'in_progress',completedEntryIds:[],updatedAt:'2026-01-01',learning:{viewedEntryIds:['word-1','removed'],currentEntryId:'word-11',updatedAt:'2026-01-01'}}];
  mount();
  await screen.findByRole('heading',{name:'Word 11'});
  expect(screen.getByText('Batch 2 of 2 · Words 11–12')).toBeInTheDocument();
  expect(screen.getByText('Viewed 1 / 12')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button',{name:'Batch 1: words 1–10'}));
  expect(screen.getByRole('heading',{name:'Word 1'})).toBeInTheDocument();
  expect(mocks.fb.saveVocabularyLearning).toHaveBeenLastCalledWith('book','group',expect.objectContaining({currentEntryId:'word-1'}));
});

test('failed save retains position and retries without claiming completion or changing assessment',async()=>{
  mocks.fb.saveVocabularyLearning.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  mount();await screen.findByRole('heading',{name:'Word 1'});
  await userEvent.setup().click(screen.getByRole('button',{name:'Mark viewed & next'}));
  expect(screen.getByRole('heading',{name:'Word 2'})).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Progress could not be saved');
  expect(screen.queryByText('Progress saved')).not.toBeInTheDocument();
  expect(screen.getByText('Assessment: Not started')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button',{name:'Retry save'}));
  expect(mocks.fb.saveVocabularyLearning).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Progress saved')).toBeInTheDocument();
  expect(mocks.fb.state.vocabularyEvidence).toHaveLength(0);
  expect(mocks.fb.state.vocabularyReviews).toHaveLength(0);
});

test('keeps pending navigation on return and links details back to current word',async()=>{
  mocks.fb.saveVocabularyLearning.mockResolvedValue(false);
  const view=mount();await screen.findByRole('heading',{name:'Word 1'});
  await userEvent.setup().click(screen.getByRole('button',{name:'Mark viewed & next'}));
  expect(screen.getByRole('link',{name:'Word details'})).toHaveAttribute('href',expect.stringContaining(encodeURIComponent(`${path}?word=word-2`)));
  view.unmount();mount();await screen.findByRole('heading',{name:'Word 2'});
  expect(screen.getByRole('button',{name:'Retry save'})).toBeInTheDocument();
});

test('late save cannot leak progress into another account',async()=>{
  let resolve!:(value:boolean)=>void;
  mocks.fb.saveVocabularyLearning.mockImplementation(()=>new Promise<boolean>(r=>{resolve=r;}));
  const view=mount();await screen.findByRole('heading',{name:'Word 1'});
  await userEvent.setup().click(screen.getByRole('button',{name:'Mark viewed & next'}));
  expect(screen.getByRole('button',{name:'Mark viewed & next'})).toBeDisabled();
  mocks.owner='account-two';view.rerender(<MemoryRouter initialEntries={[path]}><Routes><Route path="/vocabulary/wordbooks/:bookId/groups/:unitId/learn" element={<VocabularyGroupLearnPage/>}/></Routes></MemoryRouter>);
  resolve(true);
  await waitFor(()=>expect(screen.getByRole('heading',{name:'Word 1'})).toBeInTheDocument());
  expect(screen.getByText('Viewed 0 / 12')).toBeInTheDocument();
  expect(screen.queryByText('Progress saved')).not.toBeInTheDocument();
});

test('loading errors retry and archived-only groups have a useful next step',async()=>{
  mocks.fb.loadVocabularyCatalog.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  VOCABULARY_CATALOG.entries.forEach((e:any)=>e.tags=['archived']);
  mount();await screen.findByRole('button',{name:'Retry group'});
  await userEvent.setup().click(screen.getByRole('button',{name:'Retry group'}));
  expect(await screen.findByText('No active words are available in this group.')).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'View group words'})).toBeInTheDocument();
});

test('manual familiarity alone is not an assessment and specialist modes show available subsets',async()=>{
  mocks.fb.state.vocabularyStates=[{entryId:'word-1',senseId:'sense-1',manualStatus:'mastered',statusSource:'manual',dimensions:{},wrong:{active:false,modes:{}},cards:{}}];
  (VOCABULARY_CATALOG.entries[1] as any).senses[0].source='Personal note';
  (VOCABULARY_CATALOG.entries[1] as any).senses[0].example='Example 2 is a useful sentence.';
  mount();await screen.findByRole('heading',{name:'Word 1'});
  expect(screen.getByText('Assessment: Not started')).toBeInTheDocument();
  expect(screen.getByText('System mastered 0 / 12')).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Dictation · 12 words'})).toBeInTheDocument();
  expect(screen.queryByRole('link',{name:'Sentence gaps · 12 words'})).not.toBeInTheDocument();
});

test('missing theme metadata retains source chapter and group names',async()=>{
  (VOCABULARY_CATALOG.units[0] as any).title='Chapter 3';
  mount();await screen.findByRole('heading',{name:'Word 1'});
  expect(screen.getByText('Wordbook / Chapter 3 / Group 1')).toBeInTheDocument();
  expect(screen.queryByText('Confirmed theme')).not.toBeInTheDocument();
});

test('successful save after leaving clears pending device progress',async()=>{
  let resolve!:(value:boolean)=>void;
  mocks.fb.saveVocabularyLearning.mockImplementation(()=>new Promise<boolean>(r=>{resolve=r;}));
  const view=mount();await screen.findByRole('heading',{name:'Word 1'});
  await userEvent.setup().click(screen.getByRole('button',{name:'Mark viewed & next'}));
  view.unmount();resolve(true);
  await waitFor(()=>expect(sessionStorage.getItem('fieldbook:vocabulary-learning-pending:account-one:book:group')).toBeNull());
});
