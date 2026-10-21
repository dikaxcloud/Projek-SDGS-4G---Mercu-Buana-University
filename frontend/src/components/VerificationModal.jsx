import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2, ShieldCheck, X } from 'lucide-react'

const STATUS_LABEL = {
  pending: 'Menunggu verifikasi',
  needs_correction: 'Perlu perbaikan',
  verified: 'Terverifikasi',
  rejected: 'Ditolak',
}

const CHECKS = [
  ['identity', 'Identitas warga sudah diperiksa.'],
  ['documents', 'NIK dan nomor KK sudah diperiksa sesuai kewenangan.'],
  ['address', 'Alamat dan informasi wajib sudah diperiksa.'],
  ['fixes', 'Perbaikan yang diperlukan sudah diselesaikan.'],
]

export function VerificationModal({ open, citizen, onClose, onConfirm, busy = false, error = '' }) {
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)
  const [checks, setChecks] = useState({ identity: false, documents: false, address: false, fixes: false })

  useEffect(() => {
    if (!open) return undefined
    triggerRef.current = document.activeElement
    setChecks({ identity: false, documents: false, address: false, fixes: false })
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => {
      const first = dialogRef.current?.querySelector('button:not([disabled])')
      ;(first || dialogRef.current)?.focus()
    }, 30)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onClose])

  if (!open) return null

  const allChecked = CHECKS.every(([key]) => checks[key])
  const fullName = citizen?.full_name || 'Warga'
  const initial = fullName.slice(0, 1).toUpperCase()
  const status = citizen?.verification_status || 'pending'
  const nik = citizen?.nik_last4 ? `••••••••••••${citizen.nik_last4}` : 'Tidak tersedia'
  const householdNumber = citizen?.household_number || '-'
  const rtCode = citizen?.rt_code || '-'

  const trapFocus = (event) => {
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="verify-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="verify-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-modal-title"
        aria-describedby="verification-modal-description"
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <div className="verify-header">
          <div className="verify-icon" aria-hidden="true"><ShieldCheck size={25} /></div>
          <div className="verify-heading">
            <div className="eyebrow">Pemeriksaan pendaftaran</div>
            <h2 id="verification-modal-title">Verifikasi Data Warga</h2>
            <p id="verification-modal-description">Pastikan data pendaftaran sudah diperiksa sebelum memberikan persetujuan.</p>
          </div>
          <button type="button" className="verify-close" onClick={onClose} disabled={busy} aria-label="Tutup dialog verifikasi">
            <X size={18} />
          </button>
        </div>

        <div className="verify-body">
          <div className="verify-person">
            <div className="verify-avatar" aria-hidden="true">{initial}</div>
            <div className="verify-person-copy">
              <strong>{fullName}</strong>
              <span>{rtCode} · KK {householdNumber}</span>
            </div>
            <span className={`verify-status is-${status === 'needs_correction' ? 'warning' : status === 'rejected' ? 'danger' : 'info'}`}>
              {STATUS_LABEL[status] || status}
            </span>
          </div>

          <div className="verify-summary-grid">
            <div className="verify-summary-item"><span>NIK tersamarkan</span><strong>{nik}</strong></div>
            <div className="verify-summary-item"><span>Wilayah</span><strong>{rtCode}</strong></div>
            <div className="verify-summary-item"><span>Nomor KK</span><strong>{householdNumber}</strong></div>
            <div className="verify-summary-item"><span>Status saat ini</span><strong>{STATUS_LABEL[status] || status}</strong></div>
          </div>

          <div>
            <h3 className="verify-section-title">Checklist sebelum verifikasi</h3>
            <div className="verify-checklist">
              {CHECKS.map(([key, label]) => (
                <label className="verify-check" key={key}>
                  <input
                    type="checkbox"
                    checked={checks[key]}
                    onChange={() => setChecks((current) => ({ ...current, [key]: !current[key] }))}
                    disabled={busy}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="verify-warning">
            <AlertTriangle size={17} aria-hidden="true" />
            <span>Pastikan seluruh data sudah benar. Setelah disetujui, pendaftaran akan berlanjut ke tahap aktivasi sesuai alur Desa Sehat.</span>
          </div>

          {error && (
            <div className="verify-error" role="alert">
              <AlertTriangle size={17} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="verify-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Periksa Kembali</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={!allChecked || busy} aria-busy={busy}>
            {busy ? <><Loader2 size={16} className="spin" /> Memverifikasi...</> : <><ShieldCheck size={16} /> Ya, Verifikasi Warga</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
