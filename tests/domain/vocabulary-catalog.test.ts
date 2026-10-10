import { describe, expect, it } from 'vitest';
import { VOCABULARY_CATALOG } from '../../src/domain/vocabulary/catalog';

describe('English vocabulary catalogue', () => {
  it('contains six honestly described public books and a useful English starter', () => {
    expect(VOCABULARY_CATALOG.books).toHaveLength(6);
    expect(VOCABULARY_CATALOG.entries.length).toBeGreaterThanOrEqual(60);
    expect(VOCABULARY_CATALOG.books.map(book => book.totalSourceWords)).toEqual([3632, 376, 3051, 1399, 361, 386]);
    for (const book of VOCABULARY_CATALOG.books) {
      expect(book.contentStatus).toBe('starter');
      expect(book.importedEntryCount).toBe(0);
    }
    expect(JSON.stringify(VOCABULARY_CATALOG)).not.toMatch(/[\u3400-\u9fff]/);
  });
  it('provides sense provenance, examples and distinctions without fake exact membership', () => {
    const significant = VOCABULARY_CATALOG.entries.find(entry => entry.term === 'significant');
    expect(significant.senses.length).toBeGreaterThan(1);
    expect(significant.senses[0].collocations).toContain('significant difference');
    for (const entry of VOCABULARY_CATALOG.entries) {
      expect(entry.meaning).toBeTruthy();
      expect(entry.example).toBeTruthy();
      expect(entry.senses[0].source).toBe('Fieldbook editorial');
      expect(entry.senses[0].license).toBe('CC-BY-4.0');
    }
    for (const membership of VOCABULARY_CATALOG.memberships) expect(membership.unitId).toContain('starter:');
  });
});
