import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ExamStimulus, examStimulusBlockIds, hasVisualStimulus, examWordLimitLabel } from './ExamPracticePage';
import { stimulusDocument } from './stimulusDocument';

afterEach(cleanup);

test('nbsp spacers beside an image are hidden without moving any saved block ID', () => {
  const html = '<p>\u00a0\u00a0\u00a0<img src="exam-asset:image:map"> Caption</p><div><span>\u00a0\u00a0</span><img src="exam-asset:image:map2"></div><p>After</p>';
  const { container } = render(<ExamStimulus html={html} blockPrefix="stim" />);
  expect(container.textContent).not.toContain('\u00a0');
  const rendered = [...container.querySelectorAll('[data-source-block]')].map(node => node.getAttribute('data-source-block'));
  // Caption keeps child index 2 even though the spacer before the image renders nothing.
  expect(rendered).toEqual(['stim:0-2:0', 'stim:2-0:0']);
  expect(container.querySelector('[data-source-block="stim:0-2:0"]')).toHaveTextContent('Caption');
  const eligible = examStimulusBlockIds(html, 'stim');
  expect(eligible).toEqual(expect.arrayContaining(rendered as string[]));
  expect(eligible).toContain('stim:0-0:0');
});

test('whitespace beside prose and consecutive distinct images is untouched; identical consecutive images collapse', () => {
  const same = render(<ExamStimulus html={'<p><img src="exam-asset:image:a"><img src="exam-asset:image:a"></p>'} />);
  expect(same.container.querySelectorAll('.exam-missing-image')).toHaveLength(1);
  cleanup();
  const different = render(<ExamStimulus html={'<p><img src="exam-asset:image:a"> <img src="exam-asset:image:b"></p>'} />);
  expect(different.container.querySelectorAll('.exam-missing-image')).toHaveLength(2);
  cleanup();
  const prose = render(<ExamStimulus html={'<p><strong>One</strong> <em>two</em></p>'} blockPrefix="p" />);
  expect(prose.container.querySelector('p')).toHaveTextContent('One two');
});

test('orphaned source carets and the A-l typo are repaired in text only', () => {
  const html = '<p>^^^^^_<strong>Heading</strong>_^^^^^</p><p>Choose from A-l below.</p><p>Gap [1 ____] and A-Z</p>';
  const parsed = stimulusDocument(html);
  expect(parsed.body.textContent).toBe('Heading' + 'Choose from A-I below.' + 'Gap [1 ____] and A-Z');
  expect(parsed.body.querySelectorAll('p')).toHaveLength(3);
  expect(parsed.body.querySelector('strong')?.textContent).toBe('Heading');
  const { container } = render(<ExamStimulus html={html} blockPrefix="c" />);
  expect(container).not.toHaveTextContent('^');
  expect(container).toHaveTextContent('A-I below');
  // The block IDs come from the same node tree as the unrepaired document.
  const raw = new DOMParser().parseFromString(html, 'text/html');
  expect(parsed.body.childNodes.length).toBe(raw.body.childNodes.length);
  expect(examStimulusBlockIds(html, 'c')).toContain('c:1-0:0');
});

test('matching questions with an embedded diagram count as visual stimuli', () => {
  expect(hasVisualStimulus({ type: 'map', stimulusHtml: '' })).toBe(true);
  expect(hasVisualStimulus({ type: 'matching', stimulusHtml: '<p><img src="exam-asset:image:4cac61cfb02676134e16e304"></p>' })).toBe(true);
  expect(hasVisualStimulus({ type: 'matching', stimulusHtml: '<p>Plain list</p>' })).toBe(false);
  expect(hasVisualStimulus({ type: 'matching' })).toBe(false);
});

test('word limit labels mention a permitted number', () => {
  expect(examWordLimitLabel({ maxWords: 1, instructions: 'ONE WORD AND/OR A NUMBER' })).toBe('Maximum 1 word and/or a number');
  expect(examWordLimitLabel({ maxWords: 2, instructions: 'NO MORE THAN TWO WORDS AND/OR A NUMBER' })).toBe('Maximum 2 words and/or a number');
  expect(examWordLimitLabel({ maxWords: 2, instructions: 'NO MORE THAN TWO WORDS' })).toBe('Maximum 2 words');
  expect(examWordLimitLabel({ instructions: '' })).toBe('');
  expect(screen.queryByText('Maximum 1 word')).toBeNull();
});
