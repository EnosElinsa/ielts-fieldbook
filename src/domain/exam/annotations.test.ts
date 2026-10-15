import { expect, test } from 'vitest';
import { makeTextAnchor, resolveTextAnchor, annotationSegments, normalizeExamAnnotations } from './annotations';
import { migrateState, persistShape } from '../state';
import { validateBackup, mergeBackup } from '../backup';
import { USER_LISTS, USER_TABLES } from '../../storage/sync';
import { ACCOUNT_MODULES } from '../../storage/accountModules';

test('an unchanged source restores the selected occurrence even when the quote repeats', () => {
  const text = 'A garden opened. Another garden closed.';
  const anchor = makeTextAnchor('p:A', text, 25, 31, 'v1');
  expect(anchor.quote).toBe('garden');
  expect(resolveTextAnchor(anchor, text, 'v1')).toEqual({ start: 25, end: 31 });
});

test('a source edit reanchors by exact context and never chooses an ambiguous quote', () => {
  const anchor = makeTextAnchor('p:A', 'The garden opened in 1990.', 4, 10, 'v1');
  expect(resolveTextAnchor(anchor, 'Introduction. The garden opened in 1990.', 'v2')).toEqual({ start: 18, end: 24 });
  const contextFree = { ...anchor, prefix: '', suffix: '' };
  expect(resolveTextAnchor(contextFree, 'garden and garden', 'v2')).toBeNull();
  expect(resolveTextAnchor(anchor, 'The park opened in 1990.', 'v2')).toBeNull();
});

test('overlapping highlights preserve both note identities without duplicating source text', () => {
  const text = 'The garden opened.';
  const first = { id: 'a', skill: 'reading' as const, sourceId: 's', color: 'yellow' as const, quote: 'garden', note: 'first', updatedAt: '2026-10-14', anchors: [makeTextAnchor('p:A', text, 4, 10, 'v1')] };
  const second = { ...first, id: 'b', quote: 'garden opened', note: 'second', color: 'green' as const, anchors: [makeTextAnchor('p:A', text, 4, 17, 'v1')] };
  const parts = annotationSegments('p:A', text, 'v1', [first, second]);
  expect(parts.map(part => part.text).join('')).toBe(text);
  expect(parts.find(part => part.text === 'garden')?.annotationIds).toEqual(['a', 'b']);
});

test('source annotations are normalized, persisted, backed up and registered for cloud loading', () => {
  const row = { id: 'note', skill: 'reading', sourceId: 's', color: 'yellow', quote: 'garden', note: 'A note', updatedAt: '2026-10-14T01:00:00Z', anchors: [makeTextAnchor('p:A', 'garden', 0, 6, '1')] };
  const state = migrateState({ examAnnotations: [row, { id: 'invalid' }] });
  expect(state.examAnnotations).toEqual([row]);
  expect(persistShape(state).examAnnotations).toEqual([row]);
  expect(validateBackup({ examAnnotations: [row] }).counts).toMatchObject({ examAnnotations: 1 });
  expect(mergeBackup(migrateState({}), { examAnnotations: [row] }, {}).examAnnotations).toEqual([row]);
  expect(USER_LISTS).toContain('examAnnotations');
  expect(USER_TABLES.examAnnotations).toBe('exam_annotations');
  expect(ACCOUNT_MODULES.receptive).toContain('examAnnotations');
  expect(normalizeExamAnnotations([{ ...row, color: 'invalid' }])[0].color).toBe('yellow');
  const noteOnly = { ...row, highlighted: false };
  expect(persistShape(migrateState({ examAnnotations: [noteOnly] })).examAnnotations).toEqual([noteOnly]);
  expect(mergeBackup(migrateState({}), { examAnnotations: [noteOnly] }, {}).examAnnotations).toEqual([noteOnly]);
  expect(annotationSegments('p:A', 'garden', '1', [noteOnly as any])).toMatchObject([{ text: 'garden', annotationIds: ['note'], color: undefined }]);
});
