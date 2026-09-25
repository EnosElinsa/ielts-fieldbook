import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  audioFilePath,
  readAudioMeta,
  readStateFile,
  writeAudioFile,
  writeStateFile,
} from '../../server/fieldbook-files';

const roots: string[] = [];

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fieldbook-state-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length) {
    fs.rmSync(roots.pop() as string, { recursive: true, force: true });
  }
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('study file on disk', () => {
  test('missing file is an empty store, and a write can be read back', () => {
    const root = tempRoot();
    expect(readStateFile(root)).toEqual({ stored: false });
    writeStateFile(root, { schemaVersion: 8, sessions: [{ id: 's1', essay: 'hello' }] });
    expect(readStateFile(root)).toEqual({
      stored: true,
      state: { schemaVersion: 8, sessions: [{ id: 's1', essay: 'hello' }] },
    });
  });

  test('rejects a state that is not an object', () => {
    const root = tempRoot();
    expect(() => writeStateFile(root, [])).toThrow(/object/);
    expect(() => writeStateFile(root, null)).toThrow(/object/);
  });

  test('audio ids cannot escape the audio folder', () => {
    const root = tempRoot();
    expect(audioFilePath(root, '../fieldbook-state.json')).toBeNull();
    expect(audioFilePath(root, '..\\secret')).toBeNull();
    expect(audioFilePath(root, 'a/b')).toBeNull();
    const id = 'recording-1';
    writeAudioFile(root, id, Buffer.from('audio-bytes'), 'audio/webm;codecs=opus');
    expect(readAudioMeta(root, id)).toMatchObject({ mime: 'audio/webm' });
    expect(fs.readFileSync(readAudioMeta(root, id)!.filePath).toString()).toBe('audio-bytes');
  });
});
