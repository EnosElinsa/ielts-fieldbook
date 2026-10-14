const prefix = 'fieldbook-exam-recovery-v1';
const keyFor = (owner: string, key: string) => `${prefix}:${owner}:${key}`;
export function readExamRecovery<T>(owner: string | null, key: string): T | null {
  if (!owner) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(owner, key)) || 'null');
    return raw && raw.version === 1 && raw.owner === owner ? raw.data as T : null;
  } catch { return null; }
}
/** Read this account's exact recovery scope and its plan/retry child scopes. */
export function readExamRecoveries<T>(owner: string | null, scope: string): T[] {
  if (!owner) return [];
  try {
    const base = keyFor(owner, scope);
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    return keys.flatMap(key => {
      if (!key || (key !== base && !key.startsWith(`${base}:`))) return [];
      const data = readExamRecovery<T>(owner, key.slice(keyFor(owner, '').length));
      return data ? [data] : [];
    });
  } catch { return []; }
}
export function writeExamRecovery<T>(owner: string | null, key: string, data: T): boolean {
  if (!owner) return false;
  try { localStorage.setItem(keyFor(owner, key), JSON.stringify({ version: 1, owner, data, savedAt: new Date().toISOString() })); return true; }
  catch { return false; }
}
export function clearExamRecovery(owner: string | null, key: string): void {
  if (owner) { try { localStorage.removeItem(keyFor(owner, key)); } catch { /* storage unavailable */ } }
}
export function clearAccountExamRecovery(owner: string | null): void {
  if (!owner) return;
  try {
    const accountPrefix = `${prefix}:${owner}:`;
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    keys.filter((key): key is string => !!key && key.startsWith(accountPrefix)).forEach(key => localStorage.removeItem(key));
  } catch { /* storage unavailable */ }
}
