import { questionSlotCount } from './questionSlots';
import type { ExamQuestion, ExamSection } from './types';

/** Compare answer slots, since a pooled choice task may represent several questions. */
export function sectionQuestionCount(section: Pick<ExamSection, 'id'>, questions: ExamQuestion[]) {
  return questions.filter(question => question.sectionId === section.id).reduce((total, question) => total + questionSlotCount(question), 0);
}

export function sectionQuestionsComplete(section: Pick<ExamSection, 'id' | 'questionCount'>, questions: ExamQuestion[]) {
  const count = sectionQuestionCount(section, questions);
  return count > 0 && (!Number.isInteger(section.questionCount) || section.questionCount < 1 || count === section.questionCount);
}
