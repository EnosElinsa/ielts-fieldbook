import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { addVocabularyItem } from '../../domain/vocabulary';
import { emptyState } from '../../domain';
import { DictionarySenses } from './DictionarySenses';
import '@testing-library/jest-dom/vitest';
const mocks = vi.hoisted(()=>({current:null as any}));
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>mocks.current}));
afterEach(()=>{cleanup();vi.unstubAllGlobals()});

test('open dictionary senses retain attribution and enter study without fabricated evidence', async()=>{
  const state=emptyState();
  const entry=addVocabularyItem(state,{term:'mitigate',meaning:'Reduce an adverse effect.'}).item!;
  const save=vi.fn(async(draft)=>{mocks.current.stateRef.current=draft;return true});
  mocks.current={stateRef:{current:state},persistNow:save};
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({entries:[{term:'mitigate',senses:[{id:'wiki:1',definition:'To lessen severity.',example:'The measure mitigates hardship.',pos:'verb',source:'English Wiktionary',attribution:'English Wiktionary contributors',license:'CC-BY-SA-4.0',sourceUrl:'https://en.wiktionary.org/wiki/mitigate'}]}]})})));
  render(<MemoryRouter><DictionarySenses entry={entry}/></MemoryRouter>);
  expect(await screen.findByText('To lessen severity.')).toBeInTheDocument();
  expect(screen.getByText(/English Wiktionary contributors/)).toHaveTextContent('CC-BY-SA-4.0');
  await userEvent.setup().click(screen.getByRole('button',{name:'Practise this sense'}));
  const saved=save.mock.calls[0][0];
  expect(saved.vocabulary[0].senses.some((s: {definition:string;license:string})=>s.definition==='To lessen severity.' && s.license==='CC-BY-SA-4.0')).toBe(true);
  expect(saved.vocabularyEvidence).toHaveLength(0);
});
