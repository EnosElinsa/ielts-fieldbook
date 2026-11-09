import type { ExamQuestion } from '../../domain/exam/types';

/** Remove only known import labels. Mixed commentary is not a source quotation. */
export function sourceEvidenceText(text?: string) {
  const quote = (text || '').replace(/^\s*(?:出题句|答案句|出处句)\s*[:：]?\s*/, '').trim();
  return /[\u3400-\u9fff]/.test(quote) ? '' : quote;
}

export function questionReviewContent(question: ExamQuestion) {
  const evidence = sourceEvidenceText(question.evidence?.text);
  const explanation = question.explanation?.trim() || '';
  const source = question.skill === 'listening' ? 'transcript' : 'passage';
  const sameText = (value: string) => value.replace(/\s+/g, ' ').trim();
  if (explanation && !/[\u3400-\u9fff]/.test(explanation) && sameText(explanation) !== sameText(evidence)) {
    return { title: 'Answer explanation', explanation, evidence };
  }
  const answer = typeof question.answer === 'string' ? question.answer.trim() : '';
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inQuote = answer && new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(evidence);
  const completion = ['gap', 'summary', 'flow'].includes(question.type);
  return {
    title: `${question.skill === 'listening' ? 'Transcript' : 'Passage'} evidence`,
    explanation: completion && inQuote
      ? `The quoted ${source} uses “${answer}”, which supplies the missing answer.`
      : evidence ? `Compare the answer with this ${source} evidence.` : `Open the original ${source} to compare it with the answer.`,
    evidence,
  };
}
