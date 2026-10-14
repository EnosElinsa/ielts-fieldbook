import { expect, test } from 'vitest';
import { differentDrafts } from './recovery';
import { normalizeDraft } from '../domain/state';
test('prompt-only recovery remains available with identity and parent metadata', () => {
  const local = { topic: normalizeDraft({ responses: { key: { promptKey: 'key', promptText: 'A question', promptIndex: 2, part: '3', transcript: 'Saved locally', parentSessionId: 'parent', targetErrorIds: ['error'] } } }) };
  expect(differentDrafts(local, {})).toEqual(local);
  expect(differentDrafts(local, local)).toEqual({});
});
