import type { ReviewQueueFilter, VocabularySource } from './types';

export function normalizeVocabularySource(source: VocabularySource): VocabularySource {
  const raw = source.exam;
  if (!raw || typeof raw.sectionId !== 'string' || !raw.sectionId.trim()) return source;
  const exam: NonNullable<VocabularySource['exam']> = { sectionId: raw.sectionId.trim() };
  for (const key of ['attemptId', 'blockId', 'passageId', 'paragraphId', 'sentenceId', 'quote'] as const) {
    if (typeof raw[key] === 'string' && raw[key]) exam[key] = raw[key];
  }
  if (Number.isInteger(raw.start) && Number.isInteger(raw.end) && raw.start! >= 0 && raw.end! > raw.start!) { exam.start = raw.start; exam.end = raw.end; }
  return { ...source, id: exam.sectionId, exam };
}

export function normalizeVocabularySources(sources: VocabularySource[]) {
  return [...new Map(sources.map(normalizeVocabularySource).map(source => [vocabularySourceKey(source), source])).values()];
}

export function vocabularySourceKey(source: VocabularySource) {
  const exam = source.exam;
  return JSON.stringify([source.type, source.id, source.bookId, source.unitId, source.senseId, source.skill,
    ...(exam ? [exam.sectionId, exam.attemptId, exam.blockId, exam.passageId, exam.paragraphId, exam.sentenceId, exam.start, exam.end, exam.quote] : [])]);
}

export function matchesVocabularySource(source: VocabularySource, filter: ReviewQueueFilter, senseId?: string) {
  return (!senseId || !source.senseId || source.senseId === senseId)
    && (!filter.bookId || source.bookId === filter.bookId) && (!filter.unitId || source.unitId === filter.unitId)
    && (!filter.skill || source.skill === filter.skill) && (!filter.sourceType || source.type === filter.sourceType)
    && (!filter.sourceId || source.id === filter.sourceId);
}

export function examVocabularySourceUrl(source: VocabularySource) {
  if (!source.exam || !['reading', 'listening'].includes(source.type)) return undefined;
  const query = new URLSearchParams();
  const exam = source.exam;
  if (exam.paragraphId) query.set('paragraph', exam.paragraphId);
  if (exam.blockId) query.set('block', exam.blockId);
  if (exam.sentenceId) query.set('sentence', exam.sentenceId);
  if (exam.quote) query.set('quote', exam.quote);
  if (exam.start !== undefined) query.set('start', String(exam.start));
  if (exam.end !== undefined) query.set('end', String(exam.end));
  return `/${source.type}/source/${encodeURIComponent(exam.sectionId)}${query.size ? `?${query}` : ''}`;
}

export function partVocabularyReviewUrl(skill: 'reading' | 'listening', sectionId: string) {
  return `/vocabulary/review?${new URLSearchParams({ sourceType: skill, sourceId: sectionId, dueOnly: 'false', mode: 'definition' })}`;
}
