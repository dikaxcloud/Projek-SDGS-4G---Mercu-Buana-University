import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { applySwUpdate, getPwaState, hasUnsavedChanges, subscribePwa } from '../lib/pwa'

export function PwaUpdatePrompt() {
  const [hasUpdate, setHasUpdate] = useState(() => getPwaState().hasUpdate)
  const [dismissed, setDismissed] = useState(false)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => subscribePwa((s) => {
    setHasUpdate(s.hasUpdate)
    if (s.hasUpdate) setDismissed(false)
  }), [])

  // Jika update datang saat form kotor: jangan reload, tampilkan mode "lanjutkan dulu".
  useEffect(() => {
    if (!hasUpdate || dismissed) return
    let timer
    const tick = () => {
      setBlocked(hasUnsavedChanges())
      // Auto-apply hanya saat aman (tidak ada form kotor) setelah 5 detik tampil.
      if (!hasUnsavedChanges()) {
        timer = window.setTimeout(() => {
          if (!hasUnsavedChanges()) applySwUpdate()
        }, 8000)
      }
    }
    tick()
    const iv = window.setInterval(() => setBlocked(hasUnsavedChanges()), 2000)
    return () => { window.clearInterval(iv); if (timer) window.clearTimeout(timer) }
  }, [hasUpdate, dismissed])

  if (!hasUpdate || dismissed) return null

  return (
    <div className="pwa-update-bar" role="status" aria-live="polite">
      <div className="pwa-update-text">
        <strong>{blocked ? 'Versi baru tersedia — selesaikan dulu isian Anda' : 'Versi baru tersedia'}</strong>
        <span>{blocked ? 'Simpan formulir pemeriksaan terlebih dulu, lalu ketuk Perbarui.' : 'Perbarui untuk mendapatkan versi terbaru tanpa instal ulang.'}</span>
      </div>
      <div className="pwa-update-actions">
        <button type="button" className="btn btn-primary pwa-update-btn" onClick={() => applySwUpdate()}>
          <RefreshCw size={15} /> Perbarui Sekarang
        </button>
        {blocked && (
          <button type="button" className="btn btn-ghost pwa-update-btn" onClick={() => setDismissed(true)}>
            <X size={15} /> Lanjutkan Dulu
          </button>
        )}
      </div>
    </div>
  )
}
