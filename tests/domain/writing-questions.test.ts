import { expect, test } from 'vitest';
import { normalizeWritingQuestion } from '../../src/domain/writingQuestions';

const imported = (id: string, prompt: string, extra = {}) => ({ id, source: `https://www.ieltscb.com/WriteQuestion/getPartWriteInfo?chapters_id=${id}`, prompt, ...extra });

test.each([
  ['1219', 'tablesshow · Staten lsland', 'tables show · Staten Island'],
  ['1221', 'site ofa farm · byselecting', 'site of a farm · by selecting'],
  ['1225', 'the mail features', 'the main features'],
  ['1091', 'fordifferent · period2000 · andmake', 'for different · period 2000 · and make'],
  ['1100', 'andmake', 'and make'], ['1058', 'T he diagram', 'The diagram'],
  ['699', 'T he charts · inownership · houseworkin', 'The charts · in ownership · housework in'],
  ['717', 'anairport', 'an airport'], ['760', 'Thetable', 'The table'],
  ['765', 'selectingand', 'selecting and'], ['1003', 'dioxide(CO2)', 'dioxide (CO2)'],
  ['1014', 'The table below show changes afterit opened.', 'The table below shows changes after it opened.'],
  ['955', 'seconachart · comparisonswhere', 'second chart · comparisons where'],
  ['1220', 'human right, Therefore', 'human right. Therefore'],
  ['1222', 'I n many countries · primaryand · oflong · ofshorter', 'In many countries · primary and · of long · of shorter'],
  ['1224', 'everyyear', 'every year'], ['1092', 'agood thing · ownknowledge', 'a good thing · own knowledge'],
  ['1101', 'alonger weekend', 'a longer weekend'], ['695', 'Wr ite about', 'Write about'],
  ['718', 'drinkproducts', 'drink products'], ['743', 'often toId', 'often told'],
  ['752', 'bestto accept', 'best to accept'],
  ['787', 'organisationWhy might this be the caseWhat are the disadvantages?', 'organisation. Why might this be the case? What are the disadvantages?'],
  ['796', 'problemsTo what extent?', 'problems. To what extent?'], ['1037', 'sim ilar', 'similar'],
  ['954', 'technologyIn what ways? Relationships people makeHas this changed?', 'technology. In what ways? Relationships people make? Has this changed?'],
])('repairs the verified transcription fragments in imported question %s', (id, before, after) => {
  expect(normalizeWritingQuestion(imported(id, before)).prompt).toBe(after);
});

test('paragraphs, punctuation and ordinary spaces preserve measurements, dates and abbreviations', () => {
  const question = imported('1342', 'The U.S. chart\u00a0shows 1,000.5 jobs,people and CO2 in 1960–2020.Summarise the information by selecting the main features.');
  const result = normalizeWritingQuestion(question);
  expect(result.prompt).toBe('The U.S. chart shows 1,000.5 jobs, people and CO2 in 1960–2020.\n\nSummarise the information by selecting the main features.');
  expect(normalizeWritingQuestion(result)).toEqual(result);
  expect(question.prompt).toContain('\u00a0');
});

test('removes only the verified duplicated guidance and fixes the incorrect Task 2 chart category', () => {
  const reasons = 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.';
  const result = normalizeWritingQuestion(imported('728', `Discuss housing. ${reasons}\u00a0 ${reasons}`));
  expect(result.prompt).toBe(`Discuss housing.\n\n${reasons}`);
  expect(normalizeWritingQuestion(imported('1347', 'Discuss studying abroad.', { type: '2', format: '柱状图', name: 'C21T3 柱状图' }))).toMatchObject({ type: '2', format: '教育类', name: 'C21T3 教育类' });
});

test('personal and sample questions and mismatched source identities remain literal', () => {
  for (const source of ['', 'https://example.com/?chapters_id=1225', 'https://www.ieltscb.com/WriteQuestion/getPartWriteInfo?chapters_id=other']) {
    const question = { id: '1225', source, prompt: 'My term is the mail features,with  spaces.' };
    expect(normalizeWritingQuestion(question)).toBe(question);
  }
});
