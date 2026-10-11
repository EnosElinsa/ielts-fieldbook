import type { ExamAttempt, ExamQuestion } from './types';

export function normalizeAnswer(value: unknown): string {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/^[\s"'.,!?;:()[\]{}]+|[\s"'.,!?;:()[\]{}]+$/g, '').replace(/\s+/g, ' ').trim();
}

export function gradeQuestion(question: ExamQuestion, response: string | string[] | undefined): boolean {
  if (question.type === 'multiple') {
    const choices = (value: string | string[] | undefined) => [...new Set((Array.isArray(value) ? value : value ? [value] : []).map(normalizeAnswer).filter(Boolean))].sort();
    const expected = choices(question.answer);
    const actual = choices(response);
    return expected.length > 0 && expected.length === actual.length && expected.every((answer, index) => answer === actual[index]);
  }
  if (Array.isArray(response) && response.length !== 1) return false;
  const actual = normalizeAnswer(Array.isArray(response) ? response[0] : response);
  const permitsNumber = /\b(?:AND\s*\/\s*OR|AND|OR)\s+A\s+NUMBER\b/i.test(question.instructions || '');
  const wordCount = actual.split(/\s+/).filter(token => !permitsNumber || !/\d/.test(token)).length;
  if (!actual || (question.maxWords !== undefined && wordCount > question.maxWords)) return false;
  const answers = [...(Array.isArray(question.answer) ? question.answer : [question.answer]), ...(question.alternatives || [])];
  return answers.some(answer => normalizeAnswer(answer) === actual);
}

export function gradeAttempt(attempt: ExamAttempt, questions: ExamQuestion[], now = new Date().toISOString()): ExamAttempt {
  if (attempt.status === 'completed' && attempt.results && attempt.score !== undefined && attempt.total !== undefined) return attempt;
  const selected = questions.filter(question => attempt.sectionIds.includes(question.sectionId) && question.skill === attempt.skill);
  const results: Record<string, boolean> = {};
  const questionTypes: NonNullable<ExamAttempt['questionTypes']> = {};
  const earnedPoints: Record<string, number> = {};
  let score = 0;
  let total = 0;
  for (const question of selected) {
    const points = question.points !== undefined && question.points > 0 ? question.points : 1;
    results[question.id] = gradeQuestion(question, attempt.responses[question.id]);
    questionTypes[question.id] = question.type;
    total += points;
    let earned = results[question.id] ? points : 0;
    if (question.type === 'multiple' && points > 1) {
      const choices = (value: string | string[] | undefined) => [...new Set((Array.isArray(value) ? value : value ? [value] : []).map(normalizeAnswer).filter(Boolean))];
      const expected = choices(question.answer), actual = choices(attempt.responses[question.id]);
      earned = actual.length > expected.length || expected.length === 0 ? 0 : Math.min(points, actual.filter(choice => expected.includes(choice)).length);
    }
    earnedPoints[question.id] = earned;
    score += earned;
  }
  return { ...attempt, results, earnedPoints, questionTypes, questionSnapshot: structuredClone(selected), score, total, status: 'completed', completedAt: attempt.completedAt || now, updatedAt: now };
}

export type DictationToken = { kind: 'equal' | 'omission' | 'extra' | 'replacement'; expected?: string; actual?: string };

/** Word LCS keeps repeated words aligned. Pair unmatched runs to show substitutions. */
export function diffDictation(expected: string, actual: string): DictationToken[] {
  const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
  const left = words(expected), right = words(actual);
  const lcs = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) {
    lcs[i][j] = normalizeAnswer(left[i]) === normalizeAnswer(right[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const result: DictationToken[] = [];
  let i = 0, j = 0;
  const omitted: string[] = [], added: string[] = [];
  const flush = () => {
    const count = Math.max(omitted.length, added.length);
    for (let k = 0; k < count; k++) {
      if (omitted[k] !== undefined && added[k] !== undefined) result.push({ kind: 'replacement', expected: omitted[k], actual: added[k] });
      else if (omitted[k] !== undefined) result.push({ kind: 'omission', expected: omitted[k] });
      else result.push({ kind: 'extra', actual: added[k] });
    }
    omitted.length = added.length = 0;
  };
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && normalizeAnswer(left[i]) === normalizeAnswer(right[j])) {
      flush(); result.push({ kind: 'equal', expected: left[i++], actual: right[j++] });
    } else if (i < left.length && (j === right.length || lcs[i + 1][j] >= lcs[i][j + 1])) omitted.push(left[i++]);
    else added.push(right[j++]);
  }
  flush();
  return result;
}
