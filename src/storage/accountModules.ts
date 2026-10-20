import { USER_LISTS, VOCABULARY_LISTS, type UserListKey } from './sync';

export type AccountModule = 'planning' | 'productive' | 'vocabulary' | 'vocabularyCore' | 'receptive';
export type CollectionStatus = 'unloaded' | 'loading' | 'ready' | 'error';
export type AccountCollection = UserListKey | 'drafts' | 'profile' | 'lexicon';
export type CollectionStatuses = Record<AccountCollection, CollectionStatus>;
export const ACCOUNT_MODULES: Record<AccountModule, readonly UserListKey[]> = {
  planning: [], // Read-only summaries have their own completion flag.
  productive: ['sessions', 'assessments', 'errors', 'stories'],
  vocabulary: VOCABULARY_LISTS,
  // Frozen session snapshots, activity logs and import receipts are loaded only
  // by history, analytics or import flows. Scheduling uses learning evidence.
  vocabularyCore: VOCABULARY_LISTS.filter(key => !['vocabularySessions', 'vocabularyActivities', 'vocabularyImportBatches'].includes(key)),
  receptive: ['examAttempts', 'intensiveSessions', 'examAnnotations'],
};
export function emptyCollectionStatuses(): CollectionStatuses {
  return Object.fromEntries([...USER_LISTS, 'drafts', 'profile', 'lexicon'].map(key => [key, 'unloaded'])) as CollectionStatuses;
}
