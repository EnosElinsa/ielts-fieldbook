import type { ExamAttempt, ExamSkill } from '../../domain/exam/types';
import { mergeExamSessions } from '../../domain/exam/sessions';
import { readExamRecoveries, readExamRecovery, writeExamRecovery, clearExamRecovery } from '../../storage/examRecovery';

export function recoveredExamSessions(owner: string | null, skill: ExamSkill, saved: ExamAttempt[]) {
  return mergeExamSessions(saved.filter(row => row.skill === skill), readExamRecoveries<ExamAttempt>(owner, skill).filter(row => row.skill === skill));
}

export function checkpointExamSession(owner: string | null, scope: string, attempt: ExamAttempt) {
  const previous = readExamRecovery<ExamAttempt>(owner, scope);
  if (previous?.id && previous.id !== attempt.id) writeExamRecovery(owner, `${scope}:session:${previous.id}`, previous);
  writeExamRecovery(owner, `${scope}:session:${attempt.id}`, attempt);
  writeExamRecovery(owner, scope, attempt);
}

export function clearSessionCheckpoint(owner: string | null, scope: string, id: string) {
  clearExamRecovery(owner, `${scope}:session:${id}`);
  if (readExamRecovery<ExamAttempt>(owner, scope)?.id === id) clearExamRecovery(owner, scope);
}
