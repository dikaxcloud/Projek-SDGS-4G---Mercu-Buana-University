import { useCallback, useEffect, useState, useRef } from 'react'
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom'
import { Bell, LogOut, RefreshCw, ScanLine, AlertTriangle, House, HeartPulse, BookOpen, Siren, QrCode, Sparkles, Users, UserRound, ListChecks, ChevronDown, CheckCircle2 } from 'lucide-react'
import { Brand } from '../components/Brand'
import { UserPill } from '../components/UserPill'
import { useAuth } from '../features/auth/AuthProvider'
import { useLogout } from '../components/LogoutExperience'
import { BottomNav } from '../components/BottomNav'
import { OfflineIndicator } from '../components/OfflineIndicator'
import { QrScanner } from '../components/QrScanner'
import { QrAccessExperience } from '../components/QrAccessExperience'
import { getCitizenContext } from '../features/citizen/citizenService'
import { CorrectionForm } from '../features/citizen/CorrectionForm'
import { isSupabaseConfigured } from '../lib/supabase'

const citizenNavPrimary = [
  { to: '/warga', label: 'Beranda', Icon: House, end: true },
  { to: '/warga/kesehatan', label: 'Kesehatan', Icon: HeartPulse },
  { to: '/warga/riwayat', label: 'Riwayat', Icon: ListChecks },
  { to: '/informasi-kesehatan', label: 'Informasi', Icon: BookOpen },
]
const citizenNavMore = [
  { to: '/warga/qr-kesehatan', label: 'QR Saya', Icon: QrCode },
  { to: '/warga/ai-kesehatan', label: 'AI Kesehatan', Icon: Sparkles },
  { to: '/warga/keluarga', label: 'Keluarga', Icon: Users },
  { to: '/warga/profil', label: 'Profil', Icon: UserRound },
  { to: '/warga/notifikasi', label: 'Notifikasi', Icon: Bell },
  { to: '/warga/bantuan', label: 'Bantuan', Icon: Siren },
]

/**
 * Access gate: akun warga terkunci sampai admin verifikasi DAN
 * warga melakukan scan QR aktivasi dari petugas desa.
 */
export function CitizenLayout() {
  const { access } = useAuth()
  const location = useLocation()
  const [ctx, setCtx] = useState(null) // null = memuat, { status, profile, can_edit }
  const [tick, setTick] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctionSaved, setCorrectionSaved] = useState(false)
  const moreRef = useRef(null)
  const hasMoreActive = citizenNavMore.some(({ to }) => location.pathname.startsWith(to))

  useEffect(() => { setMoreOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!moreOpen) return
    const h = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false) }
    const k = (e) => { if (e.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [moreOpen])

  const isDemoUser = Boolean(access?.user_id?.startsWith('demo-'))
  // Hanya demo/konfigurasi kosong/aktivasi yang boleh melewati gate.
  // Warga yang sudah login tetapi belum terhubung TIDAK boleh masuk dashboard.
  const bypass = isDemoUser || !isSupabaseConfigured || location.pathname === '/warga/aktivasi'

  useEffect(() => {
    if (bypass) { setCtx({ status: 'pass' }); return }
    let active = true
    setCtx(null)
    getCitizenContext()
      .then((c) => { if (active) setCtx({ status: 'checked', profile: c.profile, can_edit: c.can_edit }) })
      .catch(() => { if (active) setCtx({ status: 'error' }) })
    return () => { active = false }
  }, [bypass, access?.citizen_id, tick, location.pathname])

  const { requestLogout } = useLogout()
  const refresh = useCallback(() => setTick((value) => value + 1), [])
  const signOutNow = () => requestLogout()
  const openCorrection = () => { setCorrectionSaved(false); setCorrectionOpen(true) }

  // Warga scans the admin's ACTIVATION QR — now via polished QR Access Experience
  const [scanMsg, setScanMsg] = useState('')
  const [scanError, setScanError] = useState('')
  const [qrExpToken, setQrExpToken] = useState(null)
  const handleWargaScan = async (raw) => {
    setScanError(''); setScanMsg('')
    let token = String(raw || '').trim().replace(/^DSK1:/i, '')
    if (/^https?:\/\//i.test(token)) {
      try {
        const url = new URL(token)
        token = url.searchParams.get('t') || url.searchParams.get('code') || ''
      } catch { /* biarkan token apa adanya */ }
    }
    if (!token) return setScanError('Token QR kosong.')
    // Delegate to polished experience — no fake loading, API is source of truth
    setQrExpToken(token)
  }

  const profile = ctx?.profile
  const vStatus = profile?.verification_status
  const canEdit = Boolean(ctx?.can_edit)

  // QR Access Experience takes over when token is present — polished transition
  if (qrExpToken) {
    return (
      <QrAccessExperience
        token={qrExpToken}
        onSuccess={() => { setQrExpToken(null); refresh(); setTimeout(refresh, 300) }}
        onRetry={() => setQrExpToken(null)}
        onClose={() => setQrExpToken(null)}
      />
    )
  }

  // Render gate states
  if (!bypass) {
    if (ctx === null) {
      return <LoadingScreen message="Memeriksa status akun..." onRefresh={refresh} />
    }
    if (ctx.status === 'error') {
      return gateShell(
        <>
          <AlertTriangle size={44} color="#b42318" />
          <h1 className="display">Gagal Memuat Status</h1>
          <p>Terjadi kesalahan saat memeriksa status akun Anda.</p>
        </>,
        refresh, signOutNow,
      )
    }
    if (ctx.status === 'checked' && !profile) {
      return gateShell(
        <>
          <AlertTriangle size={44} color="#b45309" />
          <h1 className="display">Data Pendaftaran Tidak Ditemukan</h1>
          <p>Akun Anda belum terhubung ke data warga, atau data sedang tidak dapat dibaca. Silakan hubungi petugas desa.</p>
          {access?.citizen_id
            ? <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>ID warga: {String(access.citizen_id).slice(0, 8)}...</p>
            : <p><Link className="btn btn-primary" to="/registrasi">Lengkapi Pendaftaran</Link></p>}
        </>,
        refresh, signOutNow,
      )
    }
    if (profile?.is_active === false) {
      return gateShell(
        <>
          <AlertTriangle size={44} color="#b42318" />
          <h1 className="display">Akun Dinonaktifkan</h1>
          <p>Akun warga Anda sedang tidak aktif. Hubungi petugas desa untuk informasi lebih lanjut.</p>
        </>,
        refresh, signOutNow,
      )
    }
    if (correctionOpen && ['pending', 'needs_correction', 'rejected'].includes(vStatus)) {
      return (
        <div className="dashboard-page correction-page">
          <div className="container narrow-container">
            <section className="panel correction-panel">
              <CorrectionForm
                profile={profile}
                onCancel={() => setCorrectionOpen(false)}
                onSaved={() => { setCorrectionOpen(false); setCorrectionSaved(true); refresh() }}
              />
            </section>
            <AccountControls refresh={refresh} signOutNow={signOutNow} />
          </div>
        </div>
      )
    }
    if (vStatus === 'pending') {
      return gateShell(
        <>
          <div style={{ fontSize: 44 }}>⏳</div>
          <h1 className="display">Menunggu Pemeriksaan Admin</h1>
          {correctionSaved && (
            <div className="gate-success" role="status">
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>Perbaikan data berhasil dikirim. Data Anda akan diperiksa kembali oleh RT/RW.</span>
            </div>
          )}
          <p>Terima kasih, <strong>{profile?.full_name}</strong>. Registrasi berhasil dikirim dan data Anda sedang menunggu pemeriksaan RT/RW.<br />
          Akun dapat digunakan setelah data diverifikasi dan proses aktivasi selesai.</p>
          {canEdit && (
            <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={openCorrection}>
              Perbaiki Data Saya
            </button>
          )}
        </>,
        refresh, signOutNow,
      )
    }
    if (vStatus === 'needs_correction' || vStatus === 'rejected') {
      const rejected = vStatus === 'rejected'
      return gateShell(
        <>
          <AlertTriangle size={44} color={rejected ? '#b42318' : '#b45309'} />
          <h1 className="display">{rejected ? 'Pendaftaran Ditolak' : 'Data Perlu Diperbaiki'}</h1>
          <p>{profile?.verification_note ? <>Catatan petugas: <strong>{profile.verification_note}</strong><br /></> : null}
          {rejected ? 'Silakan perbaiki data Anda agar dapat diperiksa ulang oleh petugas desa.' : 'Silakan lengkapi atau perbaiki data sesuai catatan petugas.'}</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={openCorrection}>
            Perbaiki Data
          </button>
        </>,
        refresh, signOutNow,
      )
    }
    if (vStatus === 'verified' && !profile?.activated_at) {
      return (
        <div className="dashboard-page">
          <div className="container narrow-container">
            <section className="panel" style={{ textAlign: 'center', padding: '28px 20px' }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <h1 className="display" style={{ fontSize: '1.4rem' }}>Satu Langkah Lagi!</h1>
              <p style={{ fontSize: 14 }}>
                Data Anda telah <strong>terverifikasi</strong>.<br />
                Minta petugas desa menampilkan <strong>QR aktivasi</strong>, lalu scan di bawah ini untuk membuka akun Anda.
              </p>

              {scanMsg && <p role="status" style={{ color: '#15803d', fontWeight: 700, margin: '8px 0' }}>{scanMsg}</p>}
              {scanError && <p role="alert" style={{ color: '#b42318', fontSize: 13, marginBottom: 8 }}>{scanError}</p>}

              <QrScanner
                onScan={(value) => void handleWargaScan(value)}
                label="Scan QR Aktivasi dari Petugas"
                hint="Arahkan kamera ke QR yang ditampilkan petugas desa. Token juga bisa dimasukkan manual."
              />

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
                <button type="button" className="btn btn-primary" onClick={refresh}><RefreshCw size={16} /> Muat ulang status</button>
                <button type="button" className="btn btn-ghost" onClick={signOutNow}><LogOut size={16} /> Keluar</button>
              </div>
              <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
                Butuh bantuan? Hubungi petugas desa.
              </p>
            </section>
          </div>
        </div>
      )
    }
    // Status tidak dikenal / belum aktif: jangan pernah membuka dashboard privat.
    if (vStatus !== 'verified' || !profile?.activated_at) {
      return gateShell(
        <>
          <AlertTriangle size={44} color="#b45309" />
          <h1 className="display">Status Akun Belum Dapat Dipastikan</h1>
          <p>Muat ulang status. Jika masalah berlanjut, hubungi petugas desa.</p>
        </>,
        refresh, signOutNow,
      )
    }
  }

  return (
    <div className="app-shell">
      <OfflineIndicator />
      <header className="topbar"><div className="container nav"><Link to="/warga"><Brand /></Link><nav className="citizen-nav" aria-label="Navigasi warga">{citizenNavPrimary.map(({ to, label, Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}><Icon size={15} /> {label}</NavLink>)}<div className="admin-nav-more" ref={moreRef}><button className={`admin-nav-more-btn${moreOpen ? ' active' : ''}${hasMoreActive ? ' has-active' : ''}`} onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} aria-haspopup="true" aria-label="Menu lainnya">Lainnya <ChevronDown size={14} className={`admin-nav-more-icon${moreOpen ? ' rotate' : ''}`} /></button>{moreOpen && <div className="admin-nav-dropdown" role="menu">{citizenNavMore.map(({ to, label, Icon }) => <NavLink key={to} to={to} role="menuitem" onClick={() => setMoreOpen(false)}><Icon size={15} /> {label}</NavLink>)}</div>}</div></nav><div className="nav-actions"><Link className="btn btn-ghost" to="/warga/notifikasi" aria-label="Notifikasi"><Bell size={18} /></Link><UserPill /></div></div></header>
      <main key={location.pathname} className="page-transition"><Outlet /></main>
      <footer className="role-footer"><div className="container" style={{ textAlign: 'center', padding: '20px 0 28px', fontSize: 12.5, color: 'var(--muted)' }}><span>Created by </span><a href="https://4g-sdgs-projek.my.id/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>SDGS Projek 4G</a><span> — Develop by </span><a href="https://dikaxcloud.web.id" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>Dika</a></div></footer>
      <BottomNav />
    </div>
  )
}

function LoadingScreen({ message, onRefresh }) {
  return (
    <div className="dashboard-page">
      <div className="container narrow-container">
        <section className="panel" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 40 }}>⏳</div>
          <h1 className="display" style={{ marginTop: 16, marginBottom: 8 }}>Memuat...</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{message}</p>
          <button type="button" className="btn btn-primary" onClick={onRefresh}><RefreshCw size={16} /> Muat ulang</button>
        </section>
      </div>
    </div>
  )
}

function gateShell(content, refresh, signOutNow) {
  return (
    <div className="dashboard-page">
      <div className="container narrow-container">
        <section className="panel" style={{ textAlign: 'center', padding: '36px 22px' }}>
          {content}
          <AccountControls refresh={refresh} signOutNow={signOutNow} />
          <p style={{ marginTop: 14, fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            <ScanLine size={14} /> Butuh bantuan? Hubungi petugas desa atau buka menu Bantuan Darurat dari beranda publik.
          </p>
        </section>
      </div>
    </div>
  )
}

function AccountControls({ refresh, signOutNow }) {
  return (
    <div className="gate-account-controls">
      <span className="gate-account-label">Kontrol akun</span>
      <div className="gate-account-buttons">
        <button type="button" className="btn btn-ghost" onClick={refresh}><RefreshCw size={15} /> Muat ulang status</button>
        <button type="button" className="btn btn-ghost" onClick={signOutNow}><LogOut size={15} /> Keluar</button>
      </div>
    </div>
  )
}
