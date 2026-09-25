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
import { hydrateState } from '../../src/storage';

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

describe('hydrateState', () => {
  test('falls back to localStorage when the study file API is missing', async () => {
    localStorage.setItem(
      'ielts-writing-fieldbook',
      JSON.stringify({ schemaVersion: 8, sessions: [{ id: 'local-1', essay: 'kept' }], settings: {} }),
    );
    const fetchMock = async () => {
      throw new Error('no server');
    };
    vi.stubGlobal('fetch', fetchMock);
    const state = await hydrateState();
    expect(state.sessions.map((session) => session.id)).toContain('local-1');
  });

  test('merges local records into the shared file and writes them back', async () => {
    localStorage.setItem(
      'ielts-writing-fieldbook',
      JSON.stringify({
        schemaVersion: 8,
        sessions: [{ id: 'local-only', essay: 'from this address' }],
        settings: { dailyMinutes: 30 },
      }),
    );
    let written: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init && init.method === 'PUT') {
          written = String(init.body);
          return { ok: true } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            stored: true,
            state: {
              schemaVersion: 8,
              sessions: [{ id: 'on-disk', essay: 'from the other address' }],
              settings: { dailyMinutes: 60 },
            },
          }),
        } as Response;
      }),
    );
    const state = await hydrateState();
    const ids = state.sessions.map((session) => session.id);
    expect(ids).toContain('on-disk');
    expect(ids).toContain('local-only');
    expect(written).toContain('local-only');
    expect(written).toContain('on-disk');
  });
});
