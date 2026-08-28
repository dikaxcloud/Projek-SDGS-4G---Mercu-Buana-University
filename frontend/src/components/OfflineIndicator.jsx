import { useEffect, useState } from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'
import { listOfflineMutations, retryFailedOfflineMutation } from '../lib/offlineStore'
import { syncOfflineMutations } from '../features/health/healthService'
import { useAuth } from '../features/auth/AuthProvider'

export function OfflineIndicator() {
  const { access } = useAuth()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [queued, setQueued] = useState(0)

  const refresh = async () => {
    const items = await listOfflineMutations(access?.user_id)
    setQueued(items.length)
  }

  useEffect(() => {
    const update = async () => {
      const nextOnline = navigator.onLine
      setOnline(nextOnline)
      if (nextOnline && access?.user_id) {
        try { await syncOfflineMutations(access.user_id) } catch { /* keep queue visible for manual retry */ }
      }
      await refresh()
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    void refresh()
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [access?.user_id])

  if (online && queued === 0) return null
  const retry = async () => {
    try {
      const items = await listOfflineMutations(access?.user_id)
      await Promise.all(items.filter((item) => item.status === 'failed').map((item) => retryFailedOfflineMutation(item.id)))
      await syncOfflineMutations(access?.user_id)
    } catch { /* retain failed queue */ }
    await refresh()
  }
  return <div className={`offline-indicator ${online ? 'has-queue' : ''}`} role="status" aria-live="polite"><CloudOff size={15} /> {online ? `${queued} perubahan menunggu sinkronisasi` : 'Mode offline · data baru tidak dikirim'} {online && <button type="button" onClick={() => void retry()} aria-label="Coba sinkronisasi ulang"><RefreshCw size={14} /></button>}</div>
}
