import { describe, expect, test } from 'vitest';
import { hydrateState } from '../../src/storage';
import { diffDrafts, diffList, profileStamp, rowsToDrafts, rowsToList } from '../../src/storage/sync';

describe('account hydrate', () => {
  test('starts empty and ignores an older browser copy', async () => {
    localStorage.setItem(
      'ielts-writing-fieldbook',
      JSON.stringify({ schemaVersion: 8, sessions: [{ id: 'local-1', essay: 'kept' }] }),
    );
    const state = await hydrateState();
    expect(state.sessions).toEqual([]);
  });
});

describe('row diff', () => {
  test('upserts changed rows and deletes missing ids', () => {
    const diff = diffList(
      [
        { id: 'keep', essay: 'same' },
        { id: 'edit', essay: 'old' },
        { id: 'gone', essay: 'x' },
      ],
      [
        { id: 'keep', essay: 'same' },
        { id: 'edit', essay: 'new' },
        { id: 'fresh', essay: 'y' },
      ],
    );
    expect(diff.deletes).toEqual(['gone']);
    expect(diff.upserts.map((row) => row.id).sort()).toEqual(['edit', 'fresh']);
  });

  test('draft keys are the row ids', () => {
    const diff = diffDrafts({ q1: { text: 'a' }, q2: { text: 'b' } }, { q1: { text: 'a' }, q3: { text: 'c' } });
    expect(diff.deletes).toEqual(['q2']);
    expect(diff.upserts).toEqual([{ id: 'q3', payload: { text: 'c' } }]);
  });

  test('profile stamp ignores question catalogs', () => {
    const left = profileStamp({ settings: { dailyMinutes: 30 }, activePlanId: null, reviewedAt: null });
    const right = profileStamp({ settings: { dailyMinutes: 45 }, activePlanId: null, reviewedAt: null });
    expect(left).not.toBe(right);
  });

  test('rows rebuild lists and drafts', () => {
    expect(rowsToList([{ payload: { id: 's1' } }, { payload: null }])).toEqual([{ id: 's1' }]);
    expect(rowsToDrafts([{ id: 'q1', payload: { text: 'hi' } }])).toEqual({ q1: { text: 'hi' } });
  });
});
