import { expect, test } from 'vitest';
import type { ExamPassage, ExamQuestion } from '../../domain/exam/types';
import { evidenceSentenceId, locateQuestionEvidence } from './evidenceLocation';
import type { ExamSection } from '../../domain/exam/types';

const passage = { id: 'p', sectionId: 's', paragraphs: [
  { id: 'marker', text: 'A 14' }, { id: 'one', text: 'The garden’s gates opened in 1990.' }, { id: 'two', text: 'Visitors came from all around the world.' },
  { id: 'markerB', text: 'B 15' }, { id: 'three', text: 'The trees survived for many more years.' },
] } as ExamPassage;
const question = { skill: 'reading', sectionId: 's', evidence: {} } as ExamQuestion;

test('exact evidence spans imported sentence fragments and preserves original offsets', () => {
  expect(locateQuestionEvidence({ ...question, evidence: { text: "garden's gates opened in 1990. Visitors came" } }, [passage])).toEqual({ status: 'exact', ranges: { 'passage:p:one': [{ start: 4, end: 34 }], 'passage:p:two': [{ start: 0, end: 13 }] } });
});
test('paragraph-only evidence highlights the real paragraph, excluding hidden markers', () => {
  const result = locateQuestionEvidence({ ...question, evidence: { text: 'Paragraph B' } }, [passage]);
  expect(result.status).toBe('paragraph'); expect(Object.keys(result.ranges)).toEqual(['passage:p:three']);
  expect(locateQuestionEvidence({ ...question, evidence: { paragraphId: 'markerB' } }, [passage]).ranges).toEqual(result.ranges);
});
test('source typos highlight only reliably matched clauses and report partial evidence', () => {
  const result = locateQuestionEvidence({ ...question, evidence: { text: 'The trees survived for many more years. The garden closed in 1900.' } }, [passage]);
  expect(result.status).toBe('partial'); expect(Object.keys(result.ranges)).toEqual(['passage:p:three']);
});
test('missing and ambiguous evidence does not mark unrelated source text', () => {
  expect(locateQuestionEvidence({ ...question, evidence: { text: 'Wrong quote.' } }, [passage]).status).toBe('missing');
  const duplicate = { ...passage, id: 'other' };
  expect(locateQuestionEvidence({ ...question, evidence: { text: 'The trees survived for many more years.' } }, [passage, duplicate]).status).toBe('missing');
});

test('obsolete listening sentence IDs resolve to the matching real transcript, excluding speaker labels', () => {
  const question = { id: 'q', skill: 'listening', sectionId: 's', evidence: { sentenceId: 'obsolete', text: "KATIE: The original recording talks about film adaptations." } } as ExamQuestion;
  const section = { id: 's', sentences: [{ id: 'actual', text: 'The original recording talks about film adaptations.', questionIds: [] }] } as unknown as ExamSection;
  expect(locateQuestionEvidence(question, [], section).status).toBe('exact');
  expect(evidenceSentenceId(question, section)).toBe('actual');
});
