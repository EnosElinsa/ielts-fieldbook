import { USER_LISTS, VOCABULARY_LISTS, type UserListKey } from './sync';

export type AccountModule = 'productive' | 'vocabulary' | 'receptive';
export type CollectionStatus = 'unloaded' | 'loading' | 'ready' | 'error';
export type AccountCollection = UserListKey | 'drafts' | 'profile' | 'lexicon';
export type CollectionStatuses = Record<AccountCollection, CollectionStatus>;
export const ACCOUNT_MODULES: Record<AccountModule, readonly UserListKey[]> = {
  productive: ['sessions', 'assessments', 'errors', 'stories'],
  vocabulary: VOCABULARY_LISTS,
  receptive: ['examAttempts', 'intensiveSessions'],
};
export function emptyCollectionStatuses(): CollectionStatuses {
  return Object.fromEntries([...USER_LISTS, 'drafts', 'profile', 'lexicon'].map(key => [key, 'unloaded'])) as CollectionStatuses;
}
