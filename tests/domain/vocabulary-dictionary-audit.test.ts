import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
// @ts-expect-error The audit is also an executable ES module.
import { inspectDictionaryReview } from '../../scripts/audit-vocabulary-dictionary.mjs';
const original = { id: 'river', pos: 'noun', definition: 'Land beside a river.', example: '' };
const row = { entryId: 'bank', senseId: 'river', originalSense: original, definition: 'Land along a river.', example: 'We sat on the river bank.', collocations: ['river bank'], distinctions: ['Shore is usual beside a sea.'] };
const review = { term: 'bank', entryId: 'bank', senseId: 'river', sourceHash: createHash('sha256').update(JSON.stringify(original)).digest('hex'), reviewedAreas: ['definition','example','collocations','distinctions'] };
const input = { entries: [{ id: 'bank', term: 'bank' }], dictionaries: { bank: { senses: [original] } }, corrections: [row], records: [review], diagrams: [] };

test('review accounting reconciles every source sense and flags changed source fingerprints', () => {
  const valid = inspectDictionaryReview(input);
  expect(valid.summary).toMatchObject({ terms: 1, senses: 1, reviewed: 1, pending: 0 });
  expect(valid.errors).toEqual([]);
  const changed = inspectDictionaryReview({ ...input, dictionaries: { bank: { senses: [{ ...original, definition: 'Changed source meaning.' }] } } });
  expect(changed.errors.join(' ')).toMatch(/source hash/i);
  expect(changed.summary.reviewed).toBe(0);
});

test('orphaned identities, duplicate reviews and mismatched diagrams fail the audit', () => {
  const result = inspectDictionaryReview({ ...input, records: [review, review, { ...review, senseId: 'absent' }], diagrams: [{ entryId: 'bank', senseId: 'river', term: 'bank', pos: 'noun', definition: 'A financial institution.', kind: 'financial-bank' }] });
  expect(result.errors.join(' ')).toMatch(/duplicate/i);
  expect(result.errors.join(' ')).toMatch(/source sense/i);
  expect(result.errors.join(' ')).toMatch(/diagram/i);
});
