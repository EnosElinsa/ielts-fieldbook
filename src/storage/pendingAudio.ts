type PendingAudioRecord = {
  key: string;
  accountId: string;
  topicId: string;
  part: string;
  blob: Blob;
  updatedAt: number;
};

const DB_NAME = 'ielts-fieldbook-local';
const DB_VERSION = 1;
const STORE = 'pending-audio';

function keyFor(owner: string, topicId: string, part: string) {
  return `${owner}::${String(topicId)}::${String(part)}`;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DB_NAME, DB_VERSION); } catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function writePendingAudio(owner: string | null, topicId: string, part: string, blob: Blob): Promise<boolean> {
  if (!owner || !topicId || !part || !blob?.size) return false;
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key: keyFor(owner, topicId, part), accountId: owner, topicId: String(topicId), part: String(part), blob, updatedAt: Date.now() } satisfies PendingAudioRecord);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
      tx.onabort = () => { db.close(); resolve(false); };
    } catch { db.close(); resolve(false); }
  });
}

export async function readPendingAudio(owner: string | null, topicId: string, part: string): Promise<Blob | null> {
  if (!owner || !topicId || !part) return null;
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(keyFor(owner, topicId, part));
      request.onsuccess = () => { db.close(); resolve(request.result?.blob instanceof Blob ? request.result.blob : null); };
      request.onerror = () => { db.close(); resolve(null); };
    } catch { db.close(); resolve(null); }
  });
}

export async function deletePendingAudio(owner: string | null, topicId: string, part: string): Promise<boolean> {
  if (!owner || !topicId || !part) return false;
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(keyFor(owner, topicId, part));
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
      tx.onabort = () => { db.close(); resolve(false); };
    } catch { db.close(); resolve(false); }
  });
}
