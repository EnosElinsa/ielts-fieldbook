import type { CardInput } from 'ts-fsrs';
import type { VocabularySessionRecord } from './session';

export type VocabularySkill = 'writing' | 'speaking' | 'listening' | 'reading';
export type VocabularyMode = 'dictation' | 'definition' | 'cloze' | 'synonym' | 'distinction' | 'production';
export type VocabularyDimension = 'meaning' | 'listening' | 'spelling' | 'usage';
export type VocabularyStatus = 'new' | 'unfamiliar' | 'unstable' | 'active' | 'familiar' | 'mastered';
export type VocabularyResult = 'success' | 'partial' | 'failure' | 'pending';
export type VocabularySource = {
  type: 'personal' | 'wordbook' | 'assessment' | VocabularySkill;
  id: string; skill?: VocabularySkill; bookId?: string; unitId?: string; senseId?: string; context?: string;
};
export type VocabularySense = {
  id: string; definition: string; example: string; pos: string; collocations?: string[]; usage?: string;
  synonyms?: string[]; antonyms?: string[]; distinctions?: string[]; source?: string; license?: string; attribution?: string; sourceUrl?: string;
  distinctionTask?: { prompt: string; options: string[]; answer: string; explanation: string };
  wordFamily?: string[]; register?: string;
};
export type VocabularyEntry = {
  id: string; term: string; category: 'word' | 'phrase' | 'sentence'; meaning: string; example: string;
  tags: string[]; sources: VocabularySource[]; senses: VocabularySense[]; createdAt: string; updatedAt: string;
  pronunciation?: { uk?: string; us?: string; ipa?: string }; enrichmentPending?: boolean;
};
export type DimensionState = { successes: number; failures: number; partials: number; nextReviewAt?: string; firstSuccessAt?: string; lastSuccessAt?: string };
export type WrongModeState = { active: boolean; successesSinceFailure: number; firstRecoveryAt?: string; lastFailureAt?: string; resolvedAt?: string };
export type VocabularyState = {
  id: string; entryId: string; senseId: string; manualStatus: VocabularyStatus;
  dimensions: Record<VocabularyDimension, DimensionState>; cards: Partial<Record<VocabularyMode, CardInput>>;
  wrong: WrongModeState & { modes: Partial<Record<VocabularyMode, WrongModeState>>; reason?: string };
  reviewCount: number; lastReviewedAt?: string; nextReviewAt?: string; updatedAt: string;
  legacyProgress?: Record<string, unknown>;
  verifiedProduction?: { successes: number; firstSuccessAt?: string; lastSuccessAt?: string };
};
export type VocabularyEvidence = {
  id?: string; entryId: string; senseId?: string; skill?: VocabularySkill;
  sourceType: VocabularySource['type']; sourceId: string; bookId?: string; unitId?: string;
  mode: VocabularyMode; dimension: VocabularyDimension; result: VocabularyResult;
  response?: string; context?: string; occurredAt: string; durationMs?: number;
  verification?: 'self-reported' | 'pending' | 'source-record' | 'assessed' | 'objective'; imported?: boolean; scheduling?: boolean;
};
export type VocabularyReview = {
  id: string; entryId: string; senseId: string; mode: VocabularyMode; result: VocabularyResult;
  response?: string; occurredAt: string | null; durationMs?: number; errorType?: string; verification?: string;
  sourceLabel?: string; sourceHistoryId?: string; imported?: boolean; scheduling?: boolean;
  bookId?: string; unitId?: string; updatedAt: string;
};
export type VocabularyStore = {
  vocabulary: VocabularyEntry[]; vocabularyStates: VocabularyState[];
  vocabularyEvidence: VocabularyEvidence[]; vocabularyReviews: VocabularyReview[];
  vocabularyActivities: { id: string; entryId: string; mode: 'audio'; occurredAt: string; updatedAt: string }[];
  wordbookProgress: { id: string; bookId: string; unitId: string; completedEntryIds: string[]; status: string; updatedAt: string }[];
  wordbookEnrollments: { id: string; bookId: string; updatedAt: string }[];
  vocabularyImportBatches: { id: string; [key: string]: unknown }[];
  vocabularySessions?: VocabularySessionRecord[];
};
export type ReviewQueueFilter = {
  wrongOnly?: boolean;
  entryId?: string; senseId?: string;
  bookId?: string; unitId?: string; skill?: VocabularySkill; sourceType?: string;
  dimension?: VocabularyDimension; mode?: VocabularyMode; dueOnly?: boolean; now?: string | Date;
};
export type ReviewCard = {
  id: string; entryId: string; senseId: string; entry: VocabularyEntry; mode: VocabularyMode;
  task?: import('./content').VocabularyLearningTask; contentVersion?: string;
  dimension: VocabularyDimension; dueAt: string; sources: VocabularySource[];
};
