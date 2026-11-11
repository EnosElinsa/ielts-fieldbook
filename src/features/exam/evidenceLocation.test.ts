import { expect, test } from 'vitest';
import type { ExamPassage, ExamQuestion } from '../../domain/exam/types';
import { evidenceSentenceId, locateQuestionEvidence } from './evidenceLocation';
import type { ExamSection } from '../../domain/exam/types';
import cambridge20 from './fixtures/cambridge-20-listening-q7.json';
import laki from './fixtures/cambridge-18-listening-evidence.json';

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

test('Cambridge 20 Test 1 Q7 targets its actual reviews quote despite stale valid sentence and question links', () => {
  const question = cambridge20.question as ExamQuestion;
  const section = cambridge20.section as ExamSection;
  const quotedSentence = section.sentences[46];
  expect(question.answer).toBe('reviews');
  expect(question.evidence?.sentenceId).toBe(section.sentences[49].id);
  expect(section.sentences[49].questionIds).toContain(question.id);
  expect(quotedSentence.text).toContain("it's had excellent reviews from all the newspapers");
  expect(locateQuestionEvidence(question, [], section).status).toBe('exact');
  expect(evidenceSentenceId(question, section)).toBe(quotedSentence.id);
});

test('Cambridge 20 Test 1 Q9 highlights the whole quote including £30 and practises its answer-bearing sentence', () => {
  const question = cambridge20.question9 as ExamQuestion;
  const section = cambridge20.section as ExamSection;
  const location = locateQuestionEvidence(question, [], section);
  expect(location.status).toBe('exact');
  expect(Object.keys(location.ranges)).toEqual(['sentence:source:88909', 'sentence:source:88910']);
  const amountRange = location.ranges['sentence:source:88910'][0];
  expect(section.sentences[53].text.slice(amountRange.start, amountRange.end)).toBe("That's quite reasonable for a top class restaurant: £30 a head.");
  expect(evidenceSentenceId(question, section)).toBe('source:88910');
});

test('currency-tolerant matching still requires the complete unique quote and preserves explicit currencies', () => {
  const quote = "That's quite reasonable for a top class restaurant: 30 a head.";
  const question = { id:'price', sectionId:'s', skill:'listening', type:'gap', answer:'30', evidence:{text:quote} } as ExamQuestion;
  const section = { id:'s', sentences:[{id:'unrelated',text:'The train takes 30 minutes.'},{id:'actual',text:quote.replace('30','£30')}] } as ExamSection;
  expect(evidenceSentenceId(question, section)).toBe('actual');
  const amountOnly = locateQuestionEvidence({...question,evidence:{text:'30 a head.'}},[],section);
  expect(section.sentences[1].text.slice(amountOnly.ranges['sentence:actual'][0].start,amountOnly.ranges['sentence:actual'][0].end)).toBe('£30 a head.');
  expect(locateQuestionEvidence({...question,evidence:{text:quote.replace('30','$30')}},[],section).status).not.toBe('exact');
  expect(locateQuestionEvidence(question,[],{...section,sentences:[...section.sentences,{...section.sentences[1],id:'duplicate'}]}).status).toBe('missing');
});

test('Cambridge 18 Q25–26 locates both explicitly bulleted evidence fragments', () => {
  const question = laki.question as ExamQuestion;
  const section = laki.section as ExamSection;
  const location = locateQuestionEvidence(question, [], section);
  expect(location.status).toBe('exact');
  expect(Object.keys(location.ranges)).toEqual(['sentence:source:76796', 'sentence:source:76797']);
  const quotes = section.sentences.flatMap(sentence => (location.ranges[`sentence:${sentence.id}`] || []).map(range => sentence.text.slice(range.start, range.end)));
  expect(quotes).toEqual(['the effects would go on for so long', 'strange weather events were being reported as far away as North America and North Africa.']);
  expect(evidenceSentenceId(question, section)).toBe('source:76796');
  const repeated = { ...section, sentences: [...section.sentences, { ...section.sentences.find(sentence => sentence.id === 'source:76797')!, id: 'duplicate' }] };
  expect(locateQuestionEvidence(question, [], repeated).status).not.toBe('exact');
  expect(locateQuestionEvidence({ ...question, evidence: { ...question.evidence, text: question.evidence!.text!.replace('North Africa', 'South Africa') } }, [], section).status).not.toBe('exact');
});

test('an imported source-sentence label does not prevent an exact transcript match', () => {
  const quote = 'Threads detach from synthetic clothing during washing.';
  const q = { id: 'q', skill: 'listening', sectionId: 's', evidence: { text: `出题句：\n${quote}` } } as ExamQuestion;
  const section = { id: 's', sentences: [{ id: 'actual', text: quote }] } as ExamSection;
  expect(locateQuestionEvidence(q, [], section)).toEqual({ status: 'exact', ranges: { 'sentence:actual': [{ start: 0, end: quote.length }] } });
  expect(evidenceSentenceId(q, section)).toBe('actual');
});
