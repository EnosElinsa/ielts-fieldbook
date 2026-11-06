import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { StoriesPage } from './StoriesPage';
const identity = vi.hoisted(() => ({owner:'one'}));
vi.mock('../../storage/remote', () => ({accountId: () => identity.owner}));
vi.mock('../../context/FieldbookContext', () => ({useFieldbook: () => ({
  state:{speakingTopics:[],stories:[{id:'one',title:'Mountain trip',event:'A quiet hike',tags:['Travel'],topicIds:[],createdAt:'2026-10-10'}]},
})}));
beforeEach(() => {sessionStorage.clear(); identity.owner='one';});
afterEach(() => cleanup());
test('story filters return after remount and remain isolated between accounts', async () => {
  const user = userEvent.setup(); const first=render(<StoriesPage />);
  await user.type(screen.getByRole('textbox', {name:'Search stories'}), 'Mountain');
  await user.click(screen.getByRole('button', {name:'Story theme'}));
  await user.click(screen.getByRole('option', {name:'Travel'}));
  first.unmount(); const restored=render(<StoriesPage />);
  expect(screen.getByRole('textbox', {name:'Search stories'})).toHaveValue('Mountain');
  expect(screen.getByRole('button', {name:'Story theme'})).toHaveTextContent('Travel');
  identity.owner='two'; restored.rerender(<StoriesPage />);
  expect(screen.getByRole('textbox', {name:'Search stories'})).toHaveValue('');
  expect(screen.getByRole('button', {name:'Story theme'})).toHaveTextContent('All themes');
});

test('story cards keep one primary Practise action and name their icon actions', () => {
  const view = render(<StoriesPage />);
  const card = view.container.querySelector('.story-card') as HTMLElement;
  expect(card.querySelectorAll('.btn.primary')).toHaveLength(1);
  expect(within(card).getByRole('button', { name: 'Practise' })).toHaveClass('primary');
  expect(within(card).getByRole('button', { name: 'Edit Mountain trip' })).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Delete Mountain trip' })).toBeInTheDocument();
  expect(within(card).getByText('Fits 0 topics')).toBeInTheDocument();
});
