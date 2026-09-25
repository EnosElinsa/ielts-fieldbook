export const USER_LISTS = ['sessions', 'assessments', 'lexicon', 'errors', 'plans', 'stories'] as const;

export type UserListKey = (typeof USER_LISTS)[number];

export type RowDiff = {
  upserts: { id: string; payload: unknown }[];
  deletes: string[];
};

function stable(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function diffList(previous: unknown[], next: unknown[]): RowDiff {
  const before = new Map<string, string>();
  (previous || []).forEach((item, index) => {
    const record = item && typeof item === 'object' ? (item as { id?: string }) : {};
    const id = String(record.id || `legacy-${index}`);
    before.set(id, stable(item));
  });
  const after = new Map<string, unknown>();
  (next || []).forEach((item, index) => {
    const record = item && typeof item === 'object' ? (item as { id?: string }) : {};
    const id = String(record.id || `legacy-${index}`);
    after.set(id, item);
  });
  const upserts: RowDiff['upserts'] = [];
  const deletes: string[] = [];
  after.forEach((payload, id) => {
    if (before.get(id) !== stable(payload)) upserts.push({ id, payload });
  });
  before.forEach((_payload, id) => {
    if (!after.has(id)) deletes.push(id);
  });
  return { upserts, deletes };
}

export function diffDrafts(previous: Record<string, unknown> | null, next: Record<string, unknown> | null): RowDiff {
  const before = previous && typeof previous === 'object' ? previous : {};
  const after = next && typeof next === 'object' ? next : {};
  const upserts: RowDiff['upserts'] = [];
  const deletes: string[] = [];
  Object.keys(after).forEach((id) => {
    if (stable(before[id]) !== stable(after[id])) upserts.push({ id, payload: after[id] });
  });
  Object.keys(before).forEach((id) => {
    if (!Object.prototype.hasOwnProperty.call(after, id)) deletes.push(id);
  });
  return { upserts, deletes };
}

export function profileStamp(state: {
  settings?: unknown;
  activePlanId?: unknown;
  reviewedAt?: unknown;
}) {
  return stable({
    settings: state?.settings || {},
    activePlanId: state?.activePlanId ?? null,
    reviewedAt: state?.reviewedAt ?? null,
  });
}

export function rowsToList(rows: { payload?: unknown }[] | null) {
  return (rows || []).map((row) => row.payload).filter((payload) => payload && typeof payload === 'object');
}

export function rowsToDrafts(rows: { id?: string; payload?: unknown }[] | null) {
  const drafts: Record<string, unknown> = {};
  (rows || []).forEach((row) => {
    if (!row || !row.id) return;
    drafts[String(row.id)] = row.payload;
  });
  return drafts;
}
