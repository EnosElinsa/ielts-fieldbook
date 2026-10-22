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

test('day summary separates time estimates and the actual new-word allocation with a settings shortcut',async()=>{
 Object.assign(mocks.state.settings,{dailyMinutes:90,days:[1,2,3,4,5,6,7]});
 mocks.state.settings.planning.newWordsPerDay=15;
 mocks.state.settings.vocabulary.learningBatchSize=10;
 const vocabulary={id:'partial-batch',dateKey:dateKey(new Date()),status:'pending',skill:'vocabulary',origin:'manual',title:'Vocabulary - Learn 10 words',estimatedMinutes:30,target:{type:'vocabulary',mode:'learning-batch',assessmentMode:'definition',batchIndex:1,batchSize:10,cards:Array.from({length:7},(_,i)=>({entryId:`word-${i}`,senseId:'meaning'}))}};
 mocks.state.plans=[vocabulary,{...mocks.state.plans[0],status:'completed'},...['skipped','held','archived'].map(id=>({...mocks.state.plans[0],id,estimatedMinutes:100,...(id==='skipped'?{status:'skipped'}:id==='held'?{onHold:true}:{archivedAt:'2026-10-16T12:00:00Z'})}))];
 const {container}=mount();const day=within(container.querySelector('.study-day'));
 const summary=day.getByRole('group',{name:'Daily plan summary'});
 expect(summary).toHaveTextContent('Planned time50 / 90 min40 min free');
 expect(summary).toHaveTextContent('Completed20 min30 min remaining');
 expect(summary).toHaveTextContent('New words7 / 158 below daily goal');
 expect(day.getByRole('heading',{name:'Vocabulary - Learn 7 words'})).toBeInTheDocument();
 expect(day.getByRole('button',{name:'Task actions: Vocabulary - Learn 7 words'})).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Adjust vocabulary plan'})).toHaveAttribute('href','/settings/vocabulary');
 expect(screen.getByText('15/day')).toBeInTheDocument();
 expect(screen.getByText('Up to 10 words/batch')).toBeInTheDocument();
 expect(screen.queryByText(/fewer than target \(budget or source availability\)/)).not.toBeInTheDocument();
 await userEvent.click(screen.getByText('How daily targets work'));
 expect(screen.getByText(/Time for reviews and available new words can reduce the actual allocation/)).toBeVisible();
});

test('manual rest-day tasks show extra time without a false new-word deficit',()=>{
 mocks.state.settings.days=[];
 const {container}=mount();const summary=within(container.querySelector('.study-day')).getByRole('group',{name:'Daily plan summary'});
 expect(summary).toHaveTextContent('Planned time20 / 0 min20 min extra');
 expect(summary).toHaveTextContent('No daily goal on rest days');
 expect(summary).not.toHaveTextContent(/below daily goal/);
});

test('a zero new-word goal is presented as paused automatic learning',()=>{
 mocks.state.settings.days=[1,2,3,4,5,6,7];mocks.state.settings.planning.newWordsPerDay=0;
 const {container}=mount();const summary=within(container.querySelector('.study-day')).getByRole('group',{name:'Daily plan summary'});
 expect(summary).toHaveTextContent('Automatic learning paused');
 expect(summary).not.toHaveTextContent(/below daily goal/);
});
async function taskAction(name){
  await userEvent.click(screen.getByRole('button',{name:'Task actions: Chart'}));
  await userEvent.click(screen.getByRole('menuitem',{name}));
}
test('calendar includes seven days, rest days and overdue tasks',async()=>{
  mocks.state.plans.push({...mocks.state.plans[0],id:'overdue',dateKey:'2020-01-01',title:'Old task'});
  const {container}=mount();expect(container.querySelectorAll('.study-day')).toHaveLength(7);
  expect(await screen.findAllByText('Rest day')).toHaveLength(1);expect(await screen.findAllByText('No tasks yet. Add a task or adjust your plan settings.')).toHaveLength(5);await userEvent.click(screen.getByRole('button',{name:/Waiting ·/}));expect(screen.getByRole('heading',{name:'Old task'})).toBeInTheDocument();
});
test('the settings shortcut opens waiting tasks directly',async()=>{
  mocks.state.plans.push({...mocks.state.plans[0],id:'waiting',dateKey:'2020-01-01',title:'Waiting task'});
  render(<MemoryRouter initialEntries={['/planning?view=waiting']}><PlanningPage/></MemoryRouter>);
  expect(await screen.findByRole('heading',{name:'Waiting task'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Waiting · 1'})).toHaveAttribute('aria-pressed','true');
  expect(screen.queryByRole('navigation',{name:'Schedule dates'})).not.toBeInTheDocument();
});
test.each([
  ['2026-10-17','17 – 23 Oct 2026','24 – 30 Oct 2026','10 – 16 Oct 2026'],
  ['2026-10-28','28 Oct – 3 Nov 2026','4 – 10 Nov 2026','21 – 27 Oct 2026'],
  ['2026-12-28','28 Dec 2026 – 3 Jan 2027','4 – 10 Jan 2027','21 – 27 Dec 2026'],
])('week navigation preserves seven-day ranges around %s',async(date,initial,next,previous)=>{
  vi.setSystemTime(new Date(`${date}T12:00:00`));
  mocks.state.plans[0].dateKey=date;
  const {container}=mount();
  const navigation=within(screen.getByRole('navigation',{name:'Schedule dates'}));
  expect(navigation.getByText(initial)).toBeInTheDocument();
  await userEvent.click(navigation.getByRole('button',{name:'Next week'}));
  expect(navigation.getByText(next)).toBeInTheDocument();
  expect(container.querySelectorAll('.study-day')).toHaveLength(7);
  expect(screen.queryByRole('heading',{name:'Chart'})).not.toBeInTheDocument();
  await userEvent.click(navigation.getByRole('button',{name:'Today'}));
  expect(navigation.getByText(initial)).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Chart'})).toBeInTheDocument();
  await userEvent.click(navigation.getByRole('button',{name:'Previous week'}));
  expect(navigation.getByText(previous)).toBeInTheDocument();
  await userEvent.click(navigation.getByRole('button',{name:'Next week'}));
  expect(navigation.getByText(initial)).toBeInTheDocument();
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
  await userEvent.click(screen.getByRole('button',{name:'History',exact:true}));await userEvent.click(screen.getByRole('button',{name:'Restore task'}));await userEvent.click(screen.getByRole('button',{name:'Save change'}));expect(mocks.change).toHaveBeenLastCalledWith('task',expect.objectContaining({type:'restore'}),{onError:expect.any(Function)});
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
  const view=mount();await screen.findAllByRole('button',{name:'Start'});
  expect(view.container.querySelector('#task-task')).toHaveAttribute('tabindex','-1');
});

test('waiting selection protects started tasks and keeps failed bulk saves retryable',async()=>{
 mocks.state.plans.push({id:'old',dateKey:'2020-01-01',status:'pending',skill:'writing',kind:'1',title:'Old pending',estimatedMinutes:20},{id:'started',dateKey:'2020-01-02',status:'in_progress',startedAt:'2020-01-02',skill:'writing',kind:'1',title:'Old started',estimatedMinutes:20});
 mount();await userEvent.click(screen.getByRole('button',{name:/Waiting ·/}));
 expect(screen.getByRole('checkbox',{name:'Select Old pending'})).not.toBeChecked();
 expect(screen.getByRole('checkbox',{name:'Select Old started'})).toBeDisabled();
 await userEvent.click(screen.getByRole('button',{name:'Select this page'}));
 await userEvent.click(screen.getByRole('button',{name:'Preview skip'}));
 expect(screen.getByRole('dialog',{name:'Review task changes'})).toHaveTextContent('Old pending');
 mocks.bulk.mockResolvedValueOnce(false);await userEvent.click(screen.getByRole('button',{name:'Save task changes'}));expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i);
 await userEvent.click(screen.getByRole('button',{name:'Save task changes'}));expect(mocks.bulk).toHaveBeenCalledTimes(2);
});

test('automatic replan preview distinguishes selected tasks from related schedule changes',async()=>{
 Object.assign(mocks.state.settings,{dailyMinutes:30,days:[1,2,3,4,5,6,7],skills:['writing'],planning:{vocabularyMode:'ratio',vocabularyPercent:0,newWordsPerDay:0,carryoverPercent:30}});
 mocks.state.plans=[{id:'study-2026-10-17-slot-1',dateKey:'2026-10-17',status:'pending',origin:'automatic',schemaVersion:2,skill:'writing',kind:'1',title:'Original automatic work',estimatedMinutes:30},{id:'waiting',dateKey:'2026-10-16',status:'pending',origin:'manual',skill:'writing',kind:'1',title:'Selected waiting work',estimatedMinutes:6,target:{type:'question'}}];
 mount();await userEvent.click(screen.getByRole('button',{name:/Waiting ·/}));
 await userEvent.click(screen.getByRole('checkbox',{name:'Select Selected waiting work'}));
 await userEvent.click(screen.getByRole('button',{name:'Preview automatic replan'}));
 const dialog=screen.getByRole('dialog',{name:'Review task changes'});
 expect(within(dialog).getAllByText('Selected task')).toHaveLength(1);
 expect(within(dialog).getAllByText('Related schedule change').length).toBeGreaterThan(0);
 expect(dialog).toHaveTextContent('30 → 24 min');
 expect(dialog).toHaveTextContent('Added to schedule');
});

test('history keeps skipped identities and restores only through an explicit dated action',async()=>{
 mocks.state.plans.push({id:'skipped-old',dateKey:'2020-01-01',status:'skipped',skipReason:'bulk-skip',skill:'writing',title:'Skipped old task',estimatedMinutes:20});
 mount();await userEvent.click(screen.getByRole('button',{name:'History',exact:true}));
 expect(screen.getByRole('heading',{name:'Skipped old task'})).toBeInTheDocument();
 await userEvent.click(screen.getByRole('button',{name:'Restore task'}));expect(screen.getByRole('dialog',{name:'Restore task'})).toBeInTheDocument();
});

test('history pagination locates a deep link and separates user skips from system handling',async()=>{
  mocks.state.plans=Array.from({length:25},(_,index)=>({id:`history-${index}`,dateKey:`2020-01-${String(index+1).padStart(2,'0')}`,status:'skipped',skipReason:index===24?'no-longer-due':'user-skipped',skill:'vocabulary',title:`History item ${index}`,estimatedMinutes:1}));
  render(<MemoryRouter initialEntries={['/planning#task-history-0']}><PlanningPage/></MemoryRouter>);
  expect(await screen.findByRole('heading',{name:'History item 0'})).toBeInTheDocument();
  expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('combobox',{name:'Status'}));
  await userEvent.click(screen.getByRole('option',{name:'Skipped by you'}));
  expect(screen.queryByRole('heading',{name:'History item 24'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('combobox',{name:'Status'}));
  await userEvent.click(screen.getByRole('option',{name:'System handled'}));
  expect(screen.getByRole('heading',{name:'History item 24'})).toBeInTheDocument();
});

test('waiting distinguishes this-page selection from all filtered tasks before a bulk preview',async()=>{
  mocks.state.plans=Array.from({length:25},(_,index)=>({id:`waiting-${index}`,dateKey:'2020-01-01',status:'pending',origin:'manual',skill:'writing',kind:'1',title:`Waiting item ${index}`,estimatedMinutes:5}));
  mount();await userEvent.click(screen.getByRole('button',{name:/Waiting ·/}));
  await userEvent.click(screen.getByRole('button',{name:'Select this page'}));
  expect(screen.getAllByRole('checkbox',{checked:true})).toHaveLength(20);
  await userEvent.click(screen.getByRole('button',{name:'Select all filtered results'}));
  await userEvent.click(screen.getByRole('button',{name:'Preview hold'}));
  expect(screen.getByRole('dialog')).toHaveTextContent('25 selected tasks · 0 related schedule changes');
  expect(mocks.bulk).not.toHaveBeenCalled();
});

test('system-handled history excludes archived tasks and still offers an explicit archive filter',async()=>{
  mocks.state.plans=[
    {id:'visible',dateKey:'2020-01-01',status:'skipped',skipReason:'no-longer-due',origin:'automatic',skill:'vocabulary',title:'Current decision',estimatedMinutes:1},
    {id:'archived',dateKey:'2020-01-01',status:'skipped',skipReason:'no-longer-due',origin:'automatic',archivedAt:'2020-02-01T00:00:00Z',skill:'vocabulary',title:'Archived decision',estimatedMinutes:1},
  ];
  mount();await userEvent.click(screen.getByRole('button',{name:'History',exact:true}));
  await userEvent.click(screen.getByRole('combobox',{name:'Status'}));
  await userEvent.click(screen.getByRole('option',{name:'System handled'}));
  expect(screen.getByRole('heading',{name:'Current decision'})).toBeInTheDocument();
  expect(screen.queryByRole('heading',{name:'Archived decision'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('combobox',{name:'Status'}));
  await userEvent.click(screen.getByRole('option',{name:'Archived'}));
  expect(screen.getByRole('heading',{name:'Archived decision'})).toBeInTheDocument();
  expect(screen.queryByRole('heading',{name:'Current decision'})).not.toBeInTheDocument();
});
