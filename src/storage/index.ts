// @ts-nocheck
import {
  BANK_CACHE_KEY,
  LEGACY_STORES,
  bankCacheShape,
  clearLegacyStores,
  compactAssessmentsForQuota,
  emptyState,
  hashText,
  mergeBackup,
  migrateState,
  persistShape,
} from '../domain';

export const STORE_KEY = 'ielts-writing-fieldbook';

export function readBankCache() {
  try {
    const raw = localStorage.getItem(BANK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function applyBankCache(target, cache) {
  if (!cache) return;
  if (Array.isArray(cache.writing) && cache.writing.length) {
    target.questions = cache.writing.map((question) => Object.assign({}, question, { id: String(question.id) }));
  }
  if (Array.isArray(cache.speakingTopicsSlim) && cache.speakingTopicsSlim.length) {
    target.speakingTopics = cache.speakingTopicsSlim.map((item) => Object.assign({}, item, { id: String(item.id) }));
  }
}

export function writeBankCache(state) {
  try {
    localStorage.setItem(
      BANK_CACHE_KEY,
      JSON.stringify(
        bankCacheShape({
          writing: state.questions,
          speakingTopics: state.speakingTopics,
          cachedAt: new Date().toISOString(),
        }),
      ),
    );
  } catch {
    /* cache is optional */
  }
}

export function loadState() {
  const keys = [STORE_KEY].concat(LEGACY_STORES);
  let merged = null;
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const migrated = migrateState(JSON.parse(raw));
      merged = merged ? mergeBackup(merged, migrated, { includeSettings: key === STORE_KEY }) : migrated;
    } catch {
      /* try the next legacy key */
    }
  }
  if (merged) {
    const assessmentsByHash = new Map();
    merged.assessments.forEach((assessment) => {
      const hash = assessment.contentHash || (assessment.rawText ? hashText(assessment.rawText) : assessment.id);
      const existing = assessmentsByHash.get(hash);
      if (!existing || (!existing.sessionId && assessment.sessionId)) assessmentsByHash.set(hash, assessment);
    });
    merged.assessments = Array.from(assessmentsByHash.values());
    applyBankCache(merged, readBankCache());
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(persistShape(merged)));
      clearLegacyStores(localStorage);
    } catch {
      /* save may fail; caller can toast */
    }
    return merged;
  }
  const empty = emptyState();
  applyBankCache(empty, readBankCache());
  return empty;
}

export function saveState(state, onQuotaToast) {
  try {
    state.schemaVersion = 7;
    localStorage.setItem(STORE_KEY, JSON.stringify(persistShape(state)));
    clearLegacyStores(localStorage);
    return true;
  } catch {
    compactAssessmentsForQuota(state);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(persistShape(state)));
      clearLegacyStores(localStorage);
      if (onQuotaToast) onQuotaToast('Storage is tight. Older score text was compressed. Export a backup now.');
      return true;
    } catch {
      if (onQuotaToast) onQuotaToast('Export a backup now');
      return false;
    }
  }
}

export function downloadFile(name, text, mime) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
}
