function removePrefixed(storage: () => Storage, prefixes: string[], exact: string[] = []) {
  try {
    const store = storage();
    for (const key of exact) store.removeItem(key);
    const keys = Array.from({ length: store.length }, (_, index) => store.key(index));
    for (const key of keys) {
      if (key && prefixes.some(prefix => key.startsWith(prefix))) store.removeItem(key);
    }
  } catch { /* Browser storage cleanup is best effort. */ }
}

/** Remove browser-tab session navigation, scroll and position keys scoped to one account. */
export function clearAccountSessionStorage(owner: string | null) {
  if (!owner) return;
  const quoted = JSON.stringify(owner);
  removePrefixed(
    () => sessionStorage,
    [
      `fieldbook:page-state:v1:${quoted}:`,
      `fieldbook:vocabulary-position:${owner}:`,
      `fieldbook:session-position:${owner}:`,
    ],
    [
      `fieldbook:module-memory:v1:${quoted}`,
      `fieldbook:history-scroll:v1:${quoted}`,
    ],
  );
  // Vocabulary position keys may also exist in localStorage prior to migration.
  removePrefixed(() => localStorage, [`fieldbook:vocabulary-position:${owner}:`]);
}

/** Clear per-tab session keys, in-memory learning timers and stale store state on cross-tab sign-out or account switch without wiping durable recovery drafts. */
export async function clearAccountTabState(owner: string | null, shouldClear: () => boolean = () => true) {
  if (!owner || !shouldClear()) return;
  clearAccountSessionStorage(owner);
  const [
    { accountId, resetAccountStore },
    { discardAccountVocabularyLearningQueues },
  ] = await Promise.all([
    import('./remote'),
    import('../features/vocabulary/vocabularyLearningSync'),
  ]);
  if (!shouldClear()) return;
  discardAccountVocabularyLearningQueues(owner);
  if (accountId() === owner) resetAccountStore();
}

/** Clear all local drafts, cached audio, pending learning queues and session keys for an account. */
export async function clearAccountLocalState(owner: string | null) {
  const [
    { resetAccountStore },
    { discardDraftRecovery },
    { clearVocabularyDraft },
    { clearAccountExamRecovery },
    { clearPendingAudioAccount },
    { vocabularySessionDrafts },
    { clearAccountVocabularyLearning },
  ] = await Promise.all([
    import('./remote'),
    import('./recovery'),
    import('./vocabularyDrafts'),
    import('./examRecovery'),
    import('./pendingAudio'),
    import('./vocabularySessionDrafts'),
    import('../features/vocabulary/vocabularyLearningSync'),
  ]);
  discardDraftRecovery(owner);
  clearVocabularyDraft(owner);
  clearAccountExamRecovery(owner);
  clearAccountVocabularyLearning(owner);
  clearAccountSessionStorage(owner);
  await Promise.all([
    clearPendingAudioAccount(owner),
    vocabularySessionDrafts.clearAccount(owner),
  ]);
  resetAccountStore();
}
