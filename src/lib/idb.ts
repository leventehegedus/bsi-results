/**
 * The small part of IndexedDB this app needs: one object store of JSON values,
 * read and written by key. Everything degrades to "no cache" rather than
 * throwing — private windows and blocked storage are normal here.
 */
const DB_NAME = 'bsi-results'
const VERSION = 1

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(store: string): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return openDb(store).then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null)
        try {
          const req = run(db.transaction(store, mode).objectStore(store))
          req.onsuccess = () => resolve(req.result as T)
          req.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

export const idbGet = <T>(store: string, key: string) => tx<T>(store, 'readonly', (s) => s.get(key))
export const idbPut = (store: string, key: string, value: unknown) =>
  tx<IDBValidKey>(store, 'readwrite', (s) => s.put(value, key))
export const idbCount = (store: string) => tx<number>(store, 'readonly', (s) => s.count())
export const idbClear = (store: string) => tx<undefined>(store, 'readwrite', (s) => s.clear())
