import { vocabularyTeaching, vocabularyTeachingRevision } from './runtimeData';
import type { VocabularySense } from './types';

const abbreviations: Record<string, string> = { adjective: 'adj', adverb: 'adv', preposition: 'prep', conjunction: 'conj', pronoun: 'pron', interjection: 'intj', determiner: 'det', numeral: 'num' };
/** Part-of-speech labels differ between dictionary and curriculum data (`adj` and `adjective`); compare them on one scale. */
export const comparablePartOfSpeech = (pos: string | undefined) => { const value = (pos || '').trim().toLowerCase(); return abbreviations[value] || value; };
type PublishedRow = { sense: VocabularySense; originalSense?: VocabularySense };
const rowsByEntry = new Map<string, PublishedRow[]>();
let revision = -1;

/** Runtime index over curriculum rows that have been registered for the current account. No bundled data is read. */
function publishedRows(entryId: string): PublishedRow[] {
  if (revision !== vocabularyTeachingRevision) {
    revision = vocabularyTeachingRevision;
    rowsByEntry.clear();
    const { common, topics, source, repairs, modern } = vocabularyTeaching.curriculum;
    for (const rows of [common, topics, source, repairs, modern]) {
      for (const row of rows) {
        const list = rowsByEntry.get(row.entryId);
        if (list) list.push(row); else rowsByEntry.set(row.entryId, [row]);
      }
    }
  }
  return rowsByEntry.get(entryId) || [];
}

/**
 * Dictionary sense IDs that an unmodified published curriculum meaning stands for.
 * The curriculum can reword a meaning, or give it an editorial ID, without changing which
 * dictionary meaning it teaches. Any learner edit to the ID, definition, part of speech
 * or source (and every personal note) returns no identity, so edited content never inherits
 * pronunciation or diagram evidence. The original dictionary ID counts only when it has
 * the same part of speech as the published meaning.
 */
export function publishedCurriculumSenseIds(entryId: string, sense: VocabularySense | undefined): string[] {
  if (!sense || sense.source === 'Personal note') return [];
  const ids = new Set<string>();
  for (const row of publishedRows(entryId)) {
    const published = row.sense;
    if (published.id !== sense.id || published.definition !== sense.definition || published.pos !== sense.pos || published.source !== sense.source) continue;
    ids.add(published.id);
    const original = row.originalSense;
    if (original && comparablePartOfSpeech(original.pos) === comparablePartOfSpeech(sense.pos)) ids.add(original.id);
  }
  return [...ids];
}
