import { addVocabularyItem, vocabularyKey } from './index';
import { normalizeVocabularySources } from './sources';
import { hashText } from '../utils';
import type { VocabularyEntry, VocabularySense, VocabularySource, VocabularyStore } from './types';

export type VocabularyCollectionChoice = { term: string; entry?: VocabularyEntry; category?: VocabularyEntry['category']; sense: VocabularySense; sources: VocabularySource[]; tags?: string[] };

/** Collect an occurrence separately from editing an existing meaning or its learning evidence. */
export function collectVocabularyChoice(state: VocabularyStore, choice: VocabularyCollectionChoice) {
  const key = vocabularyKey(choice.term);
  const existing = state.vocabulary.find(row => choice.entry?.id === row.id && vocabularyKey(row.term) === key)
    || state.vocabulary.find(row => vocabularyKey(row.term) === key);
  const savedSense = existing?.senses.find(row => Boolean(choice.sense.id) && row.id === choice.sense.id)
    || existing?.senses.find(row => vocabularyKey(row.definition) === vocabularyKey(choice.sense.definition) && vocabularyKey(row.pos) === vocabularyKey(choice.sense.pos));
  if (existing && savedSense) {
    existing.sources = normalizeVocabularySources([...existing.sources, ...choice.sources.map(source => ({ ...source, senseId: savedSense.id }))]);
    existing.tags = [...new Set([...existing.tags, ...(choice.tags || [])])].filter(tag => tag !== 'archived');
    existing.enrichmentPending = existing.senses.every(row => !row.definition.trim());
    existing.updatedAt = new Date().toISOString();
    return { item: existing, duplicate: true, invalid: false };
  }
  // Build a sanitized single-meaning entry without letting a matching definition
  // in another part of speech redirect this explicitly chosen meaning.
  const scratch: Partial<VocabularyStore> = {};
  const result = addVocabularyItem(scratch, { id: existing?.id || choice.entry?.id, term: choice.term, category: choice.category || choice.entry?.category,
    senses: [{ ...choice.sense, id: choice.sense.id || `sense-${hashText(`${key}:${vocabularyKey(choice.sense.definition)}:${vocabularyKey(choice.sense.pos)}`)}` }], sources: choice.sources, tags: choice.tags, pronunciation: choice.entry?.pronunciation });
  if (!result.item) return result;
  const fresh = result.item;
  if (!existing) {
    const preferredId = fresh.id;
    let suffix = 1;
    while (state.vocabulary.some(row => row.id === fresh.id)) fresh.id = `${preferredId}-${suffix++}`;
    if (fresh.id !== preferredId) for (const learning of scratch.vocabularyStates || []) {
      learning.entryId = fresh.id;
      learning.id = `vs-${hashText(`${fresh.id}:${learning.senseId}`)}`;
    }
    state.vocabulary.push(fresh);
  }
  else {
    const sense = fresh.senses[0];
    // An explicitly new personal meaning may reuse an ID from an older definition.
    if (existing.senses.some(row => row.id === sense.id)) throw new Error('This meaning conflicts with a saved meaning. Reload and choose it again.');
    if (sense.definition.trim() && existing.senses.every(row => !row.definition.trim())) {
      existing.senses.unshift(sense);
      existing.meaning = sense.definition;
      existing.example = sense.example;
    } else existing.senses.push(sense);
    existing.sources = normalizeVocabularySources([...existing.sources, ...fresh.sources]);
    existing.tags = [...new Set([...existing.tags, ...fresh.tags])].filter(tag => tag !== 'archived');
    existing.enrichmentPending = existing.senses.every(row => !row.definition.trim());
    existing.updatedAt = fresh.updatedAt;
  }
  state.vocabularyStates.push(...(scratch.vocabularyStates || []).filter(row => !state.vocabularyStates.some(saved => saved.entryId === row.entryId && saved.senseId === row.senseId)));
  return { item: existing || fresh, duplicate: Boolean(existing), invalid: false };
}
