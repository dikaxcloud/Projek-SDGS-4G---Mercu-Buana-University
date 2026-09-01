import { useEffect, useState, useRef } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Clock, User, QrCode, ScanLine } from 'lucide-react'
import { getCitizenContext } from '../features/citizen/citizenService'

/**
 * QR Access Experience — state machine for warga QR scan
 * States: verifying -> verified -> loading_citizen -> welcome -> redirecting
 * Error: invalid_qr | expired_qr | citizen_not_found | error
 * No fake loading — animation follows API.
 */
export function QrAccessExperience({ token, onSuccess, onRetry, onClose, mode = 'activation' }) {
  const [state, setState] = useState('verifying')
  const [citizen, setCitizen] = useState(null)
  const [detail, setDetail] = useState('')
  const timerRef = useRef([])

  const clearTimers = () => timerRef.current.forEach(clearTimeout)

  useEffect(() => {
    let active = true
    clearTimers()

    async function run() {
      if (!token) {
        setState('invalid_qr')
        return
      }
      // VERIFYING — API is source of truth
      setState('verifying')
      let verifyRes
      try {
        const { activateMyAccount } = await import('../features/auth/authService')
        verifyRes = await activateMyAccount(token)
      } catch (err) {
        if (!active) return
        const msg = err?.message || ''
        if (/expired|kedaluwarsa/i.test(msg)) setState('expired_qr')
        else if (/invalid|tidak valid|not found/i.test(msg)) setState('invalid_qr')
        else { setState('error'); setDetail(msg) }
        return
      }
      if (!active) return
      const status = verifyRes?.status
      if (status === 'expired') { setState('expired_qr'); return }
      if (status === 'invalid_token' || status === 'no_citizen') { setState('invalid_qr'); return }
      if (status === 'error' && !['activated','already_active'].includes(status)) {
        // Check citizen_not_found case
        if (status === 'citizen_not_found') { setState('citizen_not_found'); return }
      }
      if (!['activated','already_active'].includes(status)) {
        // For already_active we still proceed to welcome
        if (status !== 'activated' && status !== 'already_active') {
          setState('invalid_qr')
          return
        }
      }
      // VERIFIED — brief visual
      setState('verified')
      await new Promise(r => { const t = setTimeout(r, 450); timerRef.current.push(t) })
      if (!active) return
      // LOADING_CITIZEN
      setState('loading_citizen')
      try {
        const ctx = await getCitizenContext()
        if (!active) return
        const profile = ctx?.profile
        if (!profile) { setState('citizen_not_found'); return }
        setCitizen(profile)
        // stagger checklist visual
        await new Promise(r => { const t = setTimeout(r, 650); timerRef.current.push(t) })
        if (!active) return
        setState('citizen_found')
        await new Promise(r => { const t = setTimeout(r, 300); timerRef.current.push(t) })
        if (!active) return
        setState('welcome')
        // welcome duration then redirect
        await new Promise(r => { const t = setTimeout(r, 1600); timerRef.current.push(t) })
        if (!active) return
        setState('redirecting')
        await new Promise(r => { const t = setTimeout(r, 280); timerRef.current.push(t) })
        if (!active) return
        onSuccess?.(profile)
      } catch (err) {
        if (!active) return
        setState('error'); setDetail(err?.message || '')
      }
    }
    run()
    return () => { active = false; clearTimers() }
  }, [token, onSuccess])

  const firstName = citizen?.full_name?.trim().split(/\s+/)[0] || citizen?.full_name?.trim() || 'Warga'
  const avatarLetter = citizen?.full_name?.trim()?.[0]?.toUpperCase() || 'W'

  // aria-live message
  const liveMsg = (() => {
    switch (state) {
      case 'verifying': return 'QR sedang diverifikasi'
      case 'verified': return 'QR berhasil diverifikasi'
      case 'loading_citizen': return 'Menemukan data warga'
      case 'citizen_found': return 'Data warga ditemukan'
      case 'welcome': return `Selamat datang, ${firstName}`
      case 'invalid_qr': return 'QR tidak valid'
      case 'expired_qr': return 'QR sudah tidak berlaku'
      case 'citizen_not_found': return 'Data warga belum ditemukan'
      case 'error': return 'Terjadi kesalahan'
      default: return ''
    }
  })()

  return (
    <div className="qr-access-overlay" role="status" aria-live="polite" aria-label={liveMsg}>
      <div className="qr-access-card">
        {state === 'verifying' && (
          <>
            <div className="qr-access-icon-wrap verifying">
              <span className="qr-access-ring" aria-hidden="true" />
              <span className="qr-access-icon"><QrCode size={28} /></span>
            </div>
            <h2 className="qr-access-title">Memverifikasi akses...</h2>
            <p className="qr-access-sub">Sedang menghubungkan Anda dengan<br />Desa Sehat Kenanga.</p>
            <div className="qr-access-dots" aria-hidden="true"><span className="dot" /><span className="dot d2" /><span className="dot d3" /></div>
          </>
        )}
        {state === 'verified' && (
          <>
            <div className="qr-access-icon-wrap verified">
              <span className="qr-access-icon"><CheckCircle2 size={32} /></span>
            </div>
            <h2 className="qr-access-title">QR berhasil diverifikasi</h2>
            <p className="qr-access-sub">Mengakses data warga...</p>
          </>
        )}
        {state === 'loading_citizen' && (
          <>
            <div className="qr-access-icon-wrap">
              <span className="qr-access-icon"><User size={26} /></span>
            </div>
            <h2 className="qr-access-title">Menemukan data warga</h2>
            <ul className="qr-access-checklist">
              <li className="done"><CheckCircle2 size={14} /> QR terverifikasi</li>
              <li className="done"><CheckCircle2 size={14} /> Identitas ditemukan</li>
              <li className="active"><span className="qr-mini-spinner" aria-hidden="true" /> Menyiapkan data kesehatan</li>
            </ul>
          </>
        )}
        {state === 'citizen_found' && (
          <>
            <div className="qr-access-icon-wrap">
              <span className="qr-access-icon"><User size={26} /></span>
            </div>
            <h2 className="qr-access-title">Menemukan data warga</h2>
            <ul className="qr-access-checklist">
              <li className="done"><CheckCircle2 size={14} /> QR terverifikasi</li>
              <li className="done"><CheckCircle2 size={14} /> Identitas ditemukan</li>
              <li className="done"><CheckCircle2 size={14} /> Data siap ditampilkan</li>
            </ul>
          </>
        )}
        {state === 'welcome' && (
          <>
            <div className="qr-access-avatar" aria-hidden="true">{avatarLetter}</div>
            <h2 className="qr-access-title">Selamat datang,<br />{firstName} 👋</h2>
            <p className="qr-access-sub">Desa Sehat Kenanga<br />Data kesehatan Anda berhasil ditemukan dan siap ditampilkan.</p>
            <div className="qr-access-progress"><div className="qr-access-progress-fill" /></div>
            <p className="qr-access-redirect">Menuju dashboard...</p>
          </>
        )}
        {state === 'redirecting' && (
          <>
            <div className="qr-access-avatar small" aria-hidden="true">{avatarLetter}</div>
            <p className="qr-access-redirect">Membuka dashboard...</p>
          </>
        )}
        {state === 'invalid_qr' && (
          <>
            <div className="qr-access-icon-wrap error"><XCircle size={32} /></div>
            <h2 className="qr-access-title">QR tidak valid</h2>
            <p className="qr-access-sub">QR Code ini tidak dapat digunakan untuk mengakses data warga.</p>
            <div className="qr-access-actions">
              <button className="btn btn-primary" onClick={() => onRetry?.()}>Coba lagi</button>
              {onClose && <button className="btn btn-ghost" onClick={onClose}>Tutup</button>}
            </div>
          </>
        )}
        {state === 'expired_qr' && (
          <>
            <div className="qr-access-icon-wrap warning"><Clock size={32} /></div>
            <h2 className="qr-access-title">QR sudah tidak berlaku</h2>
            <p className="qr-access-sub">Silakan gunakan QR terbaru dari petugas desa.</p>
            <div className="qr-access-actions">
              <button className="btn btn-ghost" onClick={() => onRetry?.()}>Kembali</button>
              {onClose && <button className="btn btn-ghost" onClick={onClose}>Tutup</button>}
            </div>
          </>
        )}
        {state === 'citizen_not_found' && (
          <>
            <div className="qr-access-icon-wrap"><User size={32} /></div>
            <h2 className="qr-access-title">Data warga belum ditemukan</h2>
            <p className="qr-access-sub">QR berhasil diverifikasi, tetapi data warga belum tersedia.</p>
            <div className="qr-access-actions">
              <button className="btn btn-primary" onClick={() => onRetry?.()}>Hubungi Petugas</button>
              {onClose && <button className="btn btn-ghost" onClick={onClose}>Tutup</button>}
            </div>
          </>
        )}
        {state === 'error' && (
          <>
            <div className="qr-access-icon-wrap error"><AlertTriangle size={32} /></div>
            <h2 className="qr-access-title">Terjadi kesalahan</h2>
            <p className="qr-access-sub">Terjadi masalah saat memproses QR Code.{detail ? ` ${detail}` : ''}</p>
            <div className="qr-access-actions">
              <button className="btn btn-primary" onClick={() => onRetry?.()}>Coba lagi</button>
              {onClose && <button className="btn btn-ghost" onClick={onClose}>Tutup</button>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
