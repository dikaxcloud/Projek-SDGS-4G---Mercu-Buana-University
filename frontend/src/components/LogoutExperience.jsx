import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LogOut, Check, AlertTriangle, X } from 'lucide-react'
import { useAuth } from '../features/auth/AuthProvider'

const LogoutContext = createContext(null)

export function useLogout() {
  const ctx = useContext(LogoutContext)
  if (!ctx) throw new Error('useLogout harus di dalam LogoutProvider')
  return ctx
}

export function LogoutProvider({ children }) {
  const { isDemo, signOut, signOutDemo } = useAuth()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState('confirming') // confirming | logging_out | success | error
  const [errorMsg, setErrorMsg] = useState('')

  const requestLogout = useCallback(() => {
    setErrorMsg('')
    setPhase('confirming')
    setOpen(true)
  }, [])

  const close = useCallback(() => {
    if (phase === 'logging_out' || phase === 'success') return
    setOpen(false)
    setTimeout(() => { setPhase('confirming'); setErrorMsg('') }, 200)
  }, [phase])

  // ESC & focus trap
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      if (e.key === 'Enter' && phase === 'confirming') void confirmLogout()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, phase])

  const confirmLogout = async () => {
    if (phase === 'logging_out' || phase === 'success') return
    setPhase('logging_out')
    setErrorMsg('')
    const start = Date.now()
    try {
      if (isDemo) signOutDemo()
      else await signOut()
      const elapsed = Date.now() - start
      const minDelay = 850
      if (elapsed < minDelay) await new Promise(r => setTimeout(r, minDelay - elapsed))
      setPhase('success')
      setTimeout(() => { window.location.href = '/login' }, 420)
    } catch (e) {
      setPhase('error')
      setErrorMsg(e?.message || 'Gagal keluar. Silakan coba lagi.')
    }
  }

  const modal = open ? (
    <div className="logout-overlay" role="dialog" aria-modal="true" aria-label="Konfirmasi keluar" onClick={close}>
      <div className="logout-modal" onClick={e => e.stopPropagation()} role="document">
        {/* phase icon */}
        <div className={`logout-icon ${phase}`} aria-hidden="true">
          {phase === 'success' ? <Check size={26} /> : phase === 'error' ? <AlertTriangle size={24} /> : phase === 'logging_out' ? <LogOut size={24} className="logout-icon-anim" /> : <LogOut size={24} />}
        </div>

        {phase === 'confirming' && (
          <>
            <h2 className="logout-title">Keluar dari akun?</h2>
            <p className="logout-desc">Anda akan keluar dari <strong>Desa Sehat Kenanga</strong>. Anda dapat masuk kembali kapan saja.</p>
            <div className="logout-actions">
              <button type="button" className="btn btn-ghost logout-btn-cancel" onClick={close}>Batal</button>
              <button type="button" className="btn btn-danger logout-btn-confirm" onClick={confirmLogout}>Ya, Keluar</button>
            </div>
          </>
        )}

        {phase === 'logging_out' && (
          <>
            <h2 className="logout-title">Keluar dari akun...</h2>
            <p className="logout-desc">Mengakhiri sesi Anda dengan aman.</p>
            <div className="logout-progress"><span className="logout-progress-fill" /></div>
            <div className="logout-actions">
              <button type="button" className="btn btn-ghost" disabled>Batal</button>
              <button type="button" className="btn btn-danger" disabled><span className="spin" style={{ display: 'inline-grid' }}><LogOut size={16} /></span> Keluar...</button>
            </div>
          </>
        )}

        {phase === 'success' && (
          <>
            <h2 className="logout-title">Berhasil keluar</h2>
            <p className="logout-desc">Anda telah keluar dari akun. Mengalihkan...</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <h2 className="logout-title">Gagal keluar</h2>
            <p className="logout-desc" style={{ color: '#b42318' }}>{errorMsg}</p>
            <div className="logout-actions">
              <button type="button" className="btn btn-ghost" onClick={close}>Tutup</button>
              <button type="button" className="btn btn-danger" onClick={confirmLogout}>Coba lagi</button>
            </div>
          </>
        )}

        {phase === 'confirming' && (
          <button type="button" className="logout-close" onClick={close} aria-label="Tutup">
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  ) : null

  return (
    <LogoutContext.Provider value={{ requestLogout }}>
      {children}
      {typeof document !== 'undefined' ? createPortal(modal, document.body) : null}
    </LogoutContext.Provider>
  )
}
