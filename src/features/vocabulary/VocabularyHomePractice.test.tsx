import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import {VocabularyPage} from './VocabularyPages';
import {addVocabularyItem} from '../../domain/vocabulary';
import type {VocabularyDimension,VocabularyMode,VocabularyStore} from '../../domain/vocabulary/types';
import {VOCABULARY_CATALOG} from '../../domain/vocabulary/catalog';
import {loadReleasedVocabularyTeaching} from '../../storage/vocabularyCatalog';

const mocks=vi.hoisted(()=>({fb:null as any,owner:'home-a',draft:null as any}));
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>mocks.fb}));
vi.mock('../../storage/remote',()=>({accountId:()=>mocks.owner}));
vi.mock('../../storage/vocabularyDrafts',()=>({readVocabularyDraft:()=>mocks.draft}));
vi.mock('../../storage/vocabularyCatalog',()=>({loadReleasedVocabularyTeaching:vi.fn(async()=>({}))}));
vi.mock('../../domain/vocabulary/catalog',()=>({VOCABULARY_CATALOG:{entries:[],books:[],units:[],memberships:[]}}));

beforeEach(()=>{
 mocks.owner='home-a';mocks.draft=null;
 mocks.fb={state:{} as VocabularyStore,vocabularyCatalogRevision:0,persistNow:vi.fn(),openModal:vi.fn()};
 Object.assign(VOCABULARY_CATALOG,{entries:[],books:[],units:[],memberships:[]});
 vi.mocked(loadReleasedVocabularyTeaching).mockReset().mockResolvedValue({} as any);
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
function saved(id='personal-compass'){
 const {item}=addVocabularyItem(mocks.fb.state,{id,term:'compass',senses:[{id:'saved-direction',pos:'noun',definition:'An instrument that shows direction.',example:'A compass shows north.',source:'Personal note'}]});
 return {entry:item!,learning:mocks.fb.state.vocabularyStates.find((row:any)=>row.entryId===id)!};
}
function show(){return render(<MemoryRouter initialEntries={['/vocabulary']}><VocabularyPage/></MemoryRouter>);}
function panel(){return screen.getByRole('region',{name:'Next vocabulary task'});}
function successes(entryId:string,at=new Date().toISOString(),days=1,production=false){
 for(let day=0;day<days;day++)for(const dimension of ['meaning','listening','spelling','usage'] as VocabularyDimension[])
 mocks.fb.state.vocabularyEvidence.push({id:`${entryId}:${day}:${dimension}`,entryId,senseId:'saved-direction',dimension,mode:production&&dimension==='usage'?'production':dimension==='usage'?'cloze':dimension==='meaning'?'definition':'dictation',verification:production?'assessed':'objective',result:'success',occurredAt:new Date(Date.parse(at)+day*86400000).toISOString(),sourceType:'personal',sourceId:'lesson'});
}
function due(learning:any,mode:VocabularyMode,offset=-1000){learning.cards[mode]={due:new Date(Date.now()+offset)};}

test('home offers useful practice for a saved meaning before choosing another wordbook and remains read-only',()=>{
 saved();const before=structuredClone(mocks.fb.state);show();
 expect(within(panel()).getByRole('heading',{name:'compass'})).toBeInTheDocument();
 expect(within(panel()).getByText('An instrument that shows direction.')).toBeInTheDocument();
 expect(within(panel()).getByText(/No verified meaning retrieval/)).toBeInTheDocument();
 const url=new URL(within(panel()).getByRole('link',{name:/Practise Meaning recall/}).getAttribute('href')!,'https://example.test');
 expect(Object.fromEntries(url.searchParams)).toMatchObject({entryId:'personal-compass',senseId:'saved-direction',mode:'definition',returnTo:'/vocabulary'});
 expect(mocks.fb.state).toEqual(before);expect(mocks.fb.persistNow).not.toHaveBeenCalled();
});

test('eligible recovery takes priority over a batch due in another saved mode',()=>{
 const {learning}=saved();due(learning,'definition',-10000);due(learning,'dictation');
 learning.wrong.active=true;learning.wrong.modes.dictation={active:true,successesSinceFailure:0};
 mocks.fb.state.settings={vocabulary:{mode:'definition'}};show();
 expect(within(panel()).getByText(/Review an active mistake/)).toBeInTheDocument();
 expect(within(panel()).getByRole('link',{name:/Practise Dictation/})).toHaveAttribute('href',expect.stringContaining('mode=dictation'));
});

test('the existing due batch keeps the preferred supported mode',()=>{
 const {entry,learning}=saved();successes(entry.id,new Date(Date.now()-2*86400000).toISOString());due(learning,'definition');due(learning,'dictation');
 mocks.fb.state.settings={vocabulary:{mode:'dictation'}};show();
 expect(within(panel()).getByRole('link',{name:/Review due words/})).toHaveAttribute('href','/vocabulary/review?mode=dictation&dueOnly=true&scheduledOnly=true');
});

test('a saved session takes priority even while teaching metadata fails',async()=>{
 const {learning}=saved();learning.wrong.active=true;learning.wrong.modes.dictation={active:true,successesSinceFailure:0};
 mocks.draft={mode:'cloze',cardIds:[{id:'frozen'}],planId:'plan-home'};
 mocks.fb.loadVocabularyCatalog=vi.fn(async()=>false);show();await act(async()=>{});
 expect(within(panel()).getByRole('link',{name:/Continue session/})).toHaveAttribute('href','/vocabulary/review?resume=true&mode=cloze&planId=plan-home');
 expect(within(panel()).queryByText(/No verified/)).not.toBeInTheDocument();
});

test('home waits for teaching readiness and exposes a retry on failure without practice suggestions',async()=>{
 saved();let finish:(result:boolean)=>void=()=>{};
 mocks.fb.loadVocabularyCatalog=vi.fn(()=>new Promise<boolean>(resolve=>{finish=resolve;}));show();
 expect(within(panel()).queryByRole('link',{name:/Practise/})).not.toBeInTheDocument();
 await act(async()=>finish(false));
 expect(within(panel()).getByText('Vocabulary recommendations could not be loaded.')).toBeInTheDocument();
 expect(within(panel()).queryByRole('link',{name:/Practise/})).not.toBeInTheDocument();
 mocks.fb.loadVocabularyCatalog.mockResolvedValue(true);fireEvent.click(within(panel()).getByRole('button',{name:/Retry/}));await act(async()=>{});
 expect(within(panel()).getByRole('link',{name:/Practise Meaning recall/})).toBeInTheDocument();
});

test('a future recovery mode stays scheduled while another saved meaning remains useful',()=>{
 const {learning}=saved();due(learning,'dictation',86400000);learning.wrong.active=true;learning.wrong.modes.dictation={active:true,successesSinceFailure:0};show();
 expect(within(panel()).getByRole('link',{name:/Practise Meaning recall/})).toBeInTheDocument();
 expect(within(panel()).queryByText(/Review an active mistake/)).not.toBeInTheDocument();
 expect(within(panel()).queryByRole('link',{name:'Dictation'})).not.toBeInTheDocument();
});

test('future schedules show their date and retain wordbook access',()=>{
 const {learning}=saved();for(const mode of ['definition','dictation','production','cloze'] as VocabularyMode[])due(learning,mode,86400000);show();
 expect(within(panel()).getByText(/Your next review is scheduled for/)).toBeInTheDocument();
 expect(within(panel()).queryByRole('link',{name:/Practise/})).not.toBeInTheDocument();
 expect(within(panel()).getByRole('link',{name:/Study wordbooks/})).toHaveAttribute('href','/vocabulary/wordbooks');
});

test('a spacing boundary updates the recommendation while the home remains open',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
 const {entry}=saved();successes(entry.id,'2026-10-17T10:00:01Z');show();
 expect(within(panel()).getByText(/Your next spaced practice is available from/)).toBeInTheDocument();
 await act(async()=>vi.advanceTimersByTime(1100));
 expect(within(panel()).getByRole('link',{name:/Practise Meaning recall/})).toBeInTheDocument();
 expect(within(panel()).getByText(/another spaced success towards Familiar/)).toBeInTheDocument();
});

test('foreground return refreshes eligibility and changing account cancels the old timer',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
 const {entry}=saved();successes(entry.id,'2026-10-17T10:01:00Z');const view=show();
 vi.setSystemTime(new Date('2026-10-18T10:01:00Z'));fireEvent.focus(window);
 expect(within(panel()).getByRole('link',{name:/Practise Meaning recall/})).toBeInTheDocument();
 mocks.owner='home-b';mocks.fb.state={vocabulary:[],vocabularyStates:[],vocabularyEvidence:[],wordbookEnrollments:[]};
 view.rerender(<MemoryRouter><VocabularyPage/></MemoryRouter>);
 expect(within(panel()).getByRole('heading',{name:'Choose a wordbook'})).toBeInTheDocument();
 await act(async()=>vi.advanceTimersByTime(86400000));
 expect(within(panel()).queryByText('compass')).not.toBeInTheDocument();
});

test('unassessed production remains a suggested learning task with its assessment requirement',()=>{
 const {entry}=saved();successes(entry.id,new Date(Date.now()-7*86400000).toISOString(),5);
 mocks.fb.state.vocabularyEvidence.push({entryId:entry.id,senseId:'saved-direction',dimension:'usage',mode:'production',verification:'pending',result:'pending',occurredAt:new Date(Date.now()-86400000).toISOString(),sourceType:'personal',sourceId:'pending'});
 // No saved due cards: this is skill guidance, not an overdue batch.
 show();expect(within(panel()).getByRole('link',{name:/Practise Use in context/})).toBeInTheDocument();
 expect(within(panel()).getByText(/needs assessed feedback/)).toBeInTheDocument();
});

test('saved meaning guidance precedes an enrolled wordbook while a waiting meaning leaves its group available',()=>{
 const {learning}=saved();
 Object.assign(VOCABULARY_CATALOG,{books:[{id:'book',title:'My course'}],units:[{id:'group',bookId:'book',title:'First group',kind:'group',entryIds:['public-word']}],memberships:[{bookId:'book',unitId:'group',entryId:'public-word'}]});
 mocks.fb.state.wordbookEnrollments=[{bookId:'book'}];const view=show();
 expect(within(panel()).getByRole('link',{name:/Practise Meaning recall/})).toBeInTheDocument();
 for(const mode of ['definition','dictation','production','cloze'] as VocabularyMode[])due(learning,mode,86400000);
 mocks.fb.state={...mocks.fb.state};view.rerender(<MemoryRouter><VocabularyPage/></MemoryRouter>);
 expect(within(panel()).getByRole('link',{name:/Start learning/})).toHaveAttribute('href','/vocabulary/wordbooks/book/groups/group/learn');
 expect(within(panel()).getByText(/Next saved-meaning practice:/)).toBeInTheDocument();
});

test('an unavailable contextual task offers assessed production instead of an unusable sentence gap',()=>{
 const {entry}=saved();entry.senses[0].example='A reading explanation without the target word.';
 for(const dimension of ['meaning','listening','spelling'] as VocabularyDimension[])mocks.fb.state.vocabularyEvidence.push({entryId:entry.id,senseId:'saved-direction',dimension,mode:dimension==='meaning'?'definition':'dictation',verification:'objective',result:'success',occurredAt:new Date(Date.now()-86400000).toISOString(),sourceType:'personal',sourceId:'lesson'});
 show();expect(within(panel()).getByRole('link',{name:/Practise Use in context/})).toBeInTheDocument();
 expect(within(panel()).queryByRole('link',{name:'Sentence gap'})).not.toBeInTheDocument();
});

test('failure of a saved teaching pack cannot be mistaken for successful metadata readiness',async()=>{
 saved();mocks.fb.loadVocabularyCatalog=vi.fn(async()=>true);
 vi.mocked(loadReleasedVocabularyTeaching).mockRejectedValueOnce(new Error('teaching unavailable'));
 show();await act(async()=>{});
 expect(loadReleasedVocabularyTeaching).toHaveBeenCalledWith({entryIds:['personal-compass'],allowMissingEntryIds:true,force:false});
 expect(within(panel()).getByText('Vocabulary recommendations could not be loaded.')).toBeInTheDocument();
 expect(within(panel()).queryByRole('link',{name:/Practise/})).not.toBeInTheDocument();
});

test('late teaching completion from another account cannot expose its previous saved meaning',async()=>{
 saved();let finish:()=>void=()=>{};
 mocks.fb.loadVocabularyCatalog=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const view=show();const finishOld=finish;
 mocks.owner='home-b';mocks.fb.state={vocabulary:[],vocabularyStates:[],vocabularyEvidence:[],wordbookEnrollments:[]};
 view.rerender(<MemoryRouter><VocabularyPage/></MemoryRouter>);
 await act(async()=>finishOld());
 expect(within(panel()).getByText('Preparing your vocabulary recommendations...')).toBeInTheDocument();
 expect(within(panel()).queryByText('compass')).not.toBeInTheDocument();
 await act(async()=>finish());expect(within(panel()).getByRole('heading',{name:'Choose a wordbook'})).toBeInTheDocument();
});

test('unmount removes the recommendation boundary timer and foreground listeners',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
 const {entry}=saved();successes(entry.id,'2026-10-17T10:01:00Z');
 const removeWindow=vi.spyOn(window,'removeEventListener'),removeDocument=vi.spyOn(document,'removeEventListener');
 const view=show();expect(vi.getTimerCount()).toBeGreaterThan(0);view.unmount();
 expect(vi.getTimerCount()).toBe(0);
 expect(removeWindow).toHaveBeenCalledWith('focus',expect.any(Function));
 expect(removeDocument).toHaveBeenCalledWith('visibilitychange',expect.any(Function));
});
