import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, User } from 'lucide-react'
import { useAuth } from '../features/auth/AuthProvider'

export function UserPill() {
  const { access, isDemo, signOut, signOutDemo } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const name = access?.display_name?.trim() || 'Akun'

  const logout = async () => {
    if (isDemo) signOutDemo()
    else await signOut()
    window.location.href = '/login'
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!access) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="user-pill"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Akun ${name}`}
      >
        <span className="user-pill-avatar" aria-hidden="true">
          <User size={14} />
        </span>
        <span className="user-pill-name">{name}</span>
        <ChevronDown size={14} className={`user-pill-chevron${open ? ' open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="user-pill-dropdown" role="menu">
          <div className="user-pill-dropdown-head">
            <strong>{name}</strong>
            <span>{access?.role === 'admin' ? (access?.admin_tier === 1 ? 'Owner' : access?.admin_tier === 2 ? 'Senior Admin' : 'Admin') : access?.role === 'nakes' ? 'Nakes' : 'Warga'}</span>
          </div>
          <button type="button" role="menuitem" className="user-pill-item danger" onClick={logout}>
            <LogOut size={14} /> Keluar
          </button>
        </div>
      )}
    </div>
  )
}
