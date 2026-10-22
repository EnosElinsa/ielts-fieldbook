// @ts-nocheck
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { emptyState, dateKey } from '../../domain';
import { TodayPage } from './TodayPage';
import { rememberVocabularyPosition } from '../vocabulary/vocabularyNavigation';

const mocks=vi.hoisted(()=>({state:null,start:vi.fn(),generate:vi.fn(),skill:'writing'}));
vi.mock('../../context/FieldbookContext',()=>({useFieldbook:()=>({state:mocks.state,activeSkill:mocks.skill,ensureUnifiedPlans:mocks.generate,startPlan:mocks.start})}));
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,9,17,12));mocks.state=emptyState();mocks.start.mockReset().mockResolvedValue(true);mocks.generate.mockReset().mockResolvedValue(true);mocks.skill='writing';});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
const plan=(id,skill,status='pending',day=dateKey(new Date()))=>({id,skill,kind:`${skill}-practice`,status,dateKey:day,title:`${skill} task`,description:'Selected practice',estimatedMinutes:20,completion:{description:'Submit the selected section.'}});
const renderPage=()=>render(<MemoryRouter><TodayPage/></MemoryRouter>);

test('existing partial learning batches display their actual count in the next task and daily list',async()=>{
 mocks.state.plans=[{...plan('partial','vocabulary'),title:'Vocabulary - Learn 10 words',target:{type:'vocabulary',mode:'learning-batch',assessmentMode:'definition',batchSize:10,cards:Array.from({length:7},(_,i)=>({entryId:`word-${i}`,senseId:'meaning'}))}}];
 renderPage();
 expect(await screen.findByRole('heading',{name:'Vocabulary - Learn 7 words'})).toBeInTheDocument();
 expect(screen.getAllByText('Vocabulary - Learn 7 words')).toHaveLength(2);
 expect(screen.queryByText('Vocabulary - Learn 10 words')).not.toBeInTheDocument();
 await userEvent.click(screen.getByText('Why 7 words?'));
 expect(screen.getByText(/saved selection of 7 words/)).toBeVisible();
});

test('held and archived tasks cannot appear as next work, inflate today or return as previous work',()=>{
 mocks.state.plans=[plan('current','reading'),...['held','archived'].flatMap(kind=>[0,1,2].map(offset=>({...plan(`${kind}-${offset}`,kind==='held'?'listening':'speaking',offset===0?'in_progress':'pending',offset===0?dateKey(new Date()):offset===1?'2020-01-01':'2099-01-01'),...(kind==='held'?{onHold:true}:{archivedAt:'2026-10-16'})})))];
 mocks.state.activePlanId='held-0';
 const {container}=renderPage();
 expect(container.querySelector('.study-next')).toHaveAttribute('data-plan-id','current');
 expect(container.querySelector('.study-summary')).toHaveTextContent('20 / 30 min planned');
 expect(container.querySelector('.study-summary')).toHaveTextContent('of 1 task');
 expect(screen.queryByText('listening task')).not.toBeInTheDocument();
 expect(screen.queryByText('speaking task')).not.toBeInTheDocument();
 expect(screen.queryByRole('region',{name:'Continue previous tasks'})).not.toBeInTheDocument();
});

test('one next task is unified and does not depend on the active skill',async()=>{
  mocks.state.plans=[plan('listen','listening')];mocks.skill='writing';renderPage();
  await screen.findByRole('heading',{name:'listening task'});
  expect(screen.getAllByText(/20 min/)).toHaveLength(2);
  await userEvent.click(screen.getByRole('button',{name:'Start'}));expect(mocks.start).toHaveBeenCalledWith('listen',{force:false,onError:expect.any(Function)});
});
test('resumes existing progress before overdue or new tasks',async()=>{
  mocks.state.plans=[plan('overdue','reading','pending','2020-01-01'),plan('resume','speaking','in_progress')];renderPage();
  await userEvent.click(screen.getByRole('button',{name:'Resume'}));expect(mocks.start).toHaveBeenCalledWith('resume',{force:false,onError:expect.any(Function)});
  expect(screen.getByRole('link',{name:'1 overdue task'})).toHaveAttribute('href','/planning#planning-backlog');
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
  expect(screen.getByRole('heading',{name:'Plan unavailable'})).toBeInTheDocument();
  expect(screen.queryByRole('heading',{name:'Today is complete'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'Retry plan'}));expect(mocks.generate).toHaveBeenCalledTimes(2);
});
test('an empty day waits for planning and never claims unearned completion',async()=>{
  let finish; mocks.generate.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  renderPage();
  expect(screen.getByRole('status')).toHaveTextContent('Preparing your plan…');
  expect(screen.queryByRole('heading',{name:'Today is complete'})).not.toBeInTheDocument();
  await waitFor(()=>expect(mocks.generate).toHaveBeenCalled());
  finish(true);
  expect(await screen.findByRole('heading',{name:'No tasks planned yet'})).toBeInTheDocument();
});

test('a Sunday rest day is distinct from completing a study day',async()=>{
  vi.setSystemTime(new Date(2026,9,18,12));
  renderPage();await waitFor(()=>expect(mocks.generate).toHaveBeenCalled());
  expect(await screen.findByRole('heading',{name:'Rest day'})).toBeInTheDocument();
  expect(screen.queryByRole('heading',{name:'Today is complete'})).not.toBeInTheDocument();
  expect(screen.getByText('Rest day. You can still add a task in Planning.')).toBeInTheDocument();
});
test('today progress takes priority over old work and previous tasks keep their own dates and actions',async()=>{
  mocks.state.plans=[plan('old','reading','in_progress','2020-01-01'),plan('current','speaking','in_progress')];
  const {container}=renderPage();
  const next=container.querySelector('.study-next');
  expect(within(next).getByRole('heading',{name:'speaking task'})).toBeInTheDocument();
  expect(next).toHaveAttribute('data-plan-id','current');
  await userEvent.click(within(next).getByRole('button',{name:'Resume'}));
  expect(mocks.start).toHaveBeenLastCalledWith('current',{force:false,onError:expect.any(Function)});
  const previous=screen.getByRole('region',{name:'Continue previous tasks'});
  const old=within(previous).getByRole('article');
  expect(old).toHaveAttribute('data-plan-id','old');expect(old).toHaveTextContent('Due 2020-01-01');
  await userEvent.click(within(old).getByRole('button',{name:'Resume'}));
  expect(mocks.start).toHaveBeenLastCalledWith('old',{force:false,onError:expect.any(Function)});
});
test('the active eligible task takes priority and its overdue detail resumes that exact plan',async()=>{
  mocks.state.activePlanId='chosen';mocks.state.plans=[plan('old','reading','in_progress','2020-01-01'),plan('today','speaking','in_progress'),plan('chosen','listening','in_progress','2020-01-02')];
  const {container}=renderPage();const next=container.querySelector('.study-next');
  expect(next).toHaveAttribute('data-plan-id','chosen');expect(next).toHaveTextContent('Due 2020-01-02');
  await userEvent.click(within(next).getByRole('button',{name:'Resume'}));
  expect(mocks.start).toHaveBeenLastCalledWith('chosen',{force:false,onError:expect.any(Function)});
  expect(screen.getByRole('region',{name:'Continue previous tasks'}).querySelector('[data-plan-id="chosen"]')).toBeNull();
});
test('future and completed active plans cannot displace today or an unfinished exam hijack its detail',async()=>{
  mocks.state.activePlanId='future';mocks.state.plans=[plan('future','reading','in_progress','2099-01-01'),plan('today','speaking')];
  mocks.state.examAttempts=[{id:'attempt-old',status:'paused',skill:'listening',mode:'practice',sourceId:'paper',sectionIds:['section'],remainingSeconds:1200,updatedAt:'2020-01-01'}];
  const {container,rerender}=renderPage();expect(within(container.querySelector('.study-next')).getByRole('heading',{name:'speaking task'})).toBeInTheDocument();
  expect(within(screen.getByRole('region',{name:'Continue previous tasks'})).getByRole('link',{name:'Resume'})).toHaveAttribute('href','/listening/section?attempt=attempt-old');
  mocks.state.plans[0].status='completed';rerender(<MemoryRouter><TodayPage/></MemoryRouter>);
  expect(within(container.querySelector('.study-next')).getByRole('heading',{name:'speaking task'})).toBeInTheDocument();
});

test('Today next task retains a stable focus anchor for practice returns',async()=>{
  mocks.state.plans=[plan('vocabulary-review','vocabulary')];const view=renderPage();
  await screen.findByRole('button',{name:'Start'});
  expect(view.container.querySelector('#task-vocabulary-review')).toHaveAttribute('tabindex','-1');
});

test('Today completed tasks keep their return anchor after the next task changes',async()=>{
  mocks.state.plans=[plan('review-done','vocabulary','completed'),plan('next','reading')];const view=renderPage();
  await screen.findByRole('button',{name:'Start'});
  expect(view.container.querySelector('#task-review-done')).toHaveAttribute('tabindex','-1');
});

test('completed overdue return targets retain their exact Today anchor without an overdue grid',async()=>{
 mocks.state.plans=[plan('old-completed','vocabulary','completed','2020-01-01'),...Array.from({length:40},(_,index)=>plan(`old-${index}`,'reading','pending','2020-01-01'))];
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 rememberVocabularyPosition('/today#task-old-completed','task-old-completed');
 const view=render(<MemoryRouter initialEntries={[{pathname:'/today',hash:'#task-old-completed',state:{vocabularyRestore:true}}]}><TodayPage/></MemoryRouter>);
 await waitFor(()=>expect(mocks.generate).toHaveBeenCalled());
 expect(view.container.querySelector('#task-old-completed')).toHaveAttribute('tabindex','-1');
 await waitFor(()=>expect(view.container.querySelector('#task-old-completed')).toHaveFocus());
 expect(view.container.querySelectorAll('.study-previous .study-task').length).toBeLessThanOrEqual(4);
 expect(screen.getByRole('link',{name:/40 overdue tasks/})).toHaveAttribute('href','/planning#planning-backlog');
});
