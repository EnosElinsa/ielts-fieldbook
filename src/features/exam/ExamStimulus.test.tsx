import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ExamStimulus, examStimulusBlockIds } from './ExamPracticePage';

afterEach(cleanup);

test('twins matching instructions retain the opening word and spacing between imported fragments', () => {
  const html = '<div><p><span>ook at the following statements (Questions 5-9) and the list of researchers below.</span></p><p><span>NB </span><span>Y</span><span>ou may use any letter more than once.</span></p></div><p><strong>List of Researchers: </strong></p>';
  const { container } = render(<ExamStimulus html={html} />);
  expect(container).toHaveTextContent('Look at the following statements');
  expect(container).toHaveTextContent('NB You may use any letter more than once.');
});

test('imported letter bank keeps each label separated from its word', () => {
  const html = '<p>Epigenetic processes</p><table><tbody><tr><td><p><span>A</span><span> nurture     </span><span>B</span><span> organs     </span><span>C</span><span> code</span></p><p><span>D</span><span> chemicals     </span><span>E</span><span> environment     </span><span>F</span><span> behaviour/behavior</span></p></td></tr></tbody></table>';
  const { container } = render(<ExamStimulus html={html} />);
  expect(container).toHaveTextContent('A nurture');
  expect(container).toHaveTextContent('B organs');
  expect(container).toHaveTextContent('F behaviour/behavior');
  const bank = screen.getByRole('list', { name: 'Answer choices' });
  expect(bank.querySelectorAll('li')).toHaveLength(6);
  expect(bank.querySelector('li')).toHaveTextContent('A nurture');
  expect(container.querySelector('table')).toBeNull();
  const blocks = examStimulusBlockIds(html, 'stimulus');
  for (const node of bank.querySelectorAll('[data-source-block]')) expect(blocks).toContain(node.getAttribute('data-source-block'));
});

test('letter banks preserve inline word spacing and original annotation text', () => {
  const html = '<table><tbody><tr><td><p><span>  A</span><span> a </span><b>modern</b><span> setting     </span><span>B</span><span> org</span><span>ans   </span><span>C</span><span> code</span></p></td></tr></tbody></table>';
  const { container } = render(<ExamStimulus html={html} blockPrefix="bank" />);
  const options = screen.getAllByRole('listitem');
  expect(options[0]).toHaveTextContent('A a modern setting');
  expect(options[1]).toHaveTextContent('B organs');
  expect(container.querySelector('[data-source-block="bank:0-0-0-0-0-0-0:0"]')).toHaveTextContent('A');
  expect(options[0].querySelector('[data-source-block]')?.textContent).toBe('  A');
});

test('ordinary one-cell tables and multi-column tables retain their table layout', () => {
  const { container } = render(<ExamStimulus html='<table><tbody><tr><td><p>A garden</p><p>B lake</p><p>C city</p></td></tr></tbody></table><table><tbody><tr><td>A</td><td>garden</td></tr></tbody></table>' />);
  expect(container.querySelectorAll('table')).toHaveLength(2);
  expect(screen.queryByRole('list', { name: 'Answer choices' })).not.toBeInTheDocument();
});

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

test('cramped imported bullet lines become native lists without changing source text or annotation offsets', () => {
  const html = '<p><strong>Recommended trips</strong></p><p>·a <strong>[1 ____]</strong> tour<br><span>•</span><span>best day: [2 ____]</span><br>●see the exhibition<br> -opens soon</p>';
  const {container} = render(<ExamStimulus html={html} blockPrefix="notes" renderGap={number=><input aria-label={`Answer ${number}`}/>} />);
  const list = screen.getAllByRole('list')[0];
  expect(list.children).toHaveLength(3);
  expect(list.querySelectorAll('li')).toHaveLength(4);
  expect(list.querySelector('li ul li')).toHaveTextContent('opens soon');
  expect(container.querySelector('[data-source-block="notes:1-0:0"]')?.textContent).toBe('·a ');
  expect(container.querySelector('[data-source-block="notes:1-0:0"] [hidden]')).toHaveTextContent('·');
  expect(container.querySelector('[data-source-block="notes:1-5-0:0"]')?.textContent).toBe('best day: ');
  for (const node of container.querySelectorAll('[data-source-block]')) expect(examStimulusBlockIds(html,'notes')).toContain(node.getAttribute('data-source-block'));
  expect(screen.getByRole('textbox',{name:'Answer 1'})).toBeInTheDocument();
  expect(screen.getByRole('textbox',{name:'Answer 2'})).toBeInTheDocument();
});

test('source punctuation in prose and table cells does not become a note list', () => {
  const {container} = render(<ExamStimulus html='<p>A·B and a - b remain unchanged.</p><table><tr><td>·literal cell</td></tr></table>' />);
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(container).toHaveTextContent('A·B and a - b remain unchanged.');
  expect(container.querySelector('td')).toHaveTextContent('·literal cell');
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
