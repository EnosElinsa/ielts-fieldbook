import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { emptyState } from '../../src/domain';
import { getVocabularyReviewQueue } from '../../src/domain/vocabulary';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';
import { reviewedEntry } from '../../src/domain/vocabulary/content';
import { buildVocabularySessionCommit, createVocabularySession, updateVocabularySessionAnswer } from '../../src/domain/vocabulary/session';
import type { VocabularyEntry } from '../../src/domain/vocabulary/types';
import { isVocabularyReadingNote, supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import { learningTask } from '../../src/domain/vocabulary/content';
import corrections from '../../src/domain/vocabulary/readinessCorrections.json';

const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const fine = catalog.entries.find((entry: VocabularyEntry) => entry.term === 'fine') as VocabularyEntry;

test.each(['dictation', 'definition'] as const)('an independently restored top-level meaning can complete its first %s session', mode => {
  const entry = catalog.entries.find((entry: VocabularyEntry) => entry.term === 'know') as VocabularyEntry;
  const row = corrections.find(row => 'dictionarySourceAnchorSenseId' in row && row.entryId === entry.id)!;
  const sense = supplementVocabularySense(entry.id, row.originalSense!, [], () => false);
  const entries = VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[];
  entries.push(entry);
  try {
    const selected = { ...entry, senses: [sense] };
    expect(isVocabularyReadingNote(entry.id, sense)).toBe(true);
    expect(learningTask(selected, sense, 'cloze')).toBeUndefined();
    const cards = getVocabularyReviewQueue({ vocabulary: [selected] }, { entryId: entry.id, senseId: sense.id, mode, dueOnly: false });
    expect(cards).toHaveLength(1);
    const session = createVocabularySession(cards, mode, {});
    const answered = updateVocabularySessionAnswer(session, session.cardIds[0].id, 'know');
    const state = emptyState();
    const result = buildVocabularySessionCommit(state, answered, cards);
    expect(result.summary.correct).toBe(1);
    expect(result.state.vocabulary.find(item => item.id === entry.id)?.senses.find(item => item.id === sense.id)).toMatchObject({ id: sense.id, definition: sense.definition });
    expect(result.state.vocabularyReviews[0].senseId).toBe(sense.id);
    expect(state.vocabulary).toEqual([]);
  } finally { entries.pop(); }
});

test.each(['dictation', 'definition'] as const)('a first %s session can save a restored public default before that meaning was saved separately', mode => {
  const entries = VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[];
  entries.push(fine);
  try {
    const selected = reviewedEntry(fine);
    const sense = selected.senses[0];
    expect(sense.id).toMatch(/^wiktionary:restored:/);
    const cards = getVocabularyReviewQueue({ vocabulary: [selected] }, { entryId: fine.id, senseId: sense.id, mode, dueOnly: false });
    expect(cards).toHaveLength(1);
    const session = createVocabularySession(cards, mode, {});
    const answered = updateVocabularySessionAnswer(session, session.cardIds[0].id, 'fine');
    for (const existing of [[], [fine]]) {
      const state = emptyState(); state.vocabulary = structuredClone(existing);
      const committed = buildVocabularySessionCommit(state, answered, cards);
      expect(committed.summary.correct).toBe(1);
      expect(committed.state.vocabulary.find(entry => entry.id === fine.id)?.senses.find(item => item.id === sense.id)?.definition).toBe(sense.definition);
      expect(committed.state.vocabularyReviews[0].senseId).toBe(sense.id);
      expect(committed.results[0].definition).toBe(sense.definition);
      expect(state.vocabulary).toEqual(existing);
    }
    for (const patch of [{ id: 'wiktionary:restored:unknown' }, { definition: 'Unregistered content.' }, { pos: 'other' }, { source: 'Personal note' }]) {
      const altered = { ...sense, ...patch };
      const input = [{ ...cards[0], id: `${fine.id}:${altered.id}:${mode}`, senseId: altered.id, context: undefined, entry: { ...selected, senses: [altered] } }];
      const unsupported = createVocabularySession(input, mode, {});
      const state = emptyState(); state.vocabulary = [structuredClone(fine)];
      expect(() => buildVocabularySessionCommit(state, unsupported, input)).toThrow(/stale/);
      expect(state.vocabularyReviews).toEqual([]);
    }
  } finally { entries.pop(); }
});
