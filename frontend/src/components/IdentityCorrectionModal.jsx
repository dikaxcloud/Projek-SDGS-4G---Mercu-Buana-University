import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from 'lucide-react'
import { identityLast4, identityNumberError, normalizeIdentityNumber } from '../utils/identity'

const COPY = {
  nik: {
    eyebrow: 'Koreksi identitas',
    title: 'Perbarui NIK Warga',
    description: 'Masukkan NIK lengkap sesuai KTP. NIK lama tetap tersamarkan pada data warga.',
    label: 'NIK lengkap',
    field: 'NIK',
    warning: 'NIK lengkap hanya disimpan pada penyimpanan privat dan dapat dibaca melalui jalur petugas berwenang.',
    confirm: 'Simpan NIK',
  },
  kk: {
    eyebrow: 'Koreksi kartu keluarga',
    title: 'Perbarui Nomor KK',
    description: 'Nomor KK berlaku untuk seluruh anggota keluarga dalam satu kartu keluarga.',
    label: 'Nomor KK lengkap',
    field: 'Nomor KK',
    warning: 'Perubahan nomor KK tidak mengubah relasi keluarga, kepala keluarga, atau alamat KK.',
    confirm: 'Simpan Nomor KK',
  },
}

export function IdentityCorrectionModal({
  open,
  mode = 'nik',
  citizenName = 'Warga',
  initialValue = '',
  busy = false,
  error = '',
  onClose,
  onConfirm,
}) {
  const copy = COPY[mode] || COPY.nik
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)
  const inputRef = useRef(null)
  const [value, setValue] = useState('')
  const [step, setStep] = useState('edit')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!open) return undefined
    triggerRef.current = document.activeElement
    setValue(normalizeIdentityNumber(initialValue))
    setStep('edit')
    setLocalError('')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => {
      if (inputRef.current) inputRef.current.focus()
      else dialogRef.current?.focus()
    }, 30)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
    }
  }, [open, mode, initialValue])

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

  const trapFocus = (event) => {
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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

  const submit = (event) => {
    event.preventDefault()
    if (busy) return
    const message = identityNumberError(value, copy.field)
    if (message) {
      setLocalError(message)
      return
    }
    setLocalError('')
    setStep('confirm')
  }

  const back = () => {
    if (busy) return
    setLocalError('')
    setStep('edit')
  }

  const currentLast4 = identityLast4(initialValue)
  const nextLast4 = identityLast4(value)
  const previousDisplay = mode === 'nik'
    ? (currentLast4 ? `${'*'.repeat(8)}${currentLast4}` : 'Belum tersedia')
    : (initialValue || 'Belum tersedia')

  return createPortal(
    <div
      className="verify-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <form
        ref={dialogRef}
        className="verify-dialog identity-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="identity-modal-title"
        aria-describedby="identity-modal-description"
        tabIndex={-1}
        onKeyDown={trapFocus}
        onSubmit={submit}
      >
        <div className="verify-header">
          <div className="verify-icon" aria-hidden="true"><ShieldCheck size={25} /></div>
          <div className="verify-heading">
            <div className="eyebrow">{copy.eyebrow}</div>
            <h2 id="identity-modal-title">{copy.title}</h2>
            <p id="identity-modal-description">{copy.description}</p>
          </div>
          <button type="button" className="verify-close" onClick={onClose} disabled={busy} aria-label="Tutup dialog koreksi identitas">
            <X size={18} />
          </button>
        </div>

        <div className="verify-body">
          <div className="identity-person">
            <span className="identity-person-label">Warga</span>
            <strong>{citizenName}</strong>
          </div>

          {step === 'edit' ? (
            <label className="identity-field" htmlFor="identity-correction-input">
              <span>{copy.label}</span>
              <input
                ref={inputRef}
                id="identity-correction-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={16}
                value={value}
                placeholder="16 digit angka"
                onChange={(event) => {
                  setValue(normalizeIdentityNumber(event.target.value))
                  setLocalError('')
                }}
                disabled={busy}
                aria-invalid={Boolean(localError)}
                aria-describedby="identity-correction-help"
              />
              <small id="identity-correction-help" className="identity-help">
                Hanya angka, tepat 16 digit. {value.length}/16 digit terisi.
              </small>
            </label>
          ) : (
            <div className="identity-confirm" aria-live="polite">
              <div className="identity-confirm-row">
                <span>Tersimpan</span>
                <strong>{previousDisplay}</strong>
              </div>
              <div className="identity-confirm-row is-next">
                <span>Nilai baru</span>
                <strong>{value}</strong>
                <small>Diakhiri {nextLast4 || '-'}</small>
              </div>
            </div>
          )}

          <div className="verify-warning">
            <AlertTriangle size={17} aria-hidden="true" />
            <span>{copy.warning} Status verifikasi tidak berubah otomatis.</span>
          </div>

          {(localError || error) && (
            <div className="verify-error" role="alert">
              <AlertTriangle size={17} aria-hidden="true" />
              <span>{localError || error}</span>
            </div>
          )}
        </div>

        <div className="verify-actions">
          {step === 'edit' ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Batal</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                <Check size={16} /> Lanjut Periksa
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={back} disabled={busy}>Ubah Lagi</button>
              <button type="button" className="btn btn-primary" onClick={() => onConfirm(value)} disabled={busy} aria-busy={busy}>
                {busy ? <><Loader2 size={16} className="spin" /> Menyimpan...</> : <><ShieldCheck size={16} /> {copy.confirm}</>}
              </button>
            </>
          )}
        </div>
      </form>
    </div>,
    document.body,
  )
}
