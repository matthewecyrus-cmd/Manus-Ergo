/**
 * video-store.ts — ErgoKit
 * ========================
 * IndexedDB-backed store for video blobs.
 * localStorage cannot hold large binary data; IDB handles it natively.
 *
 * API:
 *   saveVideo(sessionId, blob)   → stores blob keyed by sessionId
 *   loadVideo(sessionId)         → returns a fresh Object URL (caller must revoke)
 *   deleteVideo(sessionId)       → removes the blob
 *   clearAllVideos()             → wipes the entire store
 */

const DB_NAME = 'ergokit_videos';
const STORE   = 'videos';
const DB_VER  = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveVideo(sessionId: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadVideo(sessionId: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(sessionId);
    req.onsuccess = () => {
      const blob = req.result as Blob | undefined;
      resolve(blob ? URL.createObjectURL(blob) : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteVideo(sessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function clearAllVideos(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
