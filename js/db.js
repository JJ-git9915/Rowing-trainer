// db.js — 기기 내 저장(IndexedDB). 외부 서버로 아무것도 보내지 않습니다.
// IndexedDB를 쓸 수 없는 환경이면 localStorage로 대체합니다.
const DB_NAME = 'rowing-buddy';
const DB_VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (!('indexedDB' in globalThis)) return resolve(null);
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VER); } catch { return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('workouts')) db.createObjectStore('workouts', { keyPath: 'id' }).createIndex('date', 'date');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbp;
}
function run(store, mode, fn) {
  return open().then((db) => {
    if (!db) return fallback(store, mode, fn);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      let result;
      const r = fn(os);
      if (r) r.onsuccess = () => { result = r.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}
// ── localStorage 대체 저장소 ──
const LS = (store) => `rb:${store}`;
function lsGet(store) { try { return JSON.parse(localStorage.getItem(LS(store)) || '{}'); } catch { return {}; } }
function lsSet(store, obj) { localStorage.setItem(LS(store), JSON.stringify(obj)); }
function fallback(store, mode, fn) {
  const data = lsGet(store);
  const keyPath = store === 'workouts' ? 'id' : 'key';
  const fake = {
    getAll: () => ({ result: Object.values(data) }),
    get: (k) => ({ result: data[k] }),
    put: (v) => { data[v[keyPath]] = v; return { result: v[keyPath] }; },
    delete: (k) => { delete data[k]; return {}; },
    clear: () => { for (const k of Object.keys(data)) delete data[k]; return {}; },
  };
  const r = fn(fake);
  if (mode === 'readwrite') lsSet(store, data);
  return Promise.resolve(r?.result);
}

export const db = {
  allWorkouts: () => run('workouts', 'readonly', (s) => s.getAll()).then((x) => x || []),
  putWorkout: (w) => run('workouts', 'readwrite', (s) => s.put(w)),
  putWorkouts: (ws) => run('workouts', 'readwrite', (s) => { ws.forEach((w) => s.put(w)); return null; }),
  deleteWorkout: (id) => run('workouts', 'readwrite', (s) => s.delete(id)),
  get: (key) => run('kv', 'readonly', (s) => s.get(key)).then((x) => (x ? x.value : null)),
  set: (key, value) => run('kv', 'readwrite', (s) => s.put({ key, value })),
  del: (key) => run('kv', 'readwrite', (s) => s.delete(key)),
  clearAll: () => Promise.all([run('workouts', 'readwrite', (s) => s.clear()), run('kv', 'readwrite', (s) => s.clear())]),
  isFallback: () => open().then((d) => !d),
};
