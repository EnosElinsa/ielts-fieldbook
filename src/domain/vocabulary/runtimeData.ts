import type { VocabularySense } from './types';
import type { CurriculumRow } from './curriculum';

export type ReadinessSupplement = { entryId: string; senseId: string; definition?: string; example: string; pos?: string; usage?: string; originalSense?: VocabularySense };
export type ReadinessDefault = { entryId: string; sense: VocabularySense; originalSense?: VocabularySense };
export type ContextBinding = { bookId?: string; unitId?: string; entryId: string; sense: VocabularySense; originalSense?: VocabularySense | null; status: 'reviewed' | 'unresolved' | 'unreviewed'; contentReviewed: boolean };
export type VocabularyTeachingData = {
  senseBaselines: Record<string, VocabularySense[]>;
  curriculum: { common: CurriculumRow[]; topics: CurriculumRow[]; source: CurriculumRow[]; repairs: CurriculumRow[]; modern: CurriculumRow[] };
  readiness: { core: ReadinessSupplement[]; corrections: ReadinessSupplement[]; defaults: ReadinessDefault[] };
  learning: Record<string, VocabularySense>;
  tasks: { senseIds: Record<string, string> };
  context: { version: string; bindings: ContextBinding[]; defaults: ContextBinding[]; unresolved: { bookId: string; unitId: string; entryId: string }[] };
};

export const vocabularyTeaching: VocabularyTeachingData = {
  senseBaselines: {},
  curriculum: { common: [], topics: [], source: [], repairs: [], modern: [] },
  readiness: { core: [], corrections: [], defaults: [] },
  learning: {}, tasks: { senseIds: {} },
  context: { version: 'context-2026-10-10.2', bindings: [], defaults: [], unresolved: [] },
};
export let vocabularyTeachingRevision = 0;
const identity = (row: { entryId: string; bookId?: string; unitId?: string; senseId?: string; sense?: VocabularySense }) => JSON.stringify([row.bookId, row.unitId, row.entryId, row.senseId || row.sense?.id]);
function mergeRows<T extends Parameters<typeof identity>[0]>(current: T[], incoming: T[]): T[] {
  return [...new Map([...current, ...incoming].map(row => [identity(row), row])).values()];
}

/** Called before scoped content is exposed to the synchronous domain resolvers. */
export function registerVocabularyTeaching(data: VocabularyTeachingData) {
  for (const key of Object.keys(vocabularyTeaching.curriculum) as (keyof VocabularyTeachingData['curriculum'])[]) {
    vocabularyTeaching.curriculum[key] = mergeRows(vocabularyTeaching.curriculum[key], data.curriculum[key]);
  }
  vocabularyTeaching.readiness.core = mergeRows(vocabularyTeaching.readiness.core, data.readiness.core);
  vocabularyTeaching.readiness.corrections = mergeRows(vocabularyTeaching.readiness.corrections, data.readiness.corrections);
  vocabularyTeaching.readiness.defaults = mergeRows(vocabularyTeaching.readiness.defaults, data.readiness.defaults);
  Object.assign(vocabularyTeaching.learning, data.learning);
  Object.assign(vocabularyTeaching.senseBaselines, data.senseBaselines);
  Object.assign(vocabularyTeaching.tasks.senseIds, data.tasks.senseIds);
  vocabularyTeaching.context.bindings = mergeRows(vocabularyTeaching.context.bindings, data.context.bindings);
  vocabularyTeaching.context.defaults = mergeRows(vocabularyTeaching.context.defaults, data.context.defaults);
  vocabularyTeaching.context.unresolved = mergeRows(vocabularyTeaching.context.unresolved, data.context.unresolved);
  vocabularyTeachingRevision += 1;
}
