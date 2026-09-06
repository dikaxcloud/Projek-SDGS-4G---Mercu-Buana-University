const DB_NAME = 'desa-sehat-offline'
const VERSION = 1

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB tidak tersedia.'))
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const OFFLINE_TTL_MS = 24 * 60 * 60 * 1000 // 24h - auto-expire stale queued health data

export async function enqueueOfflineMutation(userId, mutation) {
  if (!userId) throw new Error('Sesi pengguna diperlukan.')
  const item = { ...mutation, id: mutation.id || crypto.randomUUID(), userId, status: 'pending', createdAt: Date.now(), ttl: OFFLINE_TTL_MS }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite')
    tx.objectStore('queue').put(item)
    tx.oncomplete = () => resolve(item)
    tx.onerror = () => reject(tx.error)
  })
}

export async function listOfflineMutations(userId) {
  if (!userId) return []
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readonly')
      const request = tx.objectStore('queue').getAll()
      request.onsuccess = () => {
        const now = Date.now()
        const valid = request.result.filter((item) => item.userId === userId && (!item.createdAt || now - item.createdAt < OFFLINE_TTL_MS))
        const expired = request.result.filter((item) => item.createdAt && now - item.createdAt >= OFFLINE_TTL_MS)
        // cleanup expired in background
        if (expired.length) { expired.forEach((item) => { try { clearOfflineMutation(item.id) } catch {} }) }
        resolve(valid)
      }
      request.onerror = () => reject(request.error)
    })
  } catch { return [] }
}

export async function clearOfflineMutation(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite')
    tx.objectStore('queue').delete(id)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export async function markOfflineMutationFailed(id, message) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite')
    const store = tx.objectStore('queue')
    const request = store.get(id)
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, status: 'failed', error: String(message || 'Sinkronisasi gagal.'), failedAt: Date.now() })
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export async function retryFailedOfflineMutation(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite')
    const store = tx.objectStore('queue')
    const request = store.get(id)
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, status: 'pending', error: null, failedAt: null })
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearOfflineUser(userId) {
  const items = await listOfflineMutations(userId)
  await Promise.all(items.map((item) => clearOfflineMutation(item.id)))
}
