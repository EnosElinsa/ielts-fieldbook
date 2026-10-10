import supplements from './contextSenseOverlay.json';
import { reviewedEntry, VOCABULARY_CONTENT_VERSION } from './content';
import { VOCABULARY_CATALOG } from './catalog';
import type { VocabularyEntry, VocabularySense } from './types';

export const VOCABULARY_CONTEXT_VERSION = supplements.version;
export type VocabularyContextStatus = 'reviewed' | 'unresolved' | 'unreviewed';
/** Frozen identity and provenance of the content selected for a question. */
export type VocabularyLearningContext = {
  entryId: string; senseId: string; bookId?: string; unitId?: string;
  version: string; status: VocabularyContextStatus;
};
export type VocabularyContextRequest = { bookId?: string; unitId?: string; senseId?: string };
export type ResolvedVocabularyLearningContext = {
  entry: VocabularyEntry; sense: VocabularySense | undefined; reviewed: boolean;
  contentReviewed: boolean;
  status: VocabularyContextStatus; context: VocabularyLearningContext | undefined; contentVersion: string;
};
type Binding = { bookId: string; unitId: string; entryId: string; sense: VocabularySense; originalSense?: VocabularySense | null; status: VocabularyContextStatus; contentReviewed: boolean };
const bindings = new Map((supplements.bindings as Binding[]).map(binding => [key(binding), binding]));
const unresolved = new Set(supplements.unresolved.map(key));
function key(value: { bookId?: string; unitId?: string; entryId: string }) {
  return JSON.stringify([value.bookId, value.unitId, value.entryId]);
}

/** Pure display/task resolver. Explicit sense wins; group bindings never change learner data. */
export function resolveVocabularyLearningContext(entry: VocabularyEntry, request: VocabularyContextRequest = {}): ResolvedVocabularyLearningContext {
  const membershipKey = key({ ...request, entryId: entry.id });
  const membershipBinding = bindings.get(membershipKey);
  const binding = membershipBinding || supplements.defaults.find(item => item.entryId === entry.id) as unknown as Binding | undefined;
  const fallback = reviewedEntry(entry);
  const selectedBinding = binding && (!request.senseId || request.senseId === binding.sense.id) ? binding : undefined;
  // An explicit dictionary sense may not be in the learner's small catalog snapshot yet.
  const explicitSupplement = request.senseId ? [...supplements.bindings, ...supplements.defaults].find(item => item.entryId === entry.id && item.sense.id === request.senseId) : undefined;
  const existing = selectedBinding && entry.senses.find(item => item.id === selectedBinding.sense.id);
  const catalogSense = selectedBinding && (VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]).find(item => item.id === entry.id)?.senses.find(item => item.id === selectedBinding.sense.id);
  const userOverride = existing && (existing.source === 'Personal note' || [ 'definition', 'example' ].some(field => {
    const name = field as 'definition' | 'example';
    return existing[name] !== selectedBinding?.originalSense?.[name] && existing[name] !== catalogSense?.[name] && existing[name] !== selectedBinding?.sense[name];
  }));
  const selectedSense = (userOverride ? existing : selectedBinding?.sense) || (request.senseId ? fallback.senses.find(item => item.id === request.senseId) || explicitSupplement?.sense : fallback.senses[0]);
  const sense = selectedSense ? structuredClone(selectedSense) : undefined;
  const status: VocabularyContextStatus = selectedBinding && !userOverride && (membershipBinding || !request.bookId) ? selectedBinding.status : unresolved.has(membershipKey) ? 'unresolved' : 'unreviewed';
  const resolved = sense ? { ...fallback, senses: [sense, ...fallback.senses.filter(item => item.id !== sense.id)] } : fallback;
  return {
    entry: resolved, sense, reviewed: status === 'reviewed', contentReviewed: Boolean(selectedBinding?.contentReviewed && !userOverride), status,
    context: sense ? { entryId: entry.id, senseId: sense.id, ...(request.bookId ? { bookId: request.bookId } : {}), ...(request.unitId ? { unitId: request.unitId } : {}), version: VOCABULARY_CONTEXT_VERSION, status } : undefined,
    contentVersion: `${VOCABULARY_CONTENT_VERSION}/${VOCABULARY_CONTEXT_VERSION}`,
  };
}

/** Validate shape and card identity without consulting today's manifest (old versions stay valid). */
export function isVocabularyLearningContext(value: unknown, identity?: { entryId: string; senseId: string }): value is VocabularyLearningContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 500 && !['__proto__', 'prototype', 'constructor'].includes(v);
  return id(input.entryId) && id(input.senseId) && typeof input.version === 'string' && input.version.trim().length > 0 && input.version.length <= 100 && ['reviewed', 'unresolved', 'unreviewed'].includes(String(input.status))
    && (input.bookId === undefined || id(input.bookId)) && (input.unitId === undefined || id(input.unitId) && id(input.bookId))
    && (!identity || input.entryId === identity.entryId && input.senseId === identity.senseId)
    && Object.keys(input).every(name => ['entryId', 'senseId', 'bookId', 'unitId', 'version', 'status'].includes(name));
}
