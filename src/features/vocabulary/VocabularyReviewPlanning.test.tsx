import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { ReviewStartButton, ScheduleVocabularyReview } from './VocabularyReviewPlanning';
import type { VocabularyPracticeController } from './useVocabularyPracticeController';

const mocks=vi.hoisted(()=>({changePlan:vi.fn()}));
vi.mock('../../context/FieldbookContext', () => ({useFieldbook: () => ({changePlan:mocks.changePlan})}));
vi.mock('../planning/StudySchedule', () => ({TaskStartButton: () => <button type="button">Start planned task</button>}));
afterEach(cleanup);

test('scheduled review saves the themed date and word selection, locking both while saving',async()=>{
  let finish:(value:boolean)=>void=()=>{};
  mocks.changePlan.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const controller={mode:'dictation',dueOnly:false,wrongOnly:false,filter:{},customCardIds:null,queue:[{entryId:'word',senseId:'meaning'}],preferences:{sessionSize:10,order:'source'}} as unknown as VocabularyPracticeController;
  render(<ScheduleVocabularyReview controller={controller}/>);
  await userEvent.click(screen.getByRole('button',{name:'Arrange this review for a date'}));
  await userEvent.click(screen.getByRole('button',{name:'Study date'}));
  const today=new Date(),chosen=new Date(today.getFullYear(),today.getMonth(),today.getDate()===1?2:1);
  await userEvent.click(screen.getByRole('button',{name:`${chosen.getDate()} ${chosen.toLocaleDateString('en-GB',{month:'long'})} ${chosen.getFullYear()}`}));
  await userEvent.click(screen.getByRole('combobox',{name:'Word selection'}));
  await userEvent.click(screen.getByRole('option',{name:'Keep this exact question list'}));
  await userEvent.click(screen.getByRole('button',{name:'Save review task'}));
  expect(screen.getByRole('button',{name:'Study date'})).toBeDisabled();
  expect(screen.getByRole('combobox',{name:'Word selection'})).toBeDisabled();
  expect(mocks.changePlan).toHaveBeenCalledWith(null,expect.objectContaining({binding:'frozen',cards:[{entryId:'word',senseId:'meaning'}],dateKey:`${chosen.getFullYear()}-${String(chosen.getMonth()+1).padStart(2,'0')}-${String(chosen.getDate()).padStart(2,'0')}`}),{onError:expect.any(Function)});
  finish(true);
  expect(await screen.findByRole('status')).toHaveTextContent('Review task saved.');
});

test('choosing a planned task closes the matching dialog when its route becomes active', async () => {
  const controller = {
    planRequested:false,study:false,mode:'dictation',dueOnly:true,wrongOnly:false,filter:{},
    queue:[{entryId:'word',senseId:'meaning'}],catalogReady:true,localDrafts:{ready:true},begin:vi.fn(),
    state:{plans:[{id:'plan',kind:'vocabulary',title:'Planned recall',status:'pending',target:{type:'vocabulary',mode:'due-review',assessmentMode:'dictation',binding:'frozen',cards:[{entryId:'word',senseId:'meaning'}]}}]},
  } as unknown as VocabularyPracticeController;
  const view=render(<ReviewStartButton controller={controller} disabled={false} label="Start session"/>);
  fireEvent.click(screen.getByRole('button',{name:'Start session'}));
  expect(screen.getByRole('dialog',{name:'Link to a planned review?'})).toBeVisible();
  view.rerender(<ReviewStartButton controller={{...controller,planRequested:true}} disabled={false} label="Start session"/>);
  await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Link to a planned review?'})).not.toBeInTheDocument());
  expect(controller.begin).not.toHaveBeenCalled();
});
