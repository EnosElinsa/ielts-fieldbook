type Drafts = Record<string, unknown>;
type Recovery = { drafts: Drafts; savedAt: string };
const key = (accountId: string) => `fieldbook-drafts-v1:${accountId}`;

export function writeDraftRecovery(accountId: string | null, drafts: Drafts) {
  if (!accountId) return;
  try { localStorage.setItem(key(accountId), JSON.stringify({ drafts, savedAt: new Date().toISOString() })); } catch { /* Cloud saves remain available if local storage is full. */ }
}
export function readDraftRecovery(accountId: string | null): Recovery | null {
  if (!accountId) return null;
  try {
    const value = JSON.parse(localStorage.getItem(key(accountId)) || 'null');
    return value && value.drafts && typeof value.drafts === 'object' && !Array.isArray(value.drafts) ? value : null;
  } catch { return null; }
}
export function discardDraftRecovery(accountId: string | null) {
  if (!accountId) return;
  try { localStorage.removeItem(key(accountId)); } catch { /* Storage can be disabled. */ }
}
export function differentDrafts(local: Drafts, remote: Drafts): Drafts {
  const result: Drafts = {};
  Object.entries(local).forEach(([id, value]) => {
    const draft = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const hasContent = [draft.text, draft.transcript, draft.notes, ...Object.values((draft.sections || {}) as object)].some((part) => String(part || '').trim());
    if (hasContent && JSON.stringify(value) !== JSON.stringify(remote[id])) result[id] = value;
  });
  return result;
}
