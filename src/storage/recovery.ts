type Drafts = Record<string, unknown>;
export type DraftRecoveryVersions = ReadonlyMap<string, string>;
type Recovery = { drafts: Drafts; savedAt: string };
const key = (accountId: string) => `fieldbook-drafts-v1:${accountId}`;
const entryPrefix = (accountId: string) => `fieldbook-draft-entry-v1:${accountId}:`;
function entries(accountId: string) {
  const prefix = entryPrefix(accountId);
  return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((entry): entry is string => Boolean(entry?.startsWith(prefix)))
    .map(entry => [entry, localStorage.getItem(entry)] as const);
}

export function captureDraftRecovery(accountId: string | null): DraftRecoveryVersions {
  if (!accountId) return new Map();
  try {
    const records = new Map<string, string>();
    for (const [name, raw] of [[key(accountId), localStorage.getItem(key(accountId))] as const, ...entries(accountId)]) {
      if (raw !== null) records.set(name, raw);
    }
    return records;
  } catch { return new Map(); }
}

/** Keep each keystroke durable while serializing only the edited draft. */
export function writeDraftRecoveryEntry(accountId: string | null, id: string, draft: unknown) {
  if (!accountId || !id) return;
  try { localStorage.setItem(`${entryPrefix(accountId)}${encodeURIComponent(id)}`, JSON.stringify({ draft, savedAt: new Date().toISOString(), revision: crypto.randomUUID() })); }
  catch { /* Cloud saves remain available if local storage is full. */ }
}

export function writeDraftRecovery(accountId: string | null, drafts: Drafts) {
  if (!accountId) return;
  try {
    // A local snapshot is not a cloud acknowledgement. Keep independent entries
    // durable even when they match: a later stale-tab snapshot can replace this base.
    if (!Object.keys(drafts).length) return;
    let existing: Drafts = {};
    try {
      const previous = JSON.parse(localStorage.getItem(key(accountId)) || 'null')?.drafts;
      if (previous && typeof previous === 'object' && !Array.isArray(previous)) existing = previous;
    } catch { /* A damaged snapshot must not prevent future recovery. */ }
    localStorage.setItem(key(accountId), JSON.stringify({ drafts: { ...existing, ...drafts }, savedAt: new Date().toISOString(), revision: crypto.randomUUID() }));
  } catch { /* Cloud saves remain available if local storage is full. */ }
}
export function readDraftRecovery(accountId: string | null): (Recovery & { versions: DraftRecoveryVersions }) | null {
  if (!accountId) return null;
  const versions = captureDraftRecovery(accountId);
  try {
    let value: Recovery | null = null;
    try {
      const base = JSON.parse(versions.get(key(accountId)) || 'null');
      if (base?.drafts && typeof base.drafts === 'object' && !Array.isArray(base.drafts)) value = base;
    } catch { /* Per-draft recovery can still be available. */ }
    for (const [entry, raw] of versions) {
      if (!entry.startsWith(entryPrefix(accountId))) continue;
      try {
        const patch = JSON.parse(raw || 'null');
        if (!patch || !Object.hasOwn(patch, 'draft') || typeof patch.savedAt !== 'string') continue;
        value ||= { drafts: {}, savedAt: patch.savedAt };
        value.drafts[decodeURIComponent(entry.slice(entryPrefix(accountId).length))] = patch.draft;
        if (patch.savedAt > value.savedAt) value.savedAt = patch.savedAt;
      } catch { /* Ignore only the damaged entry, retaining all other recovery. */ }
    }
    return value && { ...value, versions };
  } catch { return null; }
}
export function discardDraftRecovery(accountId: string | null, acknowledged?: readonly Drafts[], captured?: DraftRecoveryVersions) {
  if (!accountId) return;
  try {
    if (acknowledged) {
      const matches = (id: string, draft: unknown) => acknowledged.some(snapshot => Object.hasOwn(snapshot, id) && JSON.stringify(snapshot[id]) === JSON.stringify(draft));
      const versions = captured ?? captureDraftRecovery(accountId);
      const baseRaw = versions.get(key(accountId));
      for (const [entry, raw] of versions) {
        if (!entry.startsWith(entryPrefix(accountId))) continue;
        try {
          const id = decodeURIComponent(entry.slice(entryPrefix(accountId).length));
          if (matches(id, JSON.parse(raw || 'null')?.draft) && localStorage.getItem(entry) === raw) localStorage.removeItem(entry);
        } catch { /* Preserve damaged entries until explicit discard. */ }
      }
      // Clean the legacy/full snapshot independently. Never move unacknowledged
      // entries into the replaceable base or overwrite another tab's newer base.
      try {
        const base = JSON.parse(baseRaw || 'null');
        if (base?.drafts && typeof base.drafts === 'object' && !Array.isArray(base.drafts)) {
          const remaining = Object.fromEntries(Object.entries(base.drafts).filter(([id, draft]) => !matches(id, draft)));
          if (localStorage.getItem(key(accountId)) === baseRaw) {
            if (!Object.keys(remaining).length) localStorage.removeItem(key(accountId));
            else if (Object.keys(remaining).length !== Object.keys(base.drafts).length) localStorage.setItem(key(accountId), JSON.stringify({ ...base, drafts: remaining }));
          }
        }
      } catch { /* Preserve damaged snapshots until explicit discard. */ }
    } else {
      localStorage.removeItem(key(accountId));
      for (const [entry] of entries(accountId)) localStorage.removeItem(entry);
    }
  } catch { /* Storage can be disabled. */ }
}
export function differentDrafts(local: Drafts, remote: Drafts): Drafts {
  const result: Drafts = {};
  const content = (value: unknown): boolean => {
    const draft = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return [draft.text, draft.transcript, draft.notes, ...Object.values((draft.sections || {}) as object)].some(part => String(part || '').trim())
      || Object.values((draft.responses || {}) as object).some(content);
  };
  Object.entries(local).forEach(([id, value]) => {
    if (content(value) && JSON.stringify(value) !== JSON.stringify(remote[id])) result[id] = value;
  });
  return result;
}
