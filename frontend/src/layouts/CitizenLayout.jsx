import { useCallback, useEffect, useState, useRef } from 'react'
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom'
import { Bell, LogOut, RefreshCw, ScanLine, AlertTriangle, House, HeartPulse, BookOpen, Siren, QrCode, Sparkles, Users, UserRound, ListChecks, ChevronDown } from 'lucide-react'
import { Brand } from '../components/Brand'
import { UserPill } from '../components/UserPill'
import { useAuth } from '../features/auth/AuthProvider'
import { BottomNav } from '../components/BottomNav'
import { OfflineIndicator } from '../components/OfflineIndicator'
import { QrScanner } from '../components/QrScanner'
import { getCitizenContext } from '../features/citizen/citizenService'
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
  const [ctx, setCtx] = useState(null) // null = memuat, { status, profile }
  const [tick, setTick] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
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
  const linked = Boolean(access?.citizen_id)
  const bypass = isDemoUser || !linked || !isSupabaseConfigured || location.pathname === '/warga/aktivasi'

  useEffect(() => {
    if (bypass) { setCtx({ status: 'pass' }); return }
    let active = true
    setCtx(null)
    getCitizenContext()
      .then((c) => { if (active) setCtx({ status: 'checked', profile: c.profile }) })
      .catch(() => { if (active) setCtx({ status: 'error' }) })
    return () => { active = false }
  }, [bypass, access?.citizen_id, tick, location.pathname])

  const refresh = useCallback(() => setTick((value) => value + 1), [])
  const signOutNow = async () => {
    const { signOut, signOutDemo } = await import('../features/auth/authService')
    try { if (isDemoUser) signOutDemo(); else await signOut() } finally { window.location.href = '/login' }
  }

  // Warga scans the admin's ACTIVATION QR directly inside this gate screen.
  const [scanMsg, setScanMsg] = useState('')
  const [scanError, setScanError] = useState('')
  const handleWargaScan = async (raw) => {
    setScanError(''); setScanMsg('')
    let token = String(raw || '').trim().replace(/^DSK1:/i, '')
    // QR berisi deep link — ekstrak parameternya (?t= aktivasi, ?code= hubungkan akun).
    if (/^https?:\/\//i.test(token)) {
      try {
        const url = new URL(token)
        token = url.searchParams.get('t') || url.searchParams.get('code') || ''
      } catch { /* biarkan token apa adanya */ }
    }
    if (!token) return setScanError('Token QR kosong.')
    try {
      const { activateMyAccount } = await import('../features/auth/authService')
      const res = await activateMyAccount(token)
      if (res?.status === 'activated') { setScanMsg('🎉 Akun berhasil diaktifkan! Memuat dashboard...'); refresh(); setTimeout(refresh, 1200) }
      else if (res?.status === 'already_active') { setScanMsg('Akun Anda sudah aktif.'); refresh() }
      else if (res?.status === 'expired') setScanError('Kode aktivasi kedaluwarsa. Minta petugas menampilkan QR yang baru.')
      else setScanError('QR tidak dikenali. Pastikan Anda scan QR AKTIVASI dari petugas desa.')
    } catch (err) {
      setScanError(err.message || 'Aktivasi gagal. Coba lagi.')
    }
  }

  const profile = ctx?.profile
  const vStatus = profile?.verification_status

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
    if (vStatus === 'pending') {
      return gateShell(
        <>
          <div style={{ fontSize: 44 }}>⏳</div>
          <h1 className="display">Menunggu Verifikasi Admin</h1>
          <p>Terima kasih, <strong>{profile?.full_name}</strong>! Data Anda sudah kami terima dan sedang diperiksa oleh petugas desa.<br />
          Setelah disetujui, petugas akan menunjukkan <strong>QR aktivasi</strong> — scan QR tersebut di bawah ini untuk membuka akun Anda.</p>
          {scanMsg && <p role="status" style={{ color: '#15803d', fontWeight: 700, margin: '8px 0' }}>{scanMsg}</p>}
          {scanError && <p role="alert" style={{ color: '#b42318', fontSize: 13, marginBottom: 8 }}>{scanError}</p>}
          <div style={{ marginTop: 16 }}>
            <QrScanner
              onScan={(value) => void handleWargaScan(value)}
              label="Scan QR Aktivasi dari Petugas"
              hint="Sudah diperiksa petugas dan ditunjukkan QR-nya? Langsung scan di sini — akun langsung terbuka tanpa perlu menunggu."
            />
          </div>
        </>,
        refresh, signOutNow,
      )
    }
    if (vStatus === 'rejected') {
      return gateShell(
        <>
          <div style={{ fontSize: 44 }}>❌</div>
          <h1 className="display">Pendaftaran Ditolak</h1>
          <p>{profile?.verification_note ? <>Alasan: <strong>{profile.verification_note}</strong><br /></> : null}Silakan hubungi petugas desa untuk memperbaiki data Anda.</p>
        </>,
        refresh, signOutNow,
      )
    }
    if (vStatus === 'verified' && !profile?.activated_at) {
      return (
        <div className="dashboard-page">
          <div className="container narrow-container">
            <section className="panel" style={{ textAlign: 'center', padding: '28px 20px' }}>
              <div style={{ fontSize: 40 }}>🔐</div>
              <h1 className="display" style={{ fontSize: '1.4rem' }}>Satu Langkah Lagi!</h1>
              <p style={{ fontSize: 14 }}>
                Data Anda telah <strong>terverifikasi ✅</strong>.<br />
                Petugas desa menampilkan <strong>QR AKTIVASI</strong> —<br />
                scan QR tersebut di bawah ini untuk membuka akun Anda.
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
    // If verification status is unknown or verified with activated_at, proceed to normal layout
  }

  return (
    <div className="app-shell">
      <OfflineIndicator />
      <header className="topbar"><div className="container nav"><Link to="/warga"><Brand /></Link><nav className="citizen-nav" aria-label="Navigasi warga">{citizenNavPrimary.map(({ to, label, Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}><Icon size={15} /> {label}</NavLink>)}<div className="admin-nav-more" ref={moreRef}><button className={`admin-nav-more-btn${moreOpen ? ' active' : ''}${hasMoreActive ? ' has-active' : ''}`} onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} aria-haspopup="true" aria-label="Menu lainnya">Lainnya <ChevronDown size={14} className={`admin-nav-more-icon${moreOpen ? ' rotate' : ''}`} /></button>{moreOpen && <div className="admin-nav-dropdown" role="menu">{citizenNavMore.map(({ to, label, Icon }) => <NavLink key={to} to={to} role="menuitem" onClick={() => setMoreOpen(false)}><Icon size={15} /> {label}</NavLink>)}</div>}</div></nav><div className="nav-actions"><Link className="btn btn-ghost" to="/warga/notifikasi" aria-label="Notifikasi"><Bell size={18} /></Link><UserPill /></div></div></header>
      <main><Outlet /></main>
      <footer className="role-footer"><div className="container" style={{ textAlign: 'center', padding: '20px 0 28px', fontSize: 12.5, color: 'var(--muted)' }}><span>Created by </span><a href="https://projek-sdgs.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>SDGS Projek 4G</a><span> — Develop by </span><a href="https://dikaxcloud.web.id" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>Dika</a></div></footer>
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
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
            <button type="button" className="btn btn-primary" onClick={refresh}><RefreshCw size={16} /> Muat ulang status</button>
            <button type="button" className="btn btn-ghost" onClick={signOutNow}><LogOut size={16} /> Keluar</button>
          </div>
          <p style={{ marginTop: 14, fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            <ScanLine size={14} /> Butuh bantuan? Hubungi petugas desa atau buka menu Bantuan Darurat dari beranda publik.
          </p>
        </section>
      </div>
    </div>
  )
}