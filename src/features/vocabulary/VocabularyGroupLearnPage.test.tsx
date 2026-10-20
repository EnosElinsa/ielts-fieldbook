import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { VOCABULARY_CATALOG } from '../../domain/vocabulary/catalog';
import { VocabularyGroupLearnPage } from './VocabularyGroupLearnPage';
import { buildLearningBatch } from '../../domain/vocabulary/learningBatch';

const mocks = vi.hoisted(() => ({ fb: null as any, owner: 'account-one' as string | null, onCardReady: undefined as (() => void) | undefined }));
vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => mocks.fb }));
vi.mock('../../storage/remote', () => ({ accountId: () => mocks.owner }));
vi.mock('./VocabularyPages', () => ({ VocabularyNavigation: () => <nav>Vocabulary</nav> }));
vi.mock('./Pronunciation', async () => {
  const { useEffect } = await import('react');
  return { Pronunciation: ({entry}: any) => {
    useEffect(() => {
      // The child sees the committed card before the page's passive effects run.
      const onReady = mocks.onCardReady;
      mocks.onCardReady = undefined;
      onReady?.();
    }, []);
    return <button>Play {entry.term}</button>;
  } };
});
const original = structuredClone(VOCABULARY_CATALOG);
test('planned learning retains its required fixed batch mode and whole-group assessments clear binding', async () => {
  const batch=buildLearningBatch(mocks.fb.state,'book','group',0,10,'definition');
  mocks.fb.state.plans=[{id:'planned',kind:'vocabulary',status:'in_progress',target:{type:'vocabulary',mode:'learning-batch',assessmentMode:'definition',...batch.selection,cards:batch.selection.cards}}];
  mount(`/vocabulary/wordbooks/book/groups/group/learn?planId=planned&batch=0&batchSize=10&batchCards=${encodeURIComponent(JSON.stringify(batch.selection.cards))}`);
  const link=await screen.findByRole('link',{name:'Start meaning recall · 10 words'});
  const url=new URL(link.getAttribute('href')!,'http://local.test');
  expect(url.searchParams.get('mode')).toBe('definition');
  expect(url.searchParams.get('planId')).toBe('planned');
  expect(screen.getByRole('combobox',{name:'Test type'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Whole group · 12 words'}));
  const groupLink=screen.getByRole('link',{name:'Start meaning recall · 12 words'});
  expect(new URL(groupLink.getAttribute('href')!,'http://local.test').searchParams.has('planId')).toBe(false);
  expect(screen.getByRole('combobox',{name:'Test type'})).toBeEnabled();
  fireEvent.change(screen.getByRole('combobox',{name:'Test type'}),{target:{value:'dictation'}});
  fireEvent.click(screen.getByRole('button',{name:'This batch · 10 words'}));
  expect(screen.getByRole('combobox',{name:'Test type'})).toBeDisabled();
  expect(screen.getByRole('link',{name:'Start meaning recall · 10 words'})).toHaveAttribute('href',expect.stringContaining('planId=planned'));
});
const path = '/vocabulary/wordbooks/book/groups/group/learn';
test('exact planned learning browses only its frozen words and retains the original task batch when navigating', async () => {
  const cards=[{entryId:'word-11',senseId:'sense-11'},{entryId:'word-3',senseId:'sense-3'},{entryId:'word-1',senseId:'sense-1'}];
  mocks.fb.state.plans=[{id:'exact-plan',kind:'vocabulary',status:'in_progress',target:{type:'vocabulary',mode:'learning-batch',assessmentMode:'definition',selectionPolicy:'exact',bookId:'book',unitId:'group',batchIndex:1,batchSize:10,cards}}];
  const plannedEntry=VOCABULARY_CATALOG.entries.find(entry=>entry.id==='word-11')!;
  plannedEntry.senses.push({...plannedEntry.senses[0],id:'other-sense-11',definition:'Another unplanned meaning.'});
  mocks.fb.state.vocabularySessions=[{id:'prior-subset',status:'submitted',mode:'definition',selection:{kind:'learning-batch',bookId:'book',unitId:'group',batchIndex:1,batchSize:10,cards},results:cards.map(ref=>({...ref,response:'answer'}))}];
  mount(`${path}?planId=exact-plan&batch=1&batchSize=10&sense=other-sense-11&selectedEntryIds=${encodeURIComponent(JSON.stringify(['word-2']))}`);
  await screen.findByRole('heading',{name:'Word 11'});
  expect(screen.getByText('Meaning 11')).toBeInTheDocument();
  expect(screen.getByLabelText('Group progress')).toHaveTextContent('Assessment: In progress');
  fireEvent.click(screen.getByRole('button',{name:'Next word'}));
  await screen.findByRole('heading',{name:'Word 3'});
  fireEvent.click(screen.getByRole('button',{name:'Next word'}));
  await screen.findByRole('heading',{name:'Word 1'});
  const route=new URL(screen.getByLabelText('Route').textContent!,'https://local.test');
  expect(route.searchParams.get('planId')).toBe('exact-plan');
  expect(route.searchParams.get('batch')).toBe('1');
  expect(route.searchParams.get('batchSize')).toBe('10');
  const assessment=new URL(screen.getByRole('link',{name:'Start meaning recall · 3 words'}).getAttribute('href')!,'https://local.test');
  expect(assessment.searchParams.get('planId')).toBe('exact-plan');
  expect(assessment.searchParams.get('batch')).toBe('1');
  expect(assessment.searchParams.get('batchSize')).toBe('10');
  expect(JSON.parse(assessment.searchParams.get('batchCards')!)).toEqual(cards);
  expect(screen.getByRole('button',{name:'Next word'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Whole group · 12 words'})).toBeInTheDocument();
});
function entry(index: number) {
  return { id:`word-${index}`, term:`Word ${index}`, category:'word', meaning:`Meaning ${index}`, example:`Example ${index}.`, tags:[], sources:[{type:'wordbook',id:`source-${index}`,bookId:'book',unitId:'group'}], senses:[{id:`sense-${index}`,definition:`Meaning ${index}`,example:index===1?'Meronym: stock animal':`Example ${index}.`,pos:'noun',collocations:['reliable phrase']}], createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z' };
}
beforeEach(() => {
  mocks.owner='account-one';
  mocks.onCardReady=undefined;
  const entries=Array.from({length:12},(_,i)=>entry(i+1));
  Object.assign(VOCABULARY_CATALOG,{books:[{id:'book',title:'Wordbook'}],units:[{bookId:'book',id:'chapter',title:'Confirmed theme',kind:'chapter'},{bookId:'book',id:'group',title:'Group 1',parentId:'chapter',kind:'group',entryIds:entries.map(e=>e.id),totalSourceWords:12,contentStatus:'complete'}],memberships:entries.map((e,i)=>({bookId:'book',unitId:'group',entryId:e.id,order:i+1})),entries});
  const state={vocabulary:[],vocabularyStates:[],vocabularyEvidence:[],vocabularyReviews:[],vocabularyActivities:[],vocabularySessions:[],wordbookProgress:[],wordbookEnrollments:[],vocabularyImportBatches:[],settings:{}};
  mocks.fb={state,stateRef:{current:state},loadVocabularyCatalog:vi.fn(async()=>true),saveVocabularyLearning:vi.fn(async()=>true)};
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(async()=>{vi.useRealTimers();cleanup();await act(async()=>{await Promise.resolve();});Object.assign(VOCABULARY_CATALOG,structuredClone(original));vi.restoreAllMocks();});
function Location(){const location=useLocation();return <output aria-label="Route">{location.pathname+location.search}</output>;}
function mount(url=path){return render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/vocabulary/wordbooks/:bookId/groups/:unitId/learn" element={<VocabularyGroupLearnPage/>}/></Routes><Location/></MemoryRouter>);}

test('assessment scope and type produce one explicit start link without changing learning progress', async () => {
  const before = structuredClone(mocks.fb.state);
  mount(`${path}?word=word-12&batchSize=1`);
  await screen.findByRole('heading', { name: 'Word 12' });
  const scope = screen.getByRole('group', { name: 'Assessment scope' });
  expect(within(scope).getByRole('button', { name: 'This batch · 1 word' })).toHaveAttribute('aria-pressed', 'true');
  const start = screen.getByRole('link', { name: 'Start dictation · 1 word' });
  expect(JSON.parse(new URL(start.getAttribute('href')!, 'https://test.local').searchParams.get('batchCards')!)).toEqual([{ entryId: 'word-12', senseId: 'sense-12' }]);
  fireEvent.change(screen.getByRole('combobox', { name: 'Test type' }), { target: { value: 'definition' } });
  expect(new URL(screen.getByRole('link', { name: 'Start meaning recall · 1 word' }).getAttribute('href')!, 'https://test.local').searchParams.get('mode')).toBe('definition');
  fireEvent.click(within(scope).getByRole('button', { name: 'Whole group · 12 words' }));
  const groupUrl = new URL(screen.getByRole('link', { name: 'Start meaning recall · 12 words' }).getAttribute('href')!, 'https://test.local');
  expect(groupUrl.searchParams.has('batchCards')).toBe(false);
  expect(groupUrl.searchParams.get('dueOnly')).toBe('false');
  expect(screen.getAllByRole('link').filter(link => link.getAttribute('href')?.startsWith('/vocabulary/study?'))).toHaveLength(1);
  expect(mocks.fb.state).toEqual(before);
  expect(mocks.fb.saveVocabularyLearning).not.toHaveBeenCalled();
});

test('whole-group specialist tests disclose partial coverage and cannot silently shrink the current batch', async () => {
  VOCABULARY_CATALOG.entries[1].term = 'example';
  Object.assign(VOCABULARY_CATALOG.entries[1].senses[0], { source: 'Personal note', example: 'Example 2 is a useful sentence.' });
  mount();
  await screen.findByRole('heading', { name: 'Word 1' });
  expect(within(screen.getByRole('combobox', { name: 'Test type' })).queryByRole('option', { name: /Sentence gaps/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Whole group · 12 words' }));
  expect(screen.getByRole('option', { name: 'Sentence gaps · 1/12' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Test type' }), { target: { value: 'cloze' } });
  expect(screen.getByRole('link', { name: 'Start sentence gaps · 1 word' })).toHaveAttribute('href', expect.stringContaining('mode=cloze'));
  expect(screen.getByText(/1 of 12 words.*sentence-gap/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'This batch · 10 words' }));
  expect(screen.getByRole('link', { name: 'Start dictation · 10 words' })).toHaveAttribute('href', expect.stringContaining('batchCards='));
});

test('card motion keeps rapid navigation immediate and cancels obsolete animations', async () => {
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel, finished: Promise.resolve() }));
  const previousAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  let reduce = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduce; }, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) }));
  try {
    const view = mount();
    await screen.findByRole('heading', { name: 'Word 1' });
    const play = screen.getByRole('button', { name: 'Play Word 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Next word' }));
    expect(screen.getByRole('heading', { name: 'Word 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Word 2' })).toBe(play);
    expect(animate).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Next word' }));
    expect(screen.getByRole('heading', { name: 'Word 3' })).toBeInTheDocument();
    expect(cancel).toHaveBeenCalled();
    reduce = true;
    act(() => { listeners.forEach(listener => listener()); });
    animate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Previous word' }));
    expect(screen.getByRole('heading', { name: 'Word 2' })).toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();
    view.unmount();
    expect(listeners.size).toBe(0);
  } finally {
    if (previousAnimate) Object.defineProperty(Element.prototype, 'animate', previousAnimate);
    else delete (Element.prototype as Partial<Element>).animate;
    vi.unstubAllGlobals();
  }
});

test('a fully viewed final batch presents completion instead of dead end navigation', async () => {
  mocks.fb.state.wordbookProgress = [{ bookId: 'book', unitId: 'group', learning: { viewedEntryIds: ['word-12'], currentEntryId: 'word-12', updatedAt: '2026-01-01' } }];
  mount(`${path}?batchSize=1`);
  await screen.findByRole('heading', { name: 'Word 12' });
  expect(screen.getByText('Batch viewed')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Viewed' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Next word' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Start dictation · 1 word' })).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Words viewed in this batch' })).toHaveAttribute('value', '1');
  expect(screen.getByText('1 word viewed. Ready to test your recall?')).toBeInTheDocument();
  expect(screen.getByText('Assessment: Not started')).toBeInTheDocument();
});

test('a supplementary dictionary diagram opens inside the learning copy without reserving an illustration column', async () => {
  const released = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
  Object.assign(VOCABULARY_CATALOG, released);
  const bank = released.entries.find((entry: any) => entry.term === 'bank');
  const member = released.memberships.find((row: any) => row.entryId === bank.id);
  mount(`/vocabulary/wordbooks/${member.bookId}/groups/${member.unitId}/learn?word=${bank.id}`);
  await screen.findByText('View diagram');
  expect(document.querySelector('#learning-meaning')).not.toHaveClass('has-visual');
  expect(screen.queryByRole('img', { name: 'bank: A bank accepting savings and offering loans' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('View diagram'));
  const image = await screen.findByRole('img', { name: 'bank: A bank accepting savings and offering loans' });
  expect(image.closest('.vocabulary-learning-copy')).toBeInTheDocument();
  expect(screen.getByText('a commercial bank', { exact: true })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Usage and meaning notes'));
  expect(screen.getByRole('heading', { name: 'Compare meanings' })).toBeInTheDocument();
});

test('recall first hides the answer until revealed and resets for each word without recording evidence', async () => {
  const before = structuredClone(mocks.fb.state);
  mount();
  await screen.findByRole('heading', { name: 'Word 1' });
  fireEvent.click(screen.getByRole('button', { name: 'Recall first' }));
  expect(screen.queryByText('Meaning 1')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mark viewed & next' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Reveal meaning' }));
  expect(screen.getByText('Meaning 1')).toBeInTheDocument();
  expect(mocks.fb.state).toEqual(before);
  expect(mocks.fb.saveVocabularyLearning).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Next word' }));
  expect(screen.queryByText('Meaning 2')).not.toBeInTheDocument();
  expect(screen.queryByText('Example 2.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reveal meaning' }));
  expect(screen.getByText('Example 2.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Previous word' }));
  expect(screen.queryByText('Meaning 1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Read first' }));
  expect(screen.getByText('Meaning 1')).toBeInTheDocument();
});

test('the batch checkpoint can return to an unviewed word and never counts skipped words as viewed', async () => {
  mocks.fb.state.wordbookProgress=[{bookId:'book',unitId:'group',learning:{viewedEntryIds:['word-1','word-3','word-11'],currentEntryId:'word-10',updatedAt:'2026-01-01'}}];
  mount();
  await screen.findByRole('heading', { name: 'Word 10' });
  expect(screen.getByText('2 of 10 words viewed in this batch')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue learning this batch' }));
  expect(screen.getByRole('heading', { name: 'Word 2' })).toBeInTheDocument();
  expect(screen.getByText('Viewed 3 / 12')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Batch 2: words 11–12' }));
  expect(screen.getByText('1 of 2 words viewed in this batch')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next word' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mark viewed' }));
  expect(screen.getByText('All 2 words viewed. Ready to test your recall?')).toBeInTheDocument();
});

test('learning cards omit dictionary references instead of presenting them as examples', async () => {
  VOCABULARY_CATALOG.entries[0].senses[0].example='Near-synonyms: see Thesaurus:adjunct';
  mount();
  await screen.findByRole('heading',{name:'Word 1'});
  const card=within(screen.getByRole('article',{name:'Current learning word'}));
  expect(card.queryByText(/Thesaurus:/)).not.toBeInTheDocument();
  expect(card.queryByRole('heading',{name:'Example'})).not.toBeInTheDocument();
  expect(card.queryByText(/An example has not been added/)).not.toBeInTheDocument();
  expect(card.getByRole('link',{name:'Word details'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Next word'}));
  expect(card.getByRole('heading',{name:'Example'})).toBeInTheDocument();
  expect(card.getByText('Example 2.')).toBeInTheDocument();
});

test('primary assessment freezes the current ten words and preserves its plan', async () => {
  const batch=buildLearningBatch(mocks.fb.state,'book','group',0,10,'dictation');
  mocks.fb.state.plans=[{id:'plan-one',kind:'vocabulary',status:'in_progress',target:{type:'vocabulary',mode:'learning-batch',assessmentMode:'dictation',...batch.selection,cards:batch.selection.cards}}];
  mount(`${path}?planId=plan-one`);
  await screen.findByRole('heading', { name: 'Word 1' });
  const link = await screen.findByRole('link', { name: 'Start dictation · 10 words' });
  const params = new URL(link.getAttribute('href')!, 'https://test.local').searchParams;
  expect(params.get('planId')).toBe('plan-one');
  expect(params.get('batch')).toBe('0');
  expect(JSON.parse(params.get('batchCards')!)).toHaveLength(10);
  expect(JSON.parse(params.get('batchCards')!)[0]).toEqual({ entryId: 'word-1', senseId: 'sense-1' });
});

test('last word stays in its batch so learning does not skip its assessment', async () => {
  const user = userEvent.setup();
  mount(`${path}?word=word-10`);
  await screen.findByRole('heading', { name: 'Word 10' });
  await user.click(screen.getByRole('button', { name: 'Mark viewed' }));
  expect(screen.getByRole('heading', { name: 'Word 10' })).toBeInTheDocument();
  const params = new URL(screen.getByRole('link', { name: 'Start dictation · 10 words' }).getAttribute('href')!, 'https://test.local').searchParams;
  expect(params.get('batch')).toBe('0');
});

test('viewed final word and unchanged batch do not create another save',async()=>{
  mocks.fb.state.wordbookProgress=[{bookId:'book',unitId:'group',learning:{viewedEntryIds:['word-12'],currentEntryId:'word-12',updatedAt:'2026-01-01'}}];
  mount();await screen.findByRole('heading',{name:'Word 12'});
  expect(screen.getByRole('button',{name:'Viewed'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Viewed'}));
  fireEvent.click(screen.getByRole('button',{name:'Viewed'}));
  fireEvent.click(screen.getByRole('button',{name:'Batch 2: words 11–12'}));
  expect(screen.getByRole('heading',{name:'Word 12'})).toBeInTheDocument();
  expect(mocks.fb.saveVocabularyLearning).not.toHaveBeenCalled();
  expect(localStorage.getItem('fieldbook:vocabulary-learning-pending:account-one:book:group')).toBeNull();
});

test('revisiting a viewed word keeps marking disabled while navigation remains available',async()=>{
  mocks.fb.state.wordbookProgress=[{bookId:'book',unitId:'group',learning:{viewedEntryIds:['word-1'],currentEntryId:'word-1',updatedAt:'2026-01-01'}}];
  mount();await screen.findByRole('heading',{name:'Word 1'});
  expect(await screen.findByRole('button',{name:'Viewed'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Batch 1: words 1–10'}));
  expect(localStorage.getItem('fieldbook:vocabulary-learning-pending:account-one:book:group')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Viewed'}));
  expect(localStorage.getItem('fieldbook:vocabulary-learning-pending:account-one:book:group')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Next word'}));
  expect(screen.getByRole('heading',{name:'Word 2'})).toBeInTheDocument();
  expect(screen.getByText('Viewed 1 / 12')).toBeInTheDocument();
});

test('learning returns to the actual filtered word list rather than the wordbook ancestor',async()=>{
  const source='/vocabulary/wordbooks/book/groups/group/words?search=Word&page=1';
  mount(`${path}?returnTo=${encodeURIComponent(source)}`);
  await screen.findByRole('heading',{name:'Word 1'});
  expect(screen.getByRole('link',{name:'Back to group words'})).toHaveAttribute('href',source);
});

test('word and batch navigation preserve the browser entry return state',async()=>{
  const source='/vocabulary/history/session-one';
  render(<MemoryRouter initialEntries={[{pathname:path,state:{vocabularyReturn:{owner:'account-one',url:source}}}]}><Routes><Route path="/vocabulary/wordbooks/:bookId/groups/:unitId/learn" element={<VocabularyGroupLearnPage/>}/></Routes><Location/></MemoryRouter>);
  await screen.findByRole('heading',{name:'Word 1'});
  fireEvent.click(screen.getByRole('button',{name:'Mark viewed & next'}));
  fireEvent.click(screen.getByRole('button',{name:'Batch 2: words 11–12'}));
  expect(screen.getByRole('link',{name:'Back to session word list'})).toHaveAttribute('href',source);
  expect(screen.getByLabelText('Route')).toHaveTextContent('word=word-11');
});

test('learns a source-ordered batch, keeps theme truthful and separates browsing from assessment',async()=>{
  const before=JSON.stringify(mocks.fb.state);
  mount();
  await screen.findByRole('heading',{name:'Word 1'});
  expect(screen.getByText('Wordbook / Confirmed theme / Group 1')).toBeInTheDocument();
  expect(screen.getByText('Batch 1 of 2 · Words 1–10')).toBeInTheDocument();
  expect(screen.getByText('Viewed 0 / 12')).toBeInTheDocument();
  expect(screen.getByText('Assessment: Not started')).toBeInTheDocument();
  expect(screen.queryByText('Meronym: stock animal')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Whole group · 12 words'}));
  expect(screen.getByRole('link',{name:'Start dictation · 12 words'})).toHaveAttribute('href',expect.stringContaining('mode=dictation'));
  expect(JSON.stringify(mocks.fb.state)).toBe(before);
  expect(mocks.fb.saveVocabularyLearning).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole('button',{name:'Mark viewed & next'}));
  expect(screen.getByRole('heading',{name:'Word 2'})).toBeInTheDocument();
  expect(screen.getByText('Viewed 1 / 12')).toBeInTheDocument();
  await screen.findByText('Progress saved');
  expect(mocks.fb.saveVocabularyLearning).toHaveBeenCalledWith('book','group',expect.objectContaining({viewedEntryIds:['word-1'],currentEntryId:'word-2'}),{onError:expect.any(Function)});
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
  await waitFor(()=>expect(mocks.fb.saveVocabularyLearning).toHaveBeenLastCalledWith('book','group',expect.objectContaining({currentEntryId:'word-1'}),{onError:expect.any(Function)}),{timeout:3500});
});

test('failed save retains position and retries without claiming completion or changing assessment',async()=>{
  mocks.fb.saveVocabularyLearning.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  mount();await screen.findByRole('heading',{name:'Word 1'});
  await userEvent.setup().click(screen.getByRole('button',{name:'Mark viewed & next'}));
  expect(screen.getByRole('heading',{name:'Word 2'})).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent('Progress could not be saved');
  expect(screen.queryByText('Progress saved')).not.toBeInTheDocument();
  expect(screen.getByText('Assessment: Not started')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button',{name:'Retry save'}));
  expect(mocks.fb.saveVocabularyLearning).toHaveBeenCalledTimes(2);
  await screen.findByText('Progress saved');
  expect(mocks.fb.state.vocabularyEvidence).toHaveLength(0);
  expect(mocks.fb.state.vocabularyReviews).toHaveLength(0);
});

test('keeps pending navigation on return and links details back to current word',async()=>{
  mocks.fb.saveVocabularyLearning.mockResolvedValue(false);
  const view=mount();await screen.findByRole('heading',{name:'Word 1'});
  await userEvent.setup().click(screen.getByRole('button',{name:'Mark viewed & next'}));
  expect(screen.getByRole('link',{name:'Word details'})).toHaveAttribute('href',expect.stringContaining(encodeURIComponent(`${path}?word=word-2`)));
  await screen.findByRole('button',{name:'Retry save'});
  view.unmount();mount();await screen.findByRole('heading',{name:'Word 2'});
  expect(screen.getByRole('button',{name:'Retry save'})).toBeInTheDocument();
});

test('late save cannot leak progress into another account',async()=>{
  let resolve!:(value:boolean)=>void;
  mocks.fb.saveVocabularyLearning.mockImplementation(()=>new Promise<boolean>(r=>{resolve=r;}));
  const view=mount();await screen.findByRole('heading',{name:'Word 1'});
  await userEvent.setup().click(screen.getByRole('button',{name:'Mark viewed & next'}));
  await waitFor(()=>expect(mocks.fb.saveVocabularyLearning).toHaveBeenCalled());
  expect(screen.getByRole('button',{name:'Mark viewed & next'})).toBeEnabled();
  mocks.owner='account-two';view.rerender(<MemoryRouter initialEntries={[path]}><Routes><Route path="/vocabulary/wordbooks/:bookId/groups/:unitId/learn" element={<VocabularyGroupLearnPage/>}/></Routes></MemoryRouter>);
  resolve(true);
  await waitFor(()=>expect(screen.getByRole('heading',{name:'Word 1'})).toBeInTheDocument());
  expect(screen.getByText('Viewed 0 / 12')).toBeInTheDocument();
  expect(screen.queryByText('Progress saved')).not.toBeInTheDocument();
});

test('rapid navigation remains immediate and saves only the latest durable snapshot',async()=>{
  const user = userEvent.setup();
  mount();await screen.findByRole('heading',{name:'Word 1'});
  await user.click(screen.getByRole('button',{name:'Mark viewed & next'}));
  await screen.findByRole('heading',{name:'Word 2'});
  await user.click(screen.getByRole('button',{name:'Mark viewed & next'}));
  await screen.findByRole('heading',{name:'Word 3'});
  await user.click(screen.getByRole('button',{name:'Batch 2: words 11–12'}));
  expect(screen.getByRole('heading',{name:'Word 11'})).toBeInTheDocument();
  expect(screen.getByText('Viewed 2 / 12')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Previous word'})).toBeEnabled();
  expect(mocks.fb.saveVocabularyLearning).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem('fieldbook:vocabulary-learning-pending:account-one:book:group')!)).toMatchObject({currentEntryId:'word-11',viewedEntryIds:['word-1','word-2']});
  await waitFor(()=>expect(mocks.fb.saveVocabularyLearning).toHaveBeenCalledTimes(1),{timeout:3500});
  expect(mocks.fb.saveVocabularyLearning).toHaveBeenLastCalledWith('book','group',expect.objectContaining({currentEntryId:'word-11',viewedEntryIds:['word-1','word-2']}),{onError:expect.any(Function)});
});

test('a stale successful save cannot clear newer progress or claim it is saved',async()=>{
  let resolve!:(value:boolean)=>void;
  mocks.fb.saveVocabularyLearning.mockImplementationOnce(()=>new Promise<boolean>(r=>{resolve=r;})).mockResolvedValue(false);
  mount();await screen.findByRole('heading',{name:'Word 1'});
  fireEvent.click(screen.getByRole('button',{name:'Mark viewed & next'}));
  await waitFor(()=>expect(mocks.fb.saveVocabularyLearning).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button',{name:'Mark viewed & next'}));
  fireEvent.click(screen.getByRole('button',{name:'Mark viewed & next'}));
  expect(screen.getByRole('heading',{name:'Word 4'})).toBeInTheDocument();
  expect(mocks.fb.saveVocabularyLearning).toHaveBeenCalledTimes(1);
  await act(async()=>resolve(true));
  await screen.findByRole('button',{name:'Retry save'});
  expect(screen.queryByText('Progress saved')).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('fieldbook:vocabulary-learning-pending:account-one:book:group')!)).toMatchObject({currentEntryId:'word-4',viewedEntryIds:['word-1','word-2','word-3']});
  mocks.fb.saveVocabularyLearning.mockResolvedValue(true);
  fireEvent.click(screen.getByRole('button',{name:'Retry save'}));
  await screen.findByText('Progress saved');
  expect(mocks.fb.saveVocabularyLearning).toHaveBeenLastCalledWith('book','group',expect.objectContaining({currentEntryId:'word-4',viewedEntryIds:['word-1','word-2','word-3']}),{onError:expect.any(Function)});
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
  fireEvent.click(screen.getByRole('button',{name:'Whole group · 12 words'}));
  expect(screen.getByRole('link',{name:'Start dictation · 12 words'})).toBeInTheDocument();
  expect(screen.queryByRole('option',{name:'Sentence gaps'})).not.toBeInTheDocument();
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
  expect(mocks.fb.saveVocabularyLearning).not.toHaveBeenCalled();
  view.unmount();resolve(true);
  await waitFor(()=>expect(sessionStorage.getItem('fieldbook:vocabulary-learning-pending:account-one:book:group')).toBeNull());
  expect(localStorage.getItem('fieldbook:vocabulary-learning-pending:account-one:book:group')).toBeNull();
});

test('keeps both viewed words when the first click happens as the learning card appears',async()=>{
  vi.useFakeTimers();
  mocks.onCardReady=()=>screen.getByRole('button',{name:'Mark viewed & next'}).click();
  await act(async()=>{mount();});
  expect(screen.getByRole('heading',{name:'Word 2'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Mark viewed & next'}));
  expect(screen.getByRole('heading',{name:'Word 3'})).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('fieldbook:vocabulary-learning-pending:account-one:book:group')!)).toMatchObject({currentEntryId:'word-3',viewedEntryIds:['word-1','word-2']});
  expect(screen.getByText('Viewed 2 / 12')).toBeInTheDocument();
  vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
  fireEvent(document,new Event('visibilitychange'));
  expect(mocks.fb.saveVocabularyLearning).toHaveBeenCalledWith('book','group',expect.objectContaining({currentEntryId:'word-3',viewedEntryIds:['word-1','word-2']}),{onError:expect.any(Function)});
  await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
  expect(screen.getByText('Progress saved')).toBeInTheDocument();
});

test('retains an immediate first-click draft for its owner when accounts change',async()=>{
  vi.useFakeTimers();
  mocks.onCardReady=()=>screen.getByRole('button',{name:'Mark viewed & next'}).click();
  let view!: ReturnType<typeof mount>;
  await act(async()=>{view=mount();});
  expect(screen.getByRole('heading',{name:'Word 2'})).toBeInTheDocument();
  mocks.owner='account-two';
  view.rerender(<MemoryRouter initialEntries={[path]}><Routes><Route path="/vocabulary/wordbooks/:bookId/groups/:unitId/learn" element={<VocabularyGroupLearnPage/>}/></Routes></MemoryRouter>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
  expect(screen.getByRole('heading',{name:'Word 1'})).toBeInTheDocument();
  expect(screen.getByText('Viewed 0 / 12')).toBeInTheDocument();
  expect(mocks.fb.saveVocabularyLearning).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem('fieldbook:vocabulary-learning-pending:account-one:book:group')!)).toMatchObject({currentEntryId:'word-2',viewedEntryIds:['word-1']});
  expect(localStorage.getItem('fieldbook:vocabulary-learning-pending:account-two:book:group')).toBeNull();
});

test('hiding the page flushes the latest draft before the debounce expires',async()=>{
  mount();await screen.findByRole('heading',{name:'Word 1'});
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button',{name:'Mark viewed & next'}));
  fireEvent.click(screen.getByRole('button',{name:'Mark viewed & next'}));
  expect(mocks.fb.saveVocabularyLearning).not.toHaveBeenCalled();
  vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
  fireEvent(document,new Event('visibilitychange'));
  expect(mocks.fb.saveVocabularyLearning).toHaveBeenCalledWith('book','group',expect.objectContaining({currentEntryId:'word-3',viewedEntryIds:['word-1','word-2']}),{onError:expect.any(Function)});
  await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
  expect(screen.getByText('Progress saved')).toBeInTheDocument();
});

test('a new account never flushes the previous account debounce draft',async()=>{
  const view=mount();await screen.findByRole('heading',{name:'Word 1'});
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button',{name:'Mark viewed & next'}));
  mocks.owner='account-two';
  view.rerender(<MemoryRouter initialEntries={[path]}><Routes><Route path="/vocabulary/wordbooks/:bookId/groups/:unitId/learn" element={<VocabularyGroupLearnPage/>}/></Routes></MemoryRouter>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByRole('heading',{name:'Word 1'})).toBeInTheDocument();
  expect(mocks.fb.saveVocabularyLearning).not.toHaveBeenCalled();
  expect(screen.getByText('Viewed 0 / 12')).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('fieldbook:vocabulary-learning-pending:account-one:book:group')!)).toMatchObject({currentEntryId:'word-2',viewedEntryIds:['word-1']});
  expect(localStorage.getItem('fieldbook:vocabulary-learning-pending:account-two:book:group')).toBeNull();
  vi.useRealTimers();
});

test('multiple meanings preserve explicit selection in the details return link and clear it for the next word',async()=>{
  const released=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
  Object.assign(VOCABULARY_CATALOG,released);
  const book=released.entries.find((e:any)=>e.term==='book');
  const url=`/vocabulary/wordbooks/ielts-listening-essentials/groups/ielts-listening-essentials-chapter-04-group-01/learn?word=${book.id}`;
  mount(url);
  await screen.findByRole('heading',{name:'book'});
  const meaningButtons=screen.getAllByRole('button',{name:/Meaning \d/});
  expect(meaningButtons.length).toBeGreaterThan(1);
  expect(screen.getByLabelText('Meanings to learn')).toHaveTextContent('Each meaning keeps its own review progress.');
  expect(meaningButtons.every(button=>Boolean(button.querySelector('.vocabulary-learning-meaning-preview')?.textContent))).toBe(true);
  expect(meaningButtons.filter(button=>button.getAttribute('aria-pressed')==='true')).toHaveLength(1);
  await userEvent.setup().click(screen.getByRole('button',{name:'Recall first'}));
  expect(screen.getByLabelText('Meanings to learn').querySelector('.vocabulary-learning-meaning-preview')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button',{name:'Reveal meaning'}));
  expect(screen.getByLabelText('Meanings to learn').querySelector('.vocabulary-learning-meaning-preview')).not.toBeNull();
  await userEvent.setup().click(screen.getByRole('button',{name:'Read first'}));
  await userEvent.setup().click(meaningButtons.find(button=>button.textContent?.includes('noun'))!);
  const assessment = new URL(screen.getByRole('link', { name: /^Start / }).getAttribute('href')!, 'http://local.test');
  expect(JSON.parse(assessment.searchParams.get('batchCards')!).find((ref: any) => ref.entryId === book.id).senseId).toBe('kaikki:7d09dc41b99ae33c32');
  expect(screen.getByRole('link',{name:'Word details'}).getAttribute('href')).toContain('senseId=kaikki%3A7d09dc41b99ae33c32');
  const details=new URL(screen.getByRole('link',{name:'Word details'}).getAttribute('href')!,'http://local.test');
  expect(new URL(details.searchParams.get('returnTo')!,'http://local.test').searchParams.get('sense')).toBe('kaikki:7d09dc41b99ae33c32');
  expect(screen.getByRole('link',{name:'Practise this meaning'})).toHaveAttribute('href',expect.stringContaining('senseId=kaikki%3A7d09dc41b99ae33c32'));
  await userEvent.setup().click(screen.getByRole('button',{name:'Next word'}));
  expect(screen.getByLabelText('Route')).not.toHaveTextContent('sense=');
  expect(mocks.fb.state.vocabularyEvidence).toHaveLength(0);
});

test('paste learning card uses the existing complete reviewed meaning, example and combinations', async () => {
  const released=JSON.parse(readFileSync('public/vocabulary-catalog.json','utf8'));
  Object.assign(VOCABULARY_CATALOG,released);
  const paste=released.entries.find((e:any)=>e.term==='paste');
  mount(`/vocabulary/wordbooks/ielts-vocabulary/groups/ielts-vocabulary-chapter-12-group-02/learn?word=${paste.id}`);
  await screen.findByRole('heading',{name:'paste'});
  expect(screen.getByText('Mix the flour and water into a smooth paste.')).toBeInTheDocument();
  expect(screen.getByText('tomato paste')).toBeInTheDocument();
  expect(screen.queryByText('A soft moist mixture, in particular:')).not.toBeInTheDocument();
});

test('planned learning ignores URL card substitutions and keeps the account batch',async()=>{
  const batch=buildLearningBatch(mocks.fb.state,'book','group',0,10,'definition');
  mocks.fb.state.plans=[{id:'account-learning',kind:'vocabulary',status:'in_progress',target:{type:'vocabulary',mode:'learning-batch',assessmentMode:'definition',...batch.selection,cards:batch.selection.cards}}];
  mount(`/vocabulary/wordbooks/book/groups/group/learn?planId=account-learning&batch=1&batchSize=2&batchCards=${encodeURIComponent(JSON.stringify([{entryId:'word-12',senseId:'sense-12'}]))}`);
  const link=await screen.findByRole('link',{name:'Start meaning recall · 10 words'});
  const url=new URL(link.getAttribute('href')!,'http://local');
  expect(url.searchParams.get('planId')).toBe('account-learning');
  expect(JSON.parse(url.searchParams.get('batchCards')!)).toEqual(batch.selection.cards);
});
