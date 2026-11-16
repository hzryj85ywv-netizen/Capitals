// Thin IndexedDB layer. Everything except photo blobs is mirrored in memory
// (the data set is small) and written through on every change.

const DB_NAME = 'physique';
const DB_VERSION = 1;
export const STORES = ['entries', 'foods', 'meals', 'workouts', 'cardio', 'weights', 'photos', 'kv'];
const KEYS = { weights: 'date', kv: 'key' };

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: KEYS[name] || 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database blocked — close other tabs of this app.'));
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const r = fn(s);
    if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  }));
}

export const db = {
  getAll: store => tx(store, 'readonly', s => s.getAll()),
  get: (store, key) => tx(store, 'readonly', s => s.get(key)),
  put: (store, value) => tx(store, 'readwrite', s => s.put(value)),
  del: (store, key) => tx(store, 'readwrite', s => s.delete(key)),
  clear: store => tx(store, 'readwrite', s => s.clear()),
  putMany: (store, values) => tx(store, 'readwrite', s => { for (const v of values) s.put(v); }),
};

// ---------- in-memory mirror ----------
export const S = {
  entries: [], foods: [], meals: [], workouts: [], cardio: [], weights: [],
  photos: [], // metadata only (blob loaded on demand)
  kv: {},
};

export async function loadAll() {
  for (const name of STORES) {
    if (name === 'kv') {
      const rows = await db.getAll('kv');
      S.kv = Object.fromEntries(rows.map(r => [r.key, r.value]));
    } else if (name === 'photos') {
      const rows = await db.getAll('photos');
      S.photos = rows.map(({ blob, ...meta }) => meta);
    } else {
      S[name] = await db.getAll(name);
    }
  }
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* ignore */ }
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function save(store, obj) {
  const arr = S[store];
  const key = KEYS[store] || 'id';
  const i = arr.findIndex(x => x[key] === obj[key]);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  await db.put(store, obj);
  return obj;
}

export async function saveMany(store, objs) {
  const key = KEYS[store] || 'id';
  for (const obj of objs) {
    const i = S[store].findIndex(x => x[key] === obj[key]);
    if (i >= 0) S[store][i] = obj; else S[store].push(obj);
  }
  await db.putMany(store, objs);
}

export async function remove(store, id) {
  const key = KEYS[store] || 'id';
  S[store] = S[store].filter(x => x[key] !== id);
  await db.del(store, id);
}

export function getKV(key, fallback) {
  return key in S.kv ? S.kv[key] : fallback;
}
export async function setKV(key, value) {
  S.kv[key] = value;
  await db.put('kv', { key, value });
}

// ---------- photos (blobs stay out of memory) ----------
export async function savePhoto(meta, blob) {
  await db.put('photos', { ...meta, blob });
  S.photos = S.photos.filter(p => p.id !== meta.id).concat([meta]);
}
export async function photoBlob(id) {
  const row = await db.get('photos', id);
  return row ? row.blob : null;
}
export async function deletePhoto(id) {
  await db.del('photos', id);
  S.photos = S.photos.filter(p => p.id !== id);
}

// ---------- backup ----------
function blobToDataURL(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}
async function dataURLToBlob(url) { return (await fetch(url)).blob(); }

export async function exportAll(includePhotos) {
  const out = { app: 'physique', version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const name of STORES) {
    if (name === 'photos') {
      if (!includePhotos) { out.data.photos = []; continue; }
      const rows = await db.getAll('photos');
      out.data.photos = await Promise.all(rows.map(async r => ({ ...r, blob: r.blob ? await blobToDataURL(r.blob) : null })));
    } else {
      out.data[name] = await db.getAll(name);
    }
  }
  return out;
}

export async function importAll(json) {
  if (!json || json.app !== 'physique' || !json.data) throw new Error('Not a Physique backup file.');
  for (const name of STORES) {
    const rows = json.data[name];
    if (!Array.isArray(rows)) continue;
    if (name === 'photos' && rows.length === 0) continue; // keep existing photos if backup had none
    await db.clear(name);
    if (name === 'photos') {
      for (const r of rows) await db.put('photos', { ...r, blob: r.blob ? await dataURLToBlob(r.blob) : null });
    } else {
      await db.putMany(name, rows);
    }
  }
  await loadAll();
}

export async function wipeAll() {
  for (const name of STORES) await db.clear(name);
  await loadAll();
}
