import { normalizeAnswer } from '../../domain/exam/scoring';
import type { ExamQuestion } from '../../domain/exam/types';

type AnswerKey = Pick<ExamQuestion, 'answer' | 'alternatives'>;

/** Keep the first explicit spelling for each answer the grader treats as equivalent. */
export function acceptedAnswerVariants(question: AnswerKey): string[] {
  const seen = new Set<string>();
  return [...(Array.isArray(question.answer) ? question.answer : [question.answer]), ...(question.alternatives || [])]
    .filter(answer => {
      const normalized = normalizeAnswer(answer);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export function ExamAcceptedAnswer({ question }: { question: AnswerKey & Pick<ExamQuestion, 'type'> }) {
  const multiple = question.type === 'multiple';
  // Multiple-choice grading requires the answer set and does not use alternatives.
  const answers = acceptedAnswerVariants({ answer: question.answer, alternatives: multiple ? [] : question.alternatives });
  return <div>
    <dt>{multiple ? 'Correct choices' : answers.length > 1 ? 'Accepted answers' : 'Accepted answer'}</dt>
    <dd>{answers.length ? answers.join(' · ') : 'Source answer unavailable'}{multiple && answers.length > 1 ? ' (all required)' : ''}</dd>
  </div>;
}
