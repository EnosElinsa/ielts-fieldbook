import { migrateVocabularyRecovery } from '../../storage/vocabularyRecovery';

export type VocabularyLearning = { viewedEntryIds: string[]; currentEntryId?: string; updatedAt: string };
export type LearningSaveSnapshot = { status: 'idle' | 'pending' | 'saving' | 'saved' | 'failed'; pending?: VocabularyLearning; savedOnDevice: boolean };
type Options = { owner: string | null; bookId: string; unitId: string; currentOwner: () => string | null; save: (learning: VocabularyLearning) => Promise<boolean> };
export const vocabularyLearningPendingKey = (owner: string | null, bookId: string, unitId: string) => `fieldbook:vocabulary-learning-pending:${owner}:${bookId}:${unitId}`;

type Draft = VocabularyLearning & { revision: string; sequence: number };
let lastSequence = 0;
const draftSequence = (value: { sequence?: unknown; updatedAt?: unknown }) => typeof value.sequence === 'number' && Number.isSafeInteger(value.sequence) ? value.sequence : typeof value.updatedAt === 'string' ? (Date.parse(value.updatedAt) || 0) * 1000 : 0;
function readDraft(key: string): Draft | undefined {
  let latest: Draft | undefined;
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      const value = JSON.parse(storage().getItem(key) || 'null');
      if (value && Array.isArray(value.viewedEntryIds) && value.viewedEntryIds.every((id: unknown) => typeof id === 'string') && typeof value.updatedAt === 'string' && (value.currentEntryId === undefined || typeof value.currentEntryId === 'string')) {
        const sequence = draftSequence(value);
        // A session fallback may be newer than a local draft left behind by quota failure.
        if (!latest || sequence >= latest.sequence) latest = { ...value, sequence, revision: typeof value.revision === 'string' ? value.revision : crypto.randomUUID() };
      }
    } catch { /* Storage may be unavailable; the in-memory draft still works. */ }
  }
  if (latest) lastSequence = Math.max(lastSequence, latest.sequence);
  return latest;
}
function writeDraft(key: string, draft: Draft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    try { sessionStorage.removeItem(key); } catch { /* Legacy cleanup is best effort. */ }
    return true;
  } catch {
    try { sessionStorage.setItem(key, JSON.stringify(draft)); return true; } catch { return false; }
  }
}
function learningOnly(draft: Draft): VocabularyLearning {
  return { viewedEntryIds: [...draft.viewedEntryIds], currentEntryId: draft.currentEntryId, updatedAt: draft.updatedAt };
}

/** Share one queue across details-page round trips, retaining only the newest unsent draft. */
const queues = new Map<string, VocabularyLearningSync>();
class VocabularyLearningSync {
  private draft?: Draft;
  private acknowledged?: VocabularyLearning;
  private status: LearningSaveSnapshot['status'];
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight = false;
  private savedOnDevice = true;
  private listeners = new Set<(snapshot: LearningSaveSnapshot) => void>();
  constructor(private key: string, private options: Options) {
    this.draft = readDraft(key);
    this.status = this.draft ? 'failed' : 'idle';
    if (this.draft) this.savedOnDevice = writeDraft(key, this.draft);
  }
  snapshot = (): LearningSaveSnapshot => ({ status: this.status, pending: this.draft ? learningOnly(this.draft) : undefined, savedOnDevice:this.savedOnDevice });
  subscribe = (listener: (snapshot: LearningSaveSnapshot) => void) => {
    this.listeners.add(listener); listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) { this.flush(); this.releaseIfUnused(); }
    };
  };
  private emit() { this.listeners.forEach(listener => listener(this.snapshot())); }
  private isOwner() { return this.options.owner === this.options.currentOwner(); }
  private clearTimer() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
  private releaseIfUnused() {
    if (!this.listeners.size && !this.inFlight && queues.get(this.key) === this) queues.delete(this.key);
  }
  update = (learning: VocabularyLearning, delay = 800) => {
    if (!this.isOwner()) return;
    const previous = this.draft || this.acknowledged;
    if (previous && previous.currentEntryId === learning.currentEntryId && previous.viewedEntryIds.length === learning.viewedEntryIds.length && previous.viewedEntryIds.every(id=>learning.viewedEntryIds.includes(id))) return;
    const sequence = lastSequence = Math.max(lastSequence + 1, Date.now() * 1000);
    this.draft = { ...learning, viewedEntryIds: [...learning.viewedEntryIds], revision: crypto.randomUUID(), sequence };
    this.savedOnDevice = writeDraft(this.key, this.draft);
    this.status = this.inFlight ? 'saving' : 'pending'; this.emit(); this.clearTimer();
    this.timer = setTimeout(this.flush, delay);
  };
  flush = () => {
    this.clearTimer();
    if (!this.draft || this.inFlight || !this.isOwner()) return;
    const submitted = this.draft;
    this.inFlight = true; this.status = 'saving'; this.emit();
    void this.send(submitted);
  };
  private async send(submitted: Draft) {
    let saved = false;
    try { saved = await this.options.save(learningOnly(submitted)); } catch { /* Leave the draft available for retry. */ }
    this.inFlight = false;
    if (!this.isOwner()) { this.status = 'failed'; this.releaseIfUnused(); return; }
    if (this.draft?.revision !== submitted.revision) {
      // New navigation supersedes both success and failure of an older request.
      if (this.timer === undefined || !this.listeners.size) this.flush();
      this.releaseIfUnused(); return;
    }
    const stored = readDraft(this.key);
    if (saved && (!stored || stored.revision === submitted.revision || stored.sequence < submitted.sequence)) {
      for (const storage of [() => localStorage, () => sessionStorage]) {
        try {
          const current = JSON.parse(storage().getItem(this.key) || 'null');
          if (current && (current.revision === submitted.revision || draftSequence(current) < submitted.sequence)) storage().removeItem(this.key);
        } catch { /* Storage cleanup is best effort. */ }
      }
      this.acknowledged = learningOnly(submitted); this.draft = undefined; this.status = 'saved';
    } else {
      this.status = 'failed';
    }
    this.emit(); this.releaseIfUnused();
  }
}
export function acquireVocabularyLearningSync(options: Options) {
  migrateVocabularyRecovery(options.owner);
  const key = vocabularyLearningPendingKey(options.owner, options.bookId, options.unitId);
  let queue = queues.get(key);
  if (!queue) { queue = new VocabularyLearningSync(key, options); queues.set(key, queue); }
  return queue;
}
