import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ExamStimulus, examStimulusBlockIds } from './ExamPracticePage';

afterEach(cleanup);

test('flat imported notes have distinct section headings and answer rows while annotation anchors stay stable', () => {
  const html = '<p><em>Complete the notes below.</em></p><div><span>Wildlife</span></div><p><span>Appearance</span><br>· a broad <strong>[1 ____]</strong><br><span>Movement</span><br>· use their <strong>[2 ____]</strong> to turn</p>';
  const {container} = render(<ExamStimulus html={html} blockPrefix="notes" renderGap={number=><input aria-label={`Answer ${number}`}/>} />);
  expect(container.querySelector('.exam-note-title')).toHaveTextContent('Wildlife');
  expect([...container.querySelectorAll('.exam-note-section-title')].map(node=>node.textContent)).toEqual(['Appearance','Movement']);
  expect(container.querySelectorAll('.exam-note-item')).toHaveLength(2);
  expect(container.querySelector('.exam-note-item')).toContainElement(screen.getByRole('textbox',{name:'Answer 1'}));
  const oldBlocks = examStimulusBlockIds(html,'notes');
  for (const node of container.querySelectorAll('[data-source-block]')) expect(oldBlocks).toContain(node.getAttribute('data-source-block'));
});

test('imported table line fragments reflow as spaced sentences and keep their source block IDs', () => {
  const html = '<table><tbody><tr><td><p><span>At the top of</span></p><p><span>a</span> <strong>[6 ____]</strong></p><p><br></p><p>Another detail</p></td></tr></tbody></table>';
  const { container } = render(<ExamStimulus html={html} blockPrefix="table" />);
  expect(container.querySelector('td')).toHaveTextContent('At the top of a [6 ____] Another detail');
  expect([...container.querySelectorAll('[data-source-block]')].map(node => node.getAttribute('data-source-block')))
    .toEqual(examStimulusBlockIds(html, 'table').filter(id => container.querySelector(`[data-source-block="${id}"]`)));
});

test('known restaurant import typos are repaired without changing gap numbers or answers', async () => {
  // Imported Cambridge 20 Test 1 table. Q9's cached transcript says £30 a head;
  // its answer is 30, so the pound sign and "per person" belong outside its gap.
  const html = '<table><tbody><tr><td>The Junction</td><td>Paloma</td><td><p>A limited <span>selectionof <strong>[4 ____]</strong> ....food on the menu</span></p><p><span>Set lunch costs</span> <span>9 </span><span>£</span> <span><strong>[9 ____]</strong> person</span></p></td></tr></tbody></table>';
  const { container } = render(<ExamStimulus html={html} renderGap={number => <span><input aria-label={`Answer ${number}`} /><button aria-label={`Notes ${number}`}>Notes</button></span>} />);
  expect(container).toHaveTextContent('A limited selection of');
  expect(container).toHaveTextContent('food on the menu');
  expect(container).not.toHaveTextContent('....food');
  expect(container).toHaveTextContent('Set lunch costs £');
  expect(container).toHaveTextContent('per person');
  expect(container).not.toHaveTextContent('costs 9');
  expect([...container.querySelectorAll('[data-exam-gap]')].map(node => node.getAttribute('data-exam-gap'))).toEqual(['4', '9']);
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'Answer 9' }), '30');
  expect(screen.getByRole('textbox', { name: 'Answer 9' })).toHaveValue('30');
  screen.getByRole('button', { name: 'Notes 9' }).focus();
  expect(screen.getByRole('button', { name: 'Notes 9' })).toHaveFocus();
});

test('unrelated source wording and legitimate prices retain their original text', () => {
  const html = '<p>A selectionof rare names costs 9 £ per person.</p><p>Dots .... and references [4] remain.</p>';
  const { container } = render(<ExamStimulus html={html} />);
  expect(container).toHaveTextContent('A selectionof rare names costs 9 £ per person.');
  expect(container).toHaveTextContent('Dots .... and references [4] remain.');
});
