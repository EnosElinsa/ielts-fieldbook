import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { LearningTaskDetails } from './LearningTaskDetails';
import type { StudyPlan } from '../../domain/plans';
afterEach(cleanup);
const plan=(allocation?:unknown)=>({id:'short',schemaVersion:2,origin:'automatic',status:'pending',target:{type:'vocabulary',mode:'learning-batch',selectionPolicy:'exact',bookId:'book',unitId:'unit',entryIds:Array.from({length:9},(_,i)=>`word-${i}`),allocation}} as StudyPlan);
test.each([
  [{batchSize:10,sourceRemaining:9,dailyRemaining:10,minutesRemaining:15},/Only 9 eligible new words remained/],
  [{batchSize:10,sourceRemaining:20,dailyRemaining:9,minutesRemaining:15},/9 words remained in the daily new-word goal/],
  [{batchSize:10,sourceRemaining:20,dailyRemaining:10,minutesRemaining:9},/remaining vocabulary time allowed 9 words/],
] as const)('explains only the recorded limiting constraint: %j',(allocation,message)=>{
  const {container}=render(<LearningTaskDetails plan={plan(allocation)} batchSize={10}/>);
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(container.querySelectorAll('p')).toHaveLength(1);
});
test('older automatic tasks do not invent an allocation reason',()=>{
  render(<LearningTaskDetails plan={plan()} batchSize={10}/>);
  expect(screen.getByText(/saved selection of 9 words/)).toBeInTheDocument();
  expect(screen.getByText(/original size limit was not recorded/)).toBeInTheDocument();
  expect(screen.queryByText(/Only 9 eligible/)).not.toBeInTheDocument();
});
test('starting a task keeps the recorded reason tied to its original allocation',()=>{
  const task=plan({batchSize:10,sourceRemaining:9,dailyRemaining:20,minutesRemaining:20});
  task.status='in_progress';task.startedAt='2026-11-17T12:00:00Z';
  render(<LearningTaskDetails plan={task} batchSize={20}/>);
  expect(screen.getByText(/Only 9 eligible new words remained/)).toBeInTheDocument();
});
