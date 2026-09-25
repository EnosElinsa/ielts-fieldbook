import fs from 'node:fs';
import path from 'node:path';

const STATE_NAME = 'fieldbook-state.json';
const AUDIO_ID = /^[A-Za-z0-9-]{1,80}$/;

export function stateFilePath(rootDir: string): string {
  return path.resolve(rootDir, 'local', STATE_NAME);
}

export function readStateFile(rootDir: string): { stored: false } | { stored: true; state: unknown } {
  const filePath = stateFilePath(rootDir);
  if (!fs.existsSync(filePath)) return { stored: false };
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { stored: false };
  }
  return { stored: true, state: parsed };
}

export function writeStateFile(rootDir: string, payload: unknown): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('State must be an object');
  }
  const dir = path.resolve(rootDir, 'local');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = stateFilePath(rootDir);
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(payload));
  fs.renameSync(temporary, filePath);
}

export function audioFilePath(rootDir: string, audioId: string): string | null {
  if (!AUDIO_ID.test(audioId)) return null;
  const root = path.resolve(rootDir, 'local', 'audio');
  const filePath = path.resolve(root, audioId);
  if (filePath !== path.join(root, audioId)) return null;
  return filePath;
}

export function mimeFilePath(audioPath: string): string {
  return `${audioPath}.mime`;
}

export function writeAudioFile(rootDir: string, audioId: string, bytes: Buffer, mime: string): string {
  const filePath = audioFilePath(rootDir, audioId);
  if (!filePath) throw new Error('Bad audio id');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, filePath);
  const type = mime && mime.startsWith('audio/') ? mime.split(';')[0] : 'audio/webm';
  fs.writeFileSync(mimeFilePath(filePath), type);
  return filePath;
}

export function readAudioMeta(rootDir: string, audioId: string): { filePath: string; mime: string } | null {
  const filePath = audioFilePath(rootDir, audioId);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  let mime = 'audio/webm';
  const note = mimeFilePath(filePath);
  if (fs.existsSync(note)) {
    const stored = fs.readFileSync(note, 'utf8').trim();
    if (stored.startsWith('audio/')) mime = stored;
  }
  return { filePath, mime };
}
