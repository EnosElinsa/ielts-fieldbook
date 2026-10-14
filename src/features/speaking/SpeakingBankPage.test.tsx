import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SpeakingBankPage } from './SpeakingBankPage';

vi.mock('../../context/FieldbookContext', () => ({ useFieldbook: () => ({
  state: { settings: {}, sessions: [], assessments: [], stories: [], speakingTopics: Array.from({ length: 25 }, (_, index) => ({ id: `topic-${index}`, title: `Topic ${index + 1}`, part: index < 15 ? '1' : '2', questions: ['A question?'] })) },
}) }));
function Location() { return <output aria-label="Current URL">{useLocation().search}</output>; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); });

test('topic pagination spans Parts without losing matches and resets on filtering', () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  render(<MemoryRouter><SpeakingBankPage /><Location /></MemoryRouter>);
  expect(screen.getAllByRole('article')).toHaveLength(12);
  fireEvent.click(screen.getAllByRole('button', { name: 'Next page' })[0]);
  expect(screen.getAllByRole('article')).toHaveLength(12);
  expect(screen.getByRole('heading', { name: 'Topic 13' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Topic 24' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Part' }));
  fireEvent.click(screen.getByRole('option', { name: 'Part 2' }));
  expect(screen.getByLabelText('Current URL')).toHaveTextContent('?part=2');
  expect(screen.getAllByRole('article')).toHaveLength(10);
  expect(screen.queryByText('No topics match.')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search speaking topics' }), { target: { value: 'Unmatched' } });
  expect(screen.getAllByText('No topics match.')).toHaveLength(1);
});
