import { expect, test } from 'vitest';
import type { ExamQuestion } from '../../domain/exam/types';
import { questionReviewContent, sourceEvidenceText } from './questionReview';

const question = { skill: 'listening', type: 'gap', answer: 'clothing' } as ExamQuestion;

test.each(['出题句：\n', '答案句: ', '出处句\n', '出题句 '])('cleans the known label %j while preserving the original wording', label => {
  const quote = 'Threads detach from synthetic clothing.';
  expect(sourceEvidenceText(label + quote)).toBe(quote);
});

test('keeps a distinct English explanation and omits a duplicate source quotation', () => {
  const q = { ...question, evidence: { text: '出题句：\nSynthetic clothing sheds fibres.' } };
  expect(questionReviewContent({ ...q, explanation: 'The blank names the source of the fibres.' })).toMatchObject({ title: 'Answer explanation', explanation: 'The blank names the source of the fibres.', evidence: 'Synthetic clothing sheds fibres.' });
  expect(questionReviewContent({ ...q, explanation: ' Synthetic clothing\n sheds fibres. ' }).explanation).toBe('The quoted transcript uses “clothing”, which supplies the missing answer.');
});

test.each(['无', '第A段最后一句：The garment is clothing.', '出题句：Clothing。这里是中文分析'])('does not manufacture an English quote from mixed commentary %j', text => {
  const result = questionReviewContent({ ...question, explanation: '中文分析', evidence: { text } });
  expect(result.evidence).toBe('');
  expect(result.explanation).toBe('Open the original transcript to compare it with the answer.');
});

test('only explains completion answers that appear as complete words in the quote', () => {
  const evidence = { text: 'Sportswear is washed.' };
  expect(questionReviewContent({ ...question, answer: 'wear', evidence }).explanation).toBe('Compare the answer with this transcript evidence.');
  expect(questionReviewContent({ ...question, answer: ['Sportswear', 'washed'], evidence }).explanation).not.toContain('missing answer');
  expect(questionReviewContent({ ...question, type: 'single', answer: 'A', evidence: { text: 'A source of fibres.' } }).explanation).not.toContain('missing answer');
});

test('reading numeric answers do not invent an incompatible word-limit rule', () => {
  const result = questionReviewContent({ ...question, skill: 'reading', answer: '1990', instructions: 'ONE WORD AND/OR A NUMBER', maxWords: 1, evidence: { text: 'The garden opened in 1990.' } });
  expect(result.explanation).toBe('The quoted passage uses “1990”, which supplies the missing answer.');
});
