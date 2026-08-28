import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Stethoscope } from 'lucide-react'

const ROLE_CONFIG = {
  admin: {
    label: 'Admin',
    message: 'Akses Admin Desa Anda telah disiapkan.',
    checklist: 'Akses Admin disiapkan',
  },
  nakes: {
    label: 'Nakes',
    message: 'Akses Tenaga Kesehatan Anda telah disiapkan.',
    checklist: 'Akses Nakes disiapkan',
  },
  warga: {
    label: 'Warga',
    message: 'Akun kesehatan warga Anda telah disiapkan.',
    checklist: 'Akses Warga disiapkan',
  },
}

/**
 * Full-screen welcome transition shown ONLY after invitation token
 * has been validated (access exists + welcome=invitation param).
 * Does NOT handle validation itself – caller must ensure access is truthy.
 */
export function WelcomeTransition({ access, onComplete }) {
  const [step, setStep] = useState(0)
  const [showFinal, setShowFinal] = useState(false)

  const displayName = access?.display_name?.trim() || ''
  const role = access?.role || 'warga'
  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.warga

  const heading = useMemo(() => {
    if (displayName) return `Selamat datang, ${displayName}!`
    return 'Selamat datang di Desa Sehat Kenanga!'
  }, [displayName])

  const subMessage = cfg.message

  useEffect(() => {
    // Updated per user request: ~3.5s total biar kerasa welcome experience (awalnya 1.8s)
    // 800ms step1, 1400 step2, 2000 step3, 2600 final, 3500 redirect
    const timers = [
      setTimeout(() => setStep(1), 800),
      setTimeout(() => setStep(2), 1400),
      setTimeout(() => setStep(3), 2000),
      setTimeout(() => setShowFinal(true), 2600),
      setTimeout(() => onComplete?.(role), 3500),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onComplete, role])

  const getDestination = () => {
    if (role === 'admin') return '/admin'
    if (role === 'nakes') return '/nakes'
    return '/warga'
  }

  // Announce for screen readers
  useEffect(() => {
    // replace history to prevent back-button re-triggering welcome
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('welcome')) {
        url.searchParams.delete('welcome')
        window.history.replaceState({}, '', url.pathname + url.search)
      }
    } catch {}
  }, [])

  return (
    <main className="welcome-transition" aria-labelledby="welcome-title" role="status" aria-live="polite">
      <div className="welcome-card">
        {/* Logo */}
        <div className="welcome-logo-wrap welcome-animate-logo">
          <img
            src="/logo.png"
            alt="Logo Desa Sehat Kenanga"
            className="welcome-logo"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
          <span className="welcome-logo-fallback" aria-hidden="true">
            <Stethoscope size={22} />
          </span>
        </div>

        <p className="welcome-brand">Desa Sehat Kenanga</p>

        {/* Welcome message - appears at 300ms */}
        <div className="welcome-animate welcome-delay-1">
          <h1 id="welcome-title" className="welcome-title">
            {heading}
          </h1>
          <p className="welcome-subtitle">{subMessage}</p>
        </div>

        {/* Checklist */}
        <ul className="welcome-checklist" aria-label="Proses persiapan akun">
          <li className={`welcome-check-item ${step >= 1 ? 'visible' : ''}`}>
            <span className="welcome-check-icon" aria-hidden="true">
              <CheckCircle2 size={18} />
            </span>
            <span>Undangan diterima</span>
          </li>
          <li className={`welcome-check-item ${step >= 2 ? 'visible' : ''}`}>
            <span className="welcome-check-icon" aria-hidden="true">
              <CheckCircle2 size={18} />
            </span>
            <span>Akun dikonfirmasi</span>
          </li>
          <li className={`welcome-check-item ${step >= 3 ? 'visible' : ''}`}>
            <span className="welcome-check-icon" aria-hidden="true">
              <CheckCircle2 size={18} />
            </span>
            <span>{cfg.checklist}</span>
          </li>
        </ul>

        {/* Dots + final message */}
        <div className="welcome-footer">
          <div className="welcome-dots" aria-hidden="true">
            <span className="dot" />
            <span className="dot dot-2" />
            <span className="dot dot-3" />
          </div>
          <p className={`welcome-final ${showFinal ? 'visible' : ''}`}>
            Membuka portal...
          </p>
          <p className="welcome-destination" aria-hidden="true">
            Menuju {getDestination()}
          </p>
        </div>
      </div>
    </main>
  )
}
