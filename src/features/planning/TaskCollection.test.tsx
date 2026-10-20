import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { emptyState } from '../../domain';
import { TaskCollection } from './TaskCollection';
import type { StudyPlan } from '../../domain/plans';
import '@testing-library/jest-dom/vitest';

const mocks=vi.hoisted(()=>({fb:null as any}));
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>mocks.fb}));
vi.mock('../vocabulary/vocabularyNavigation',()=>({useVocabularyPosition:()=>{}}));
afterEach(cleanup);
beforeEach(()=>{
  const state={...emptyState(),plans:[] as StudyPlan[]};
  state.plans=Array.from({length:25},(_,i)=>({id:`history-${i}`,title:`Historical task ${i}`,description:'Historical review',dateKey:'2000-01-01',kind:'vocabulary',skill:'vocabulary',status:'skipped',origin:'manual',estimatedMinutes:2,target:{type:'vocabulary',mode:'due-review',assessmentMode:'dictation',binding:'dynamic',cards:[]},completion:{type:'assessment',description:'Submit every answer.'},schemaVersion:2,generationKey:`history-${i}`,startedAt:null,completedAt:null}));
  mocks.fb={state,saveStatus:'saved',loadPlanningHistoryPage:vi.fn(async options=>{
    const offset=options.targetId==='history-24'?20:options.offset||0;
    return {plans:options.allIds?[]:state.plans.slice(offset,offset+20),total:25,offset,ids:options.allIds?state.plans.map(plan=>plan.id):null};
  }),ensurePlanningRows:vi.fn(async()=>state),saveBacklogPreview:vi.fn(async()=>true),refreshPlanningState:vi.fn(async()=>{})};
});
function mount(path='/planning'){
  return render(<MemoryRouter initialEntries={[path]}><TaskCollection tasks={mocks.fb.state.plans} kind="history" renderTask={plan=><article>{plan.title}</article>}/></MemoryRouter>);
}
test('server-paged history keeps page selection separate from all filtered results and previews the full selection',async()=>{
  mount();await screen.findByText('Historical task 0');expect(screen.queryByText('Historical task 24')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Select this page'}));expect(screen.getByText('20 selected · 25 matching tasks')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Next page'}));await screen.findByText('Historical task 24');
  expect(screen.getByText('Page 2 of 2 · 25 tasks · 20 per page')).toBeInTheDocument();
  expect(screen.getByText('20 selected · 25 matching tasks')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Select all filtered results'}));
  await screen.findByText('25 selected · 25 matching tasks');
  expect(mocks.fb.loadPlanningHistoryPage).toHaveBeenCalledWith(expect.objectContaining({allIds:true}));
  fireEvent.click(screen.getByRole('button',{name:'Preview archive'}));
  await screen.findByRole('dialog');expect(mocks.fb.ensurePlanningRows.mock.calls[0][0]).toHaveLength(25);
  expect(screen.getByText(/25 selected tasks/)).toBeInTheDocument();expect(mocks.fb.saveBacklogPreview).not.toHaveBeenCalled();
});
test('a historical deep link asks the server for its page and changing filters clears the selection',async()=>{
  mount('/planning#task-history-24');await screen.findByText('Historical task 24');
  expect(mocks.fb.loadPlanningHistoryPage).toHaveBeenCalledWith(expect.objectContaining({targetId:'history-24'}));
  fireEvent.click(screen.getByRole('button',{name:'Select this page'}));expect(screen.getByText('5 selected · 25 matching tasks')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Source'),{target:{value:'automatic'}});
  await waitFor(()=>expect(mocks.fb.loadPlanningHistoryPage).toHaveBeenCalledWith(expect.objectContaining({origin:'automatic',offset:0})));
  expect(screen.getByText('0 selected · 25 matching tasks')).toBeInTheDocument();
});

test('filters stay fixed while all-result selection is loading',async()=>{
  const original=mocks.fb.loadPlanningHistoryPage;
  let finish:(value:any)=>void=()=>{};
  mocks.fb.loadPlanningHistoryPage=vi.fn(options=>options.allIds?new Promise(resolve=>{finish=resolve;}):original(options));
  mount();await screen.findByText('Historical task 0');
  await userEvent.click(screen.getByRole('button',{name:'Select all filtered results'}));
  expect(screen.getByLabelText('Source')).toBeDisabled();
  expect(screen.getByLabelText('From')).toBeDisabled();
  await userEvent.selectOptions(screen.getByLabelText('Source'),'automatic');
  expect(screen.getByLabelText('Source')).toHaveValue('all');
  await act(async()=>finish({plans:[],total:25,offset:0,ids:mocks.fb.state.plans.map((plan:StudyPlan)=>plan.id)}));
  expect(screen.getByText('25 selected · 25 matching tasks')).toBeInTheDocument();
  expect(screen.getByLabelText('Source')).toBeEnabled();
});
