import registry from './sensePronunciations.json';
import type { VocabularyEntry, VocabularySense } from './types';
import type { VocabularyAccent, VocabularyRecording } from './media';

/** IDs refer to retained, immutable registry rows. Null freezes a missing match. */
export type FrozenVocabularyPronunciation = { version: 1; bindingId: string | null } | 'legacy';
type Binding = typeof registry.bindings[number];
type Group = { id: string; term: string; scope: string; sourceUrl: string; ipa: Record<VocabularyAccent, string>; audioMarkup: string[]; recordings: Partial<Record<VocabularyAccent, string>> };
const bindings = new Map(registry.bindings.map(row => [row.id, row]));
const groups = new Map((registry.groups as Group[]).map(row => [row.id, row]));
const recordings = new Map((registry.recordings as (VocabularyRecording & { id: string })[]).map(row => [row.id, row]));
const protectedTerms = new Set(registry.protectedTerms);
const matches = (binding: Binding, entry: VocabularyEntry, sense?: VocabularySense) => Boolean(sense && sense.source !== 'Personal note' &&
  binding.entryId === entry.id && binding.term === entry.term && binding.senseId === sense.id && binding.definition === sense.definition && binding.pos === sense.pos);

export function isFrozenVocabularyPronunciation(value: unknown, entry: VocabularyEntry, sense?: VocabularySense): value is FrozenVocabularyPronunciation {
  if (value === 'legacy') return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 2 || row.version !== 1) return false;
  if (row.bindingId === null) return true;
  const binding = typeof row.bindingId === 'string' ? bindings.get(row.bindingId) : undefined;
  return Boolean(binding && matches(binding, entry, sense));
}

/** Filenames, accent labels, POS alone and learner replacements cannot establish a reading. */
export function getVocabularyPronunciation(entry: VocabularyEntry, sense?: VocabularySense, frozen?: FrozenVocabularyPronunciation): {
  required: boolean; legacy?: boolean; invalid?: boolean; binding?: Binding; group?: Group; recordings: VocabularyRecording[];
} {
  if (frozen === 'legacy') return { required: false, legacy: true, recordings: [] };
  const required = protectedTerms.has(entry.term.trim().toLowerCase());
  if (frozen !== undefined && !isFrozenVocabularyPronunciation(frozen, entry, sense)) return { required: true, invalid: true, recordings: [] };
  const binding = frozen !== undefined
    ? frozen.bindingId === null ? undefined : bindings.get(frozen.bindingId)
    : registry.bindings.find(row => matches(row, entry, sense));
  const group = binding ? groups.get(binding.groupId) : undefined;
  return { required: required || frozen !== undefined, ...(binding && group ? { binding, group } : {}),
    recordings: group ? Object.values(group.recordings).flatMap(id => { const audio = id ? recordings.get(id) : undefined; return audio ? [audio] : []; }) : [] };
}

export function freezeVocabularyPronunciation(entry: VocabularyEntry, sense?: VocabularySense): FrozenVocabularyPronunciation | undefined {
  const result = getVocabularyPronunciation(entry, sense);
  return result.required ? { version: 1, bindingId: result.binding?.id || null } : undefined;
}
