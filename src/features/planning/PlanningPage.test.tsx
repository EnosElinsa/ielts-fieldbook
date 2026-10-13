// @ts-nocheck
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { emptyState, dateKey } from '../../domain';
import { PlanningPage } from './PlanningPage';
const mocks=vi.hoisted(()=>({state:null,generate:vi.fn(),change:vi.fn(),start:vi.fn()}));
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>({state:mocks.state,ensureUnifiedPlans:mocks.generate,changePlan:mocks.change,startPlan:mocks.start})}));
beforeEach(()=>{mocks.state=emptyState();mocks.generate.mockReset().mockResolvedValue(true);mocks.change.mockReset().mockResolvedValue(true);mocks.start.mockReset().mockResolvedValue(true);mocks.state.plans=[{id:'task',dateKey:dateKey(new Date()),status:'pending',skill:'writing',title:'Chart',description:'Selected question',estimatedMinutes:20}];});
afterEach(cleanup);
const mount=()=>render(<MemoryRouter><PlanningPage/></MemoryRouter>);
test('calendar includes seven days, rest days and overdue tasks',async()=>{
  mocks.state.plans.push({...mocks.state.plans[0],id:'overdue',dateKey:'2020-01-01',title:'Old task'});
  const {container}=mount();expect(container.querySelectorAll('.study-day')).toHaveLength(7);
  expect(await screen.findAllByText('Rest day')).toHaveLength(6);expect(screen.getByRole('heading',{name:'Old task'})).toBeInTheDocument();
});
test('replace and reschedule save explicit actions',async()=>{
  mount();await userEvent.click(screen.getByRole('button',{name:'Replace task'}));
  await userEvent.selectOptions(screen.getByRole('combobox',{name:'Skill'}),'listening');
  await userEvent.click(screen.getByRole('button',{name:'Save change'}));
  expect(mocks.change).toHaveBeenCalledWith('task',{type:'replace',skill:'listening'});
  await userEvent.click(screen.getByRole('button',{name:'Reschedule task'}));
  const dialog=screen.getByRole('dialog');expect(within(dialog).getByLabelText('Study date')).toHaveValue(dateKey(new Date()));
  await userEvent.click(within(dialog).getByRole('button',{name:'Save change'}));expect(mocks.change).toHaveBeenLastCalledWith('task',{type:'reschedule',dateKey:dateKey(new Date())});
});
test('skip and restore preserve explicit tasks',async()=>{
  const view=mount();await userEvent.click(screen.getByRole('button',{name:'Skip task'}));expect(mocks.change).toHaveBeenCalledWith('task',{type:'skip'});
  mocks.state.plans[0].status='skipped';view.rerender(<MemoryRouter><PlanningPage/></MemoryRouter>);
  await userEvent.click(screen.getByRole('button',{name:'Restore task'}));expect(mocks.change).toHaveBeenLastCalledWith('task',{type:'restore'});
});
test('failed edit stays open and keeps the selected date for retry',async()=>{
  mocks.change.mockResolvedValueOnce(false);mount();await userEvent.click(screen.getByRole('button',{name:'Reschedule task'}));
  await userEvent.click(screen.getByRole('button',{name:'Save change'}));expect(await screen.findByRole('alert')).toHaveTextContent('Your task could not be saved');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
