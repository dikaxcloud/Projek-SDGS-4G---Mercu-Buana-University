import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'

/** Bottom sheet "Lainnya" untuk navigasi mobile (tanpa dependency baru). */
export function MobileMoreSheet({ open, onClose, title = 'Lainnya', items = [] }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="more-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="more-sheet-handle" aria-hidden="true" />
        <div className="more-sheet-head">
          <strong>{title}</strong>
          <button type="button" onClick={onClose} aria-label="Tutup" autoFocus><X size={19} /></button>
        </div>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`more-item${item.danger ? ' danger' : ''}`}
            onClick={() => {
              onClose()
              if (item.onClick) item.onClick()
              else if (item.to) navigate(item.to)
            }}
          >
            {item.Icon && <item.Icon size={19} />}
            <span>{item.label}</span>
          </button>
        ))}
        <button type="button" className="btn btn-ghost btn-wide more-sheet-close" onClick={onClose}>Tutup</button>
      </div>
    </>
  )
}
