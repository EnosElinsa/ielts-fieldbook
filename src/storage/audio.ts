const DB_NAME = 'ielts-fieldbook-audio';
const STORE_NAME = 'recordings';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open audio database'));
  });
}

async function putAudioFile(audioId: string, blob: Blob): Promise<boolean> {
  const response = await fetch(`/api/audio/${encodeURIComponent(audioId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'audio/webm' },
    body: blob,
  });
  return response.ok;
}

export async function putAudio(audioId: string, blob: Blob): Promise<void> {
  if (!audioId || !blob) return;
  try {
    if (await putAudioFile(audioId, blob)) return;
  } catch {
    /* this address keeps the recording in IndexedDB */
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, String(audioId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not save recording'));
  });
  db.close();
}

export async function getAudio(audioId: string): Promise<Blob | null> {
  if (!audioId) return null;
  try {
    const response = await fetch(`/api/audio/${encodeURIComponent(audioId)}`);
    if (response.ok) return await response.blob();
  } catch {
    /* fall through to this browser's copy */
  }
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(String(audioId));
    request.onsuccess = () => resolve((request.result as Blob) || null);
    request.onerror = () => reject(request.error || new Error('Could not read recording'));
  });
  db.close();
  if (blob && blob.size) {
    try {
      await putAudioFile(audioId, blob);
    } catch {
      /* the other address will see it after a later successful write */
    }
  }
  return blob;
}

export async function deleteAudio(audioId: string): Promise<void> {
  if (!audioId) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(String(audioId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not delete recording'));
  });
  db.close();
}

export async function hasAudio(audioId: string): Promise<boolean> {
  const blob = await getAudio(audioId);
  return Boolean(blob && blob.size);
}
