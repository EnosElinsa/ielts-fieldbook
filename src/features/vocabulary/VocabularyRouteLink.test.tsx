import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter, Routes, Route, useLocation, useNavigate} from 'react-router-dom';
import {afterEach, expect, test, vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import {VocabularyLink, VocabularyBackLink} from './VocabularyRouteLink';
const owner=vi.hoisted(()=>({id:'one'}));
vi.mock('../../storage/remote',()=>({accountId:()=>owner.id}));
afterEach(()=>{cleanup();owner.id='one';});
function HistoryControls(){const navigate=useNavigate();const location=useLocation();return <><output>{location.pathname+location.search}</output><button onClick={()=>navigate(-1)}>Browser back</button><button onClick={()=>navigate(1)}>Browser forward</button></>;}
function mount(url='/vocabulary/words?search=river'){
 render(<MemoryRouter initialEntries={['/vocabulary',url]} initialIndex={1}><Routes>
 <Route path='/vocabulary' element={<p>Overview page</p>}/>
 <Route path='/vocabulary/words' element={<VocabularyLink to='/vocabulary/entry/river'>River details</VocabularyLink>}/>
 <Route path='/vocabulary/entry/:id' element={<VocabularyBackLink fallback='/vocabulary'/>}/>
 </Routes><HistoryControls/></MemoryRouter>);
}
test('return pops the actual previous page without creating a detail/list back loop',()=>{
 mount();fireEvent.click(screen.getByRole('link',{name:'River details'}));
 fireEvent.click(screen.getByRole('link',{name:'Back to my words'}));
 expect(screen.getByText('/vocabulary/words?search=river')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Browser back'}));
 expect(screen.getByText('Overview page')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Browser forward'}));
 expect(screen.getByRole('link',{name:'River details'})).toBeInTheDocument();
});
test('a direct detail URL uses a safe fallback and never leaves the application',()=>{
 mount('/vocabulary/entry/river?returnTo=https%3A%2F%2Fevil.test');
 fireEvent.click(screen.getByRole('link',{name:'Back to vocabulary'}));
 expect(screen.getByText('Overview page')).toBeInTheDocument();
});
test('return origins from another account are ignored',()=>{
 mount();fireEvent.click(screen.getByRole('link',{name:'River details'}));
 owner.id='two';
 // A rerendered account must not recover the previous account location.
 fireEvent.click(screen.getByRole('button',{name:'Browser back'}));
 fireEvent.click(screen.getByRole('button',{name:'Browser forward'}));
 expect(screen.getByRole('link',{name:'Back to vocabulary'})).toHaveAttribute('href','/vocabulary');
});

test('a copied internal return URL replaces the detail entry instead of creating a return loop',()=>{
 mount('/vocabulary/entry/river?returnTo=%2Fvocabulary%2Fwords%3Fsearch%3Dwater');
 fireEvent.click(screen.getByRole('link',{name:'Back to my words'}));
 expect(screen.getByText('/vocabulary/words?search=water')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Browser back'}));
 expect(screen.getByText('Overview page')).toBeInTheDocument();
});

test('a tracked return still works when browser storage cannot be written',()=>{
 const setItem=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Storage disabled');});
 try {
  mount();fireEvent.click(screen.getByRole('link',{name:'River details'}));
  fireEvent.click(screen.getByRole('link',{name:'Back to my words'}));
  expect(screen.getByText('/vocabulary/words?search=river')).toBeInTheDocument();
 } finally {setItem.mockRestore();}
});

test('Planning and Today provenance receives a specific return label after refresh',()=>{
  for(const [url,label] of [['/planning?week=next#task-review','Back to Planning'],['/?view=due#task-review','Back to Today']]) {
    const view=render(<MemoryRouter initialEntries={[`/vocabulary/review?returnTo=${encodeURIComponent(url)}`]}><VocabularyBackLink/></MemoryRouter>);
    expect(screen.getByRole('link',{name:label})).toHaveAttribute('href',url);
    view.unmount();
  }
});
