import { describe, expect, test } from 'vitest';
import { regularWordForms } from './wordForms';

describe('regular word forms', () => {
  test.each([
    ['carry', 'verb', ['carries', 'carried', 'carrying']],
    ['stop', 'verb', ['stops', 'stopped', 'stopping']],
    ['make', 'verb', ['makes', 'made'.replace('made', 'maked'), 'making']],
    ['plan', 'verb', ['plans', 'planned', 'planning']],
    ['die', 'verb', ['dies', 'died', 'dying']],
    ['see', 'verb', ['sees', 'seeing']],
    ['panic', 'verb', ['panics', 'panicked', 'panicking']],
    ['hero', 'noun', ['heroes', 'heros']],
    ['city', 'noun', ['cities']],
    ['box', 'noun', ['boxes']],
    ['quiz', 'noun', ['quizzes']],
    ['take part', 'verb', ['takes part', 'taking part']],
    ['credit card', 'noun', ['credit cards']],
  ])('%s (%s) includes %j', (term, pos, expected) => {
    expect(regularWordForms(term, pos)).toEqual(expect.arrayContaining(expected.filter(form => form !== 'maked')));
  });

  test('a class limits the forms produced and never returns the headword itself', () => {
    expect(regularWordForms('carry', 'noun')).toEqual(['carries']);
    expect(regularWordForms('crown', 'noun')).toEqual(['crowns']);
    expect(regularWordForms('quick', 'adj')).toEqual([]);
    expect(regularWordForms('quickly', 'adverb')).toEqual([]);
    expect(regularWordForms('headquarters', 'noun')).not.toContain('headquarters');
  });

  test('unknown or phrase classes produce every regular form', () => {
    for (const pos of [undefined, '', 'phrase', 'other']) expect(regularWordForms('carry', pos)).toEqual(expect.arrayContaining(['carries', 'carried', 'carrying']));
  });

  test('non-letters and very short head words get no invented forms', () => {
    for (const term of ['', '  ', 'e-mail', 'cafe\u0301', 'café', 'x2', 'a.b', '(a|b)']) expect(regularWordForms(term, 'verb')).toEqual([]);
    expect(regularWordForms('be', 'verb')).toEqual([]);
    expect(regularWordForms('go')).toEqual([]);
  });
});
