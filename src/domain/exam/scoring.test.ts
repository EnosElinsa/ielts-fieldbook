import { describe, expect, test } from 'vitest';
import { exceedsWordLimit, gradeQuestion, permitsAnswerNumber } from './scoring';
import type { ExamQuestion } from './types';

const question = (patch: Partial<ExamQuestion>) => ({ id: 'q', number: 1, type: 'gap', maxWords: 1, answer: '14 July', ...patch }) as ExamQuestion;

describe('word limits that allow a number', () => {
  test('numeric tokens are not words when the instruction allows a number', () => {
    const limited = question({ instructions: 'Write ONE WORD AND/OR A NUMBER for each answer.' });
    expect(permitsAnswerNumber(limited)).toBe(true);
    expect(exceedsWordLimit(limited, '14 July')).toBe(false);
    expect(exceedsWordLimit(limited, '10 days')).toBe(false);
    expect(exceedsWordLimit(limited, 'late July')).toBe(true);
    expect(gradeQuestion(limited, '14 July')).toBe(true);
  });

  test('plain word limits still count every token', () => {
    const limited = question({ instructions: 'Write ONE WORD ONLY.' });
    expect(permitsAnswerNumber(limited)).toBe(false);
    expect(exceedsWordLimit(limited, '14 July')).toBe(true);
    expect(exceedsWordLimit(limited, 'July')).toBe(false);
    expect(exceedsWordLimit(question({ maxWords: undefined }), 'a b c d')).toBe(false);
    expect(exceedsWordLimit(limited, ['July'])).toBe(false);
  });
});
