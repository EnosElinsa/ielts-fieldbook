import type { ExamQuestion } from './types';

type NumberedQuestion = Pick<ExamQuestion, 'number'> & Partial<Pick<ExamQuestion, 'type' | 'points'>>;
type AnswerableQuestion = NumberedQuestion & Partial<Pick<ExamQuestion, 'options'>>;

/** Pooled multiple-choice rows represent several numbered answers in one shared task. */
export function questionSlotCount(question: NumberedQuestion) {
  return question.type === 'multiple' && Number.isInteger(question.points) && question.points! > 0 ? question.points! : 1;
}

export function questionEndNumber(question: NumberedQuestion) { return question.number + questionSlotCount(question) - 1; }
export function questionNumberLabel(question: NumberedQuestion) {
  const end = questionEndNumber(question);
  return end > question.number ? `${question.number}–${end}` : String(question.number);
}
export function questionLabel(question: NumberedQuestion) {
  return `${questionSlotCount(question) > 1 ? 'Questions' : 'Question'} ${questionNumberLabel(question)}`;
}

export function selectedExamChoices(value?: string | string[]) {
  return [...new Set((Array.isArray(value) ? value : value ? [value] : []).filter(item => item.trim()))];
}

/** Completeness never depends on the answer key. Duplicate/cleared choices cannot fill a slot. */
export function questionAnsweredSlots(question: AnswerableQuestion, value?: string | string[]) {
  const choices = selectedExamChoices(value);
  if (question.type !== 'multiple') return choices.length ? 1 : 0;
  return Math.min(questionSlotCount(question), choices.filter(choice => !question.options?.length || question.options.includes(choice)).length);
}
export function isQuestionAnswered(question: AnswerableQuestion, value?: string | string[]) {
  return questionAnsweredSlots(question, value) === questionSlotCount(question);
}
