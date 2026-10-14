import compact from './identityRuntime.json';

// Membership prefixes and sequential canonical suffixes are stored once per group.
const mapping = {
  version: compact.version, books: compact.books, units: compact.units,
  memberships: (compact.groups as [number, [number, string][]][]).flatMap(([unitIndex, rows]) => {
    const unit = compact.units[unitIndex];
    return rows.map(([sourceId, entryId], index) => ({ oldId: `${unit.oldStorageId}:${sourceId}`, id: `${unit.id}-member-${String(index + 1).padStart(3, '0')}`, entryId }));
  }),
};

const books = new Map(mapping.books.flatMap(row => [[row.oldId, row.id], [row.sourceBookId, row.id]]));
const units = new Map(mapping.units.flatMap(row => [[row.oldId, row.id], [row.oldStorageId, row.id]]));
const memberships = new Map(mapping.memberships.map(row => [row.oldId, row.id]));
const provenance = new Set(['sourceRecord', 'sourceReports', 'record', 'reports', 'answers', 'responses']);
const identityMaps = new Set(['booksById', 'unitsById', 'membershipsById']);
export const VOCABULARY_IDENTITIES = mapping;
export function normalizeVocabularyBookId(value: string): string { return books.get(value) || value; }
export function normalizeVocabularyUnitId(value: string): string {
  if (value.startsWith('starter:')) return `${normalizeVocabularyBookId(value.slice(8))}-editorial-starter`;
  return units.get(value) || value;
}
export function normalizeVocabularyRowId(value: string): string {
  if (value.startsWith('import-enrollment:')) return `import-enrollment:${normalizeVocabularyBookId(value.slice(18))}`;
  const progress = value.match(/^guixue-progress:(.*):(\d+):(\d+)$/);
  if (progress && units.has(progress[3])) return `imported-progress:${progress[1]}:${normalizeVocabularyUnitId(progress[3])}`;
  const source = value.match(/^(guixue:\d+):(\d+):(ve-[^:]+)(:membership)?$/);
  if (source && books.has(source[1]) && units.has(source[2])) return `${normalizeVocabularyBookId(source[1])}:${normalizeVocabularyUnitId(source[2])}:${source[3]}${source[4] || ''}`;
  return memberships.get(value) || books.get(value) || units.get(value) || value;
}
export function normalizeVocabularyScope<T extends { bookId?: string; unitId?: string }>(value: T): T {
  return { ...value, ...(value.bookId ? { bookId: normalizeVocabularyBookId(value.bookId) } : {}), ...(value.unitId ? { unitId: normalizeVocabularyUnitId(value.unitId) } : {}) };
}
/** Convert structural references only. Provider records and human content are opaque. */
export function normalizeVocabularyIdentities<T>(value: T, field = ''): T {
  if (provenance.has(field)) return value;
  if (Array.isArray(value)) return value.map(row => normalizeVocabularyIdentities(row, field)) as T;
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(input).map(([key, row]) => {
      let next = normalizeVocabularyIdentities(row, key);
      if (key === 'id' && typeof row === 'string') {
        next = memberships.get(row) || (row.startsWith('guixue:') ? books.get(row) : undefined) || (input.bookId && ('parentId' in input || 'kind' in input) ? normalizeVocabularyUnitId(row) : row);
        if (row.startsWith('import-enrollment:') || row.startsWith('guixue-progress:') || input.type === 'wordbook') next = normalizeVocabularyRowId(row);
        if (field === 'units' && units.has(row)) next = normalizeVocabularyUnitId(row);
      }
      return [identityMaps.has(field) ? memberships.get(key) || books.get(key) || units.get(key) || key : key, next];
    })) as T;
  }
  if (typeof value === 'string') {
    if (field === 'bookId') return normalizeVocabularyBookId(value) as T;
    if (field === 'unitId' || field === 'parentId') return normalizeVocabularyUnitId(value) as T;
    if (field === 'membershipId' || field === 'sourceId') return (memberships.has(value) || /^guixue:\d+:\d+:ve-/.test(value) ? normalizeVocabularyRowId(value) : value) as T;
    if (field === 'returnTo' || field === 'href' || field === 'origin') return normalizeVocabularyRoute(value) as T;
  }
  return value;
}
export function normalizeVocabularyRoute(value: string): string {
  if (!value.startsWith('/vocabulary')) return value;
  try {
  const url = new URL(value, 'https://fieldbook.invalid');
  const parts = url.pathname.split('/');
  if (parts[2] === 'wordbooks' && parts[3]) parts[3] = encodeURIComponent(normalizeVocabularyBookId(decodeURIComponent(parts[3])));
  if (parts[4] === 'groups' && parts[5]) parts[5] = encodeURIComponent(normalizeVocabularyUnitId(decodeURIComponent(parts[5])));
  for (const field of ['bookId', 'unitId', 'returnTo']) {
    const current = url.searchParams.get(field);
    if (current) url.searchParams.set(field, field === 'bookId' ? normalizeVocabularyBookId(current) : field === 'unitId' ? normalizeVocabularyUnitId(current) : normalizeVocabularyRoute(current));
  }
  return parts.join('/') + (url.search ? url.search : '') + url.hash;
  } catch { return value; }
}
