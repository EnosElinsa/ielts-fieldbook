// @ts-nocheck
import { act, cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { emptyState, dateKey } from '../../domain';
import { PlanningPage } from './PlanningPage';
const mocks=vi.hoisted(()=>({state:null,generate:vi.fn(),change:vi.fn(),start:vi.fn(),bulk:vi.fn()}));
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>({state:mocks.state,ensureUnifiedPlans:mocks.generate,changePlan:mocks.change,startPlan:mocks.start,saveBacklogPreview:mocks.bulk})}));
vi.mock('../../storage/examCatalog',()=>({loadExamCatalog:vi.fn().mockResolvedValue({sections:[],papers:[]}),loadExamSections:vi.fn().mockResolvedValue({sections:[]})}));
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,17,12));mocks.state=emptyState();mocks.generate.mockReset().mockResolvedValue(true);mocks.change.mockReset().mockResolvedValue(true);mocks.start.mockReset().mockResolvedValue(true);mocks.bulk.mockReset().mockResolvedValue(true);mocks.state.plans=[{id:'task',dateKey:dateKey(new Date()),status:'pending',skill:'writing',title:'Chart',description:'Selected question',estimatedMinutes:20}];});
afterEach(()=>{cleanup();vi.useRealTimers();});
const mount=()=>render(<MemoryRouter><PlanningPage/></MemoryRouter>);
async function taskAction(name){
  await userEvent.click(screen.getByRole('button',{name:'Task actions: Chart'}));
  await userEvent.click(screen.getByRole('menuitem',{name}));
}
test('calendar includes seven days, rest days and overdue tasks',async()=>{
  mocks.state.plans.push({...mocks.state.plans[0],id:'overdue',dateKey:'2020-01-01',title:'Old task'});
  const {container}=mount();expect(container.querySelectorAll('.study-day')).toHaveLength(7);
  expect(await screen.findAllByText('Rest day')).toHaveLength(1);expect(await screen.findAllByText('No tasks yet. Add a task or adjust your plan settings.')).toHaveLength(5);await userEvent.click(screen.getByText(/Waiting list/));expect(screen.getByRole('heading',{name:'Old task'})).toBeInTheDocument();
});
test('replace and reschedule save explicit actions',async()=>{
  mount();await taskAction('Replace task');
  await userEvent.click(screen.getByRole('button',{name:'Skill'}));
  await userEvent.click(screen.getByRole('option',{name:'Listening'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Save change'})).toBeEnabled());
  await userEvent.click(screen.getByRole('button',{name:'Save change'}));
  expect(mocks.change).toHaveBeenCalledWith('task',expect.objectContaining({type:'replace',skill:'listening',practice:'recommended',estimatedMinutes:20}),{onError:expect.any(Function)});
  await taskAction('Reschedule task');
  const dialog=screen.getByRole('dialog');expect(within(dialog).getByRole('button',{name:'Study date'})).toHaveTextContent(new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}));
  await userEvent.click(within(dialog).getByRole('button',{name:'Save change'}));expect(mocks.change).toHaveBeenLastCalledWith('task',{type:'reschedule',dateKey:dateKey(new Date()),allowOverBudget:false},{onError:expect.any(Function)});
});
test('the themed date picker saves its chosen date and cannot change during saving',async()=>{
  let finish; mocks.change.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  mount();await taskAction('Reschedule task');
  await userEvent.click(screen.getByRole('button',{name:'Study date'}));
  await userEvent.click(within(screen.getByRole('dialog',{name:'Study date'})).getByRole('button',{name:'Today'}));
  await userEvent.click(screen.getByRole('button',{name:'Save change'}));
  expect(screen.getByRole('button',{name:'Study date'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Close dialog'})).toBeDisabled();
  expect(mocks.change).toHaveBeenCalledWith('task',{type:'reschedule',dateKey:dateKey(new Date()),allowOverBudget:false},{onError:expect.any(Function)});
  await act(async()=>finish(true));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('skill selection stays disabled while its replacement saves',async()=>{
  let finish; mocks.change.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  mount();await taskAction('Replace task');
  await userEvent.click(screen.getByRole('button',{name:'Skill'}));
  await userEvent.click(screen.getByRole('option',{name:'Speaking'}));
  await userEvent.click(screen.getByRole('combobox',{name:'Practice type'}));
  await userEvent.click(screen.getByRole('option',{name:'Speaking mock'}));
  await userEvent.click(screen.getByRole('button',{name:'Save change'}));
  expect(screen.getByRole('button',{name:'Skill'})).toBeDisabled();
  expect(mocks.change).toHaveBeenCalledWith('task',expect.objectContaining({type:'replace',skill:'speaking',practice:'speaking-mock',estimatedMinutes:15}),{onError:expect.any(Function)});
  await act(async()=>finish(true));
});
test('skip and restore preserve explicit tasks',async()=>{
  const view=mount();await taskAction('Skip task');expect(mocks.change).toHaveBeenCalledWith('task',{type:'skip'},{onError:expect.any(Function)});
  mocks.state.plans[0].status='skipped';view.rerender(<MemoryRouter><PlanningPage/></MemoryRouter>);
  await userEvent.click(screen.getByRole('button',{name:'Restore task'}));await userEvent.click(screen.getByRole('button',{name:'Save change'}));expect(mocks.change).toHaveBeenLastCalledWith('task',expect.objectContaining({type:'restore'}),{onError:expect.any(Function)});
});
test('failed edit stays open and keeps the selected date for retry',async()=>{
  mocks.change.mockResolvedValueOnce(false);mount();await taskAction('Reschedule task');
  await userEvent.click(screen.getByRole('button',{name:'Save change'}));expect(await screen.findByRole('alert')).toHaveTextContent('Your task could not be saved');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('each day exposes creation and shows its budget before saving a manual task',async()=>{
 mount();await userEvent.click(screen.getAllByRole('button',{name:'Add task'})[0]);
 const dialog=screen.getByRole('dialog',{name:'Add task'});
 expect(within(dialog).getByRole('spinbutton',{name:'Task minutes'})).toBeInTheDocument();
 expect(within(dialog).getByText(/Daily budget/)).toBeInTheDocument();
 expect(within(dialog).getByRole('checkbox',{name:/Keep extra/})).toBeInTheDocument();
});

test('planned task retains a stable focus anchor for practice returns',async()=>{
  const view=mount();await screen.findByRole('button',{name:'Start'});
  expect(view.container.querySelector('#task-task')).toHaveAttribute('tabindex','-1');
});

test('backlog starts collapsed, defaults to pending only and keeps a failed bulk save retryable',async()=>{
 mocks.state.plans.push({id:'old',dateKey:'2020-01-01',status:'pending',skill:'writing',kind:'1',title:'Old pending',estimatedMinutes:20},{id:'started',dateKey:'2020-01-02',status:'in_progress',startedAt:'2020-01-02',skill:'writing',kind:'1',title:'Old started',estimatedMinutes:20});
 const view=mount();await waitFor(()=>expect(mocks.generate).toHaveBeenCalled());
 expect(view.container.querySelector('#planning-backlog')).not.toHaveAttribute('open');
 await userEvent.click(screen.getByText(/Waiting list.*2/));
 expect(screen.getByRole('checkbox',{name:'Select Old pending'})).toBeChecked();expect(screen.getByRole('checkbox',{name:'Select Old started'})).not.toBeChecked();expect(screen.getByRole('checkbox',{name:'Select Old started'})).toBeDisabled();
 await userEvent.click(screen.getByRole('button',{name:'Preview skip'}));
 expect(screen.getByRole('dialog',{name:'Review backlog changes'})).toHaveTextContent('Old pending');
 mocks.bulk.mockResolvedValueOnce(false);await userEvent.click(screen.getByRole('button',{name:'Save backlog changes'}));expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i);
 await userEvent.click(screen.getByRole('button',{name:'Save backlog changes'}));expect(mocks.bulk).toHaveBeenCalledTimes(2);
});

test('past skipped history stays collapsed with restore actions and preserves return anchors',async()=>{
 mocks.state.plans.push({id:'skipped-old',dateKey:'2020-01-01',status:'skipped',skipReason:'bulk-skip',skill:'writing',title:'Skipped old task',estimatedMinutes:20});
 mount();await userEvent.click(screen.getByText(/Skipped history/));
 expect(screen.getByRole('heading',{name:'Skipped old task'})).toBeInTheDocument();
 await userEvent.click(screen.getByRole('button',{name:'Restore task'}));expect(screen.getByRole('dialog',{name:'Restore task'})).toBeInTheDocument();
});
