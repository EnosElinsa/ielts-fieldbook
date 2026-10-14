import { makeId } from '../utils';
import { normalizeExamAnnotations } from './annotations';
import type { ExamAttempt, ExamQuestion, ExamSection, ExamStore, IntensiveSession } from './types';

export function createExamAttempt(sections: ExamSection[], questions: ExamQuestion[], mode: ExamAttempt['mode'], now = new Date().toISOString()): ExamAttempt {
  if (!sections.length) throw new Error('Select at least one exam section.');
  const first = sections[0];
  if (sections.some(section => section.skill !== first.skill || section.paperId !== first.paperId)) throw new Error('An attempt must use one skill and one paper.');
  const selected = questions.filter(question => sections.some(section => section.id === question.sectionId));
  return {
    id: makeId('exam'), skill: first.skill, sourceId: first.paperId, sectionIds: [...new Set(sections.map(section => section.id))],
    mode, status: 'active', responses: {}, evidence: {}, keywords: {}, errorReasons: {},
    questionTypes: Object.fromEntries(selected.map(question => [question.id, question.type])),
    startedAt: now, updatedAt: now, hintsEnabled: mode === 'practice', elapsedSeconds: 0,
    ...(mode === 'mock' ? { timeLimitSeconds: first.skill === 'reading' ? sections.length >= 3 ? 3600 : sections.length * 1200 : sections.length >= 4 ? 2400 : sections.length * 600 } : {}),
    contentVersion: [...new Set(sections.map(section => section.provenance.sourceVersion))].join(','),
  };
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
const stringMap = (value: unknown): Record<string, string> => Object.fromEntries(Object.entries(object(value)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
const number = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function normalizeExamStore(input: unknown): ExamStore {
  const source = object(input);
  const attempts = Array.isArray(source.examAttempts) ? source.examAttempts : [];
  const intensive = Array.isArray(source.intensiveSessions) ? source.intensiveSessions : [];
  const examAttempts = attempts.filter(row => row && typeof row === 'object' && typeof row.id === 'string' && ['reading', 'listening'].includes(row.skill)).map(row => {
    const responses = Object.fromEntries(Object.entries(object(row.responses)).filter(([, value]) => typeof value === 'string' || Array.isArray(value) && value.every(item => typeof item === 'string')));
    return { ...row, sectionIds: strings(row.sectionIds), sourceId: String(row.sourceId || ''), mode: row.mode === 'mock' ? 'mock' : 'practice',
      status: ['active', 'paused', 'completed'].includes(row.status) ? row.status : 'active', responses,
      evidence: stringMap(row.evidence), keywords: stringMap(row.keywords), errorReasons: stringMap(row.errorReasons),
      startedAt: row.startedAt || row.updatedAt || '', updatedAt: row.updatedAt || row.startedAt || '',
      hintsEnabled: typeof row.hintsEnabled === 'boolean' ? row.hintsEnabled : row.mode !== 'mock', elapsedSeconds: Math.max(0, number(row.elapsedSeconds)),
    } as ExamAttempt;
  });
  const intensiveSessions = intensive.filter(row => row && typeof row === 'object' && typeof row.id === 'string' && typeof row.sectionId === 'string' && typeof row.sentenceId === 'string').map(row => ({
    ...row, stage: Math.max(0, Math.min(6, number(row.stage))), gist: String(row.gist || ''), transcriptInput: String(row.transcriptInput || ''),
    replayCount: Math.max(0, number(row.replayCount)), listened: Boolean(row.listened), revealed: Boolean(row.revealed),
    dictationResult: ['correct', 'partial', 'wrong', 'pending'].includes(row.dictationResult) ? row.dictationResult : 'pending',
    errorReasons: strings(row.errorReasons), updatedAt: row.updatedAt || '', speed: Math.max(0.25, Math.min(2, number(row.speed, 1))), loop: Boolean(row.loop),
  } as IntensiveSession));
  return { examAttempts, intensiveSessions, examAnnotations: normalizeExamAnnotations(source.examAnnotations) };
}

export function dueIntensive(sessions: IntensiveSession[], now: string | Date = new Date()): IntensiveSession[] {
  const timestamp = new Date(now).getTime();
  return sessions.filter(session => session.completedAt && session.nextReviewAt && Date.parse(session.nextReviewAt) <= timestamp)
    .sort((left, right) => String(left.nextReviewAt).localeCompare(String(right.nextReviewAt)));
}

export function examStats(attempts: ExamAttempt[]) {
  const completed = attempts.filter(attempt => attempt.status === 'completed');
  const correct = completed.reduce((sum, attempt) => sum + (attempt.score || 0), 0);
  const total = completed.reduce((sum, attempt) => sum + (attempt.total || 0), 0);
  const byType: Record<string, { correct: number; total: number }> = {};
  const errors: Record<string, number> = {};
  completed.forEach(attempt => {
    Object.entries(attempt.results || {}).forEach(([id, result]) => {
      const type = attempt.questionTypes?.[id] || 'unknown';
      const points = attempt.questionSnapshot?.find(question => question.id === id)?.points || 1;
      byType[type] ||= { correct: 0, total: 0 }; byType[type].total += points;
      byType[type].correct += attempt.earnedPoints?.[id] ?? (result ? points : 0);
      const reason = attempt.errorReasons[id]; if (!result && reason) errors[reason] = (errors[reason] || 0) + 1;
    });
  });
  return { completed: completed.length, correct, total, accuracy: total ? correct / total : 0, byType, errors };
}

export function intensiveStats(sessions: IntensiveSession[]) {
  const completed = sessions.filter(session => session.completedAt);
  return { completed: completed.length, correct: completed.filter(session => session.dictationResult === 'correct').length,
    replays: sessions.reduce((sum, session) => sum + session.replayCount, 0), due: dueIntensive(sessions).length };
}
