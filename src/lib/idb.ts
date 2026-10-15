/**
 * The small part of IndexedDB this app needs: a few object stores of JSON values,
 * read and written by key. Everything degrades to "no cache" rather than
 * throwing — private windows and blocked storage are normal here.
 */
const DB_NAME = 'bsi-results'
/** Every store the app uses; all of them are created together on upgrade. */
export const STORES = ['townResults', 'runnerResults'] as const
export type Store = (typeof STORES)[number]
const VERSION = 2

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        for (const store of STORES) {
          if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store)
        }
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

function tx<T>(store: Store, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return openDb().then(
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

export const idbGet = <T>(store: Store, key: string) => tx<T>(store, 'readonly', (s) => s.get(key))
export const idbPut = (store: Store, key: string, value: unknown) =>
  tx<IDBValidKey>(store, 'readwrite', (s) => s.put(value, key))
export const idbCount = (store: Store) => tx<number>(store, 'readonly', (s) => s.count())
export const idbClear = (store: Store) => tx<undefined>(store, 'readwrite', (s) => s.clear())
