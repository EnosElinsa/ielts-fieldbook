// @ts-nocheck
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { emptyState, dateKey } from '../../domain';
import { TodayPage } from './TodayPage';

const mocks=vi.hoisted(()=>({state:null,start:vi.fn(),generate:vi.fn(),skill:'writing'}));
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>({state:mocks.state,activeSkill:mocks.skill,ensureUnifiedPlans:mocks.generate,startPlan:mocks.start})}));
beforeEach(()=>{mocks.state=emptyState();mocks.start.mockReset().mockResolvedValue(true);mocks.generate.mockReset().mockResolvedValue(true);mocks.skill='writing';});
afterEach(cleanup);
const plan=(id,skill,status='pending',day=dateKey(new Date()))=>({id,skill,kind:`${skill}-practice`,status,dateKey:day,title:`${skill} task`,description:'Selected practice',estimatedMinutes:20,completion:{description:'Submit the selected section.'}});
const renderPage=()=>render(<MemoryRouter><TodayPage/></MemoryRouter>);

test('one next task is unified and does not depend on the active skill',async()=>{
  mocks.state.plans=[plan('listen','listening')];mocks.skill='writing';renderPage();
  await screen.findByRole('heading',{name:'listening task'});
  expect(screen.getAllByText('20 min')).toHaveLength(2);
  await userEvent.click(screen.getByRole('button',{name:'Start'}));expect(mocks.start).toHaveBeenCalledWith('listen',{force:false});
});
test('resumes existing progress before overdue or new tasks',async()=>{
  mocks.state.plans=[plan('overdue','reading','pending','2020-01-01'),plan('resume','speaking','in_progress')];renderPage();
  await userEvent.click(screen.getByRole('button',{name:'Resume'}));expect(mocks.start).toHaveBeenCalledWith('resume',{force:false});
  expect(screen.getByRole('link',{name:'1 overdue task'})).toHaveAttribute('href','/planning');
});
test('blocked source content remains retryable',async()=>{
  mocks.state.plans=[plan('reading','reading')];mocks.start.mockRejectedValueOnce(new Error('The selected section is unavailable.'));
  renderPage();await userEvent.click(screen.getByRole('button',{name:'Start'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('The selected section is unavailable.');
  await userEvent.click(screen.getByRole('button',{name:'Retry task'}));expect(mocks.start).toHaveBeenCalledTimes(2);
});
test('completion summary includes every selected skill and vocabulary',async()=>{
  mocks.state.plans=[plan('read','reading','completed'),plan('vocab','vocabulary','completed')];renderPage();
  await waitFor(()=>expect(mocks.generate).toHaveBeenCalled());
  expect(screen.getByText('40 min estimated for completed tasks')).toBeInTheDocument();
  expect(screen.getAllByText('1 done')).toHaveLength(2);
  expect(screen.getByRole('heading',{name:'Today is complete'})).toBeInTheDocument();
});
test('plan persistence failure exposes a retry and never displays unsaved generated tasks',async()=>{
  mocks.generate.mockResolvedValueOnce(false);renderPage();
  await screen.findByRole('button',{name:'Retry plan'});
  await userEvent.click(screen.getByRole('button',{name:'Retry plan'}));expect(mocks.generate).toHaveBeenCalledTimes(2);
});
