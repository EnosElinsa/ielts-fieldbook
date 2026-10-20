import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ReviewStartButton } from './VocabularyReviewPlanning';
import type { VocabularyPracticeController } from './useVocabularyPracticeController';

vi.mock('../../context/FieldbookContext', () => ({useFieldbook: () => ({})}));
vi.mock('../planning/StudySchedule', () => ({TaskStartButton: () => <button type="button">Start planned task</button>}));
afterEach(cleanup);

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
