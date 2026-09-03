/**
 * A minimal IndexedDB key-value wrapper.
 *
 * Written by hand rather than pulled from a library because this app needs two
 * object stores ("meta" and "blobs") inside one database, and the usual
 * key-value libraries open the database once per store with no version. The
 * first store to load creates the database; the second one then never exists,
 * and every write to it fails with NotFoundError. Declaring both stores in a
 * single upgrade is the whole fix.
 */

const DB_NAME = 'animainly'

/**
 * Version 2 exists because version 1 shipped with a single object store, for
 * the reason described above. Anyone who ran that build has a database that
 * looks current but is missing "blobs", and no upgrade would ever fire to
 * repair it. Bumping the version forces onupgradeneeded to run.
 */
const DB_VERSION = 2

export const META = 'meta'
export const BLOBS = 'blobs'

const STORES = [META, BLOBS]

let dbPromise: Promise<IDBDatabase> | undefined

function open(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }

    const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME)

    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open database'))
    // An upgrade can't proceed while another tab holds the old version open.
    request.onblocked = () =>
      reject(new Error('Another Animainly tab is open — close it and reload'))
  })
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = (async () => {
    let db = await open(DB_VERSION)

    // A database left in a bad state by an older build can still report a
    // current version while missing a store. Re-open one version higher to
    // force the upgrade that creates it, rather than failing every write.
    const missing = STORES.filter((s) => !db.objectStoreNames.contains(s))
    if (missing.length > 0) {
      const next = db.version + 1
      db.close()
      db = await open(next)
    }

    // Another tab requesting a newer version needs us out of the way.
    db.onversionchange = () => {
      db.close()
      dbPromise = undefined
    }
    // Safari can drop the connection; letting it reopen beats a dead handle.
    db.onclose = () => {
      dbPromise = undefined
    }

    return db
  })()

  dbPromise.catch(() => {
    dbPromise = undefined
  })

  return dbPromise
}

function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const request = fn(tx.objectStore(storeName))
        request.onsuccess = () => resolve(request.result as T)
        request.onerror = () => reject(request.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return run<T | undefined>(store, 'readonly', (s) => s.get(key))
}

export function idbSet(store: string, key: string, value: unknown): Promise<void> {
  return run<void>(store, 'readwrite', (s) => s.put(value, key))
}

export function idbDelete(store: string, key: string): Promise<void> {
  return run<void>(store, 'readwrite', (s) => s.delete(key))
}

export function idbKeys(store: string): Promise<IDBValidKey[]> {
  return run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys())
}
