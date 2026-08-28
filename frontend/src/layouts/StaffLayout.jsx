import { useEffect, useState } from 'react'
import { Outlet, Link, NavLink } from 'react-router-dom'
import { BookOpen, ClipboardPlus, History, LayoutDashboard, LogOut, ScanLine, Search, ShieldCheck, UserPlus, Menu } from 'lucide-react'
import { Brand } from '../components/Brand'
import { useAuth } from '../features/auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { MobileMoreSheet } from '../components/MobileMoreSheet'
import { UserPill } from '../components/UserPill'
// Desktop navbar (≥801px) — tidak berubah
const navLinks = [
  { to: '/nakes', Icon: LayoutDashboard, label: 'Ringkasan' },
  { to: '/nakes/warga', Icon: Search, label: 'Warga' },
  { to: '/nakes/pemeriksaan/baru', Icon: ClipboardPlus, label: 'Periksa' },
  { to: '/nakes/scan', Icon: ScanLine, label: 'Scan QR' },
  { to: '/nakes/riwayat-saya', Icon: History, label: 'Riwayat' },
  { to: '/admin', Icon: ShieldCheck, label: 'Mode Admin' },
]

// Mobile: 4 primary + Lainnya
const mobilePrimary = [
  { to: '/nakes', label: 'Beranda', Icon: LayoutDashboard },
  { to: '/nakes/warga', label: 'Warga', Icon: Search },
  { to: '/nakes/scan', label: 'Scan QR', Icon: ScanLine },
]
const moreItems = [
  { to: '/nakes/pemeriksaan/baru', label: 'Catat Pemeriksaan', Icon: ClipboardPlus },
  { to: '/nakes/riwayat-saya', label: 'Riwayat Pemeriksaan', Icon: History },
  { to: '/nakes/warga/baru', label: 'Tambah Warga', Icon: UserPlus },
  { to: '/informasi-kesehatan', label: 'Informasi Kesehatan', Icon: BookOpen },
  { to: '/admin', label: 'Mode Admin (Kelola Data)', Icon: ShieldCheck },
]

export function StaffLayout() {
  const { access, isDemo, signOut, signOutDemo } = useAuth()
  const logout = async () => { if (isDemo) signOutDemo(); else await signOut() }
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if (!supabase || access?.role !== 'nakes') return undefined
    const heartbeat = () => { void supabase.rpc('touch_my_nakes_presence') }
    heartbeat()
    const timer = window.setInterval(heartbeat, 60000)
    return () => window.clearInterval(timer)
  }, [access?.role])

  const staffNavLinks = access?.role === 'admin' ? navLinks : navLinks.filter((item) => item.to !== '/admin')
  const sheetItems = [
    ...(access?.role === 'admin' ? moreItems : moreItems.filter((item) => item.to !== '/admin')),
    { label: 'Keluar Akun', Icon: LogOut, danger: true, onClick: logout },
  ]

  return (
    <div className="app-shell">
      <header className="topbar"><div className="container nav"><Link to="/nakes"><Brand /></Link><nav className="staff-nav" aria-label="Navigasi nakes">{staffNavLinks.map(({ to, Icon, label }) => <NavLink end={to === '/nakes'} to={to} key={to}><Icon size={16} /> {label}</NavLink>)}</nav><div className="nav-actions"><UserPill /></div></div></header>
      <main><Outlet /></main>
      <footer className="role-footer"><div className="container" style={{ textAlign: 'center', padding: '20px 0 28px', fontSize: 12.5, color: 'var(--muted)' }}><span>Created by </span><a href="https://projek-sdgs.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>SDGS Projek 4G</a><span> — Develop by </span><a href="https://dikaxcloud.web.id" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>Dika</a></div></footer>

      {/* Mobile bottom nav: 4 primary + Lainnya */}
      <nav className="bottom-nav bottom-nav-staff" aria-label="Navigasi nakes mobile">
        {mobilePrimary.map(({ to, label, Icon }) => (
          <NavLink end={to === '/nakes'} to={to} key={to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon size={19} /><span>{label}</span>
          </NavLink>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} aria-label="Buka menu lainnya" aria-expanded={moreOpen}>
          <Menu size={19} /><span>Lainnya</span>
        </button>
      </nav>

      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu Nakes" items={sheetItems} />
    </div>
  )
}
