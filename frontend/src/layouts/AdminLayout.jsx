import { useRef, useState, useEffect, useCallback } from 'react'
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom'
import { BookOpen, FileClock, Home, LayoutDashboard, LogOut, Map, Phone, QrCode, ShieldCheck, Shield, Stethoscope, Users, UserRoundCog, UserPlus, Menu, X, ChevronDown } from 'lucide-react'
import { Brand } from '../components/Brand'
import { useAuth } from '../features/auth/AuthProvider'
import { MobileMoreSheet } from '../components/MobileMoreSheet'
import { UserPill } from '../components/UserPill'

const allLinks = [
  ['/admin', LayoutDashboard, 'Ringkasan'],
  ['/admin/warga', Users, 'Warga'],
  ['/admin/verifikasi', ShieldCheck, 'Verifikasi'],
  ['/admin/kk', Home, 'KK'],
  ['/admin/rt', Map, 'RT'],
  ['/admin/nakes', UserRoundCog, 'Nakes'],
  ['/admin/admins', Shield, 'Akun'],
  ['/admin/informasi', BookOpen, 'Informasi'],
  ['/admin/kontak', Phone, 'Kontak'],
  ['/admin/qr', QrCode, 'QR'],
  ['/admin/audit-log', FileClock, 'Audit log'],
]

const desktopLinks = allLinks.slice(0, 7)
const desktopMoreLinks = allLinks.slice(7)

const mobilePrimary = [
  { to: '/admin', label: 'Ringkasan', Icon: LayoutDashboard },
  { to: '/admin/warga', label: 'Warga', Icon: Users },
  { to: '/admin/verifikasi', label: 'Verifikasi', Icon: ShieldCheck },
]

const moreItems = [
  { to: '/admin/warga/baru', label: 'Tambah Warga', Icon: UserPlus },
  { to: '/admin/kk', label: 'Kartu Keluarga (KK)', Icon: Home },
  { to: '/admin/rt', label: 'RT', Icon: Map },
  { to: '/admin/nakes', label: 'Nakes', Icon: UserRoundCog },
  { to: '/admin/admins', label: 'Akun', Icon: Shield },
  { to: '/admin/informasi', label: 'Artikel Kesehatan', Icon: BookOpen },
  { to: '/admin/kontak', label: 'Kontak Darurat', Icon: Phone },
  { to: '/admin/qr', label: 'QR Akses Website', Icon: QrCode },
  { to: '/admin/audit-log', label: 'Audit Log', Icon: FileClock },
]

export function AdminLayout() {
  const { access, isDemo, signOut, signOutDemo } = useAuth()
  const logout = async () => { if (isDemo) signOutDemo(); else await signOut() }
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false)
  const moreDropdownRef = useRef(null)
  const location = useLocation()

  const sheetItems = [
    ...moreItems,
    { label: 'Keluar Akun', Icon: LogOut, danger: true, onClick: logout },
  ]

  // Close menus on route change
  useEffect(() => { setMenuOpen(false); setMoreDropdownOpen(false) }, [location.pathname])

  // Close more dropdown on outside click
  useEffect(() => {
    if (!moreDropdownOpen) return
    const handler = (e) => {
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(e.target)) {
        setMoreDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [moreDropdownOpen])

  // Escape to close more dropdown
  useEffect(() => {
    if (!moreDropdownOpen) return
    const handler = (e) => { if (e.key === 'Escape') setMoreDropdownOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [moreDropdownOpen])

  // Mobile menu body scroll lock + escape
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event) => { if (event.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [menuOpen])

  const hasActiveHidden = desktopMoreLinks.some(([to]) => location.pathname.startsWith(to))

  const handleMoreDropdownKey = useCallback((e) => {
    if (e.key === 'Escape') setMoreDropdownOpen(false)
    if (e.key === 'ArrowDown') { e.preventDefault(); const first = moreDropdownRef.current?.querySelector('[role="menuitem"]'); first?.focus() }
  }, [])

  const handleDropdownKey = useCallback((e) => {
    if (e.key === 'Escape') { setMoreDropdownOpen(false); return }
    const items = Array.from(moreDropdownRef.current?.querySelectorAll('[role="menuitem"]') || [])
    const idx = items.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus() }
  }, [])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container nav">
          <Link to="/admin"><Brand /></Link>

          <nav className="admin-nav" aria-label="Navigasi admin">
            {desktopLinks.map(([to, Icon, label]) => (
              <NavLink end={to === '/admin'} to={to} key={to}>
                <Icon size={15} /> {label}
              </NavLink>
            ))}
            <div className="admin-nav-more" ref={moreDropdownRef}>
              <button
                className={`admin-nav-more-btn${moreDropdownOpen ? ' active' : ''}${hasActiveHidden ? ' has-active' : ''}`}
                onClick={() => setMoreDropdownOpen(!moreDropdownOpen)}
                onKeyDown={handleMoreDropdownKey}
                aria-expanded={moreDropdownOpen}
                aria-haspopup="true"
                aria-label="Menu lainnya"
              >
                Lainnya <ChevronDown size={14} className={`admin-nav-more-icon${moreDropdownOpen ? ' rotate' : ''}`} />
              </button>
              {moreDropdownOpen && (
                <div className="admin-nav-dropdown" role="menu" onKeyDown={handleDropdownKey}>
                  {desktopMoreLinks.map(([to, Icon, label]) => (
                    <NavLink end={to === '/admin'} to={to} key={to} role="menuitem" onClick={() => setMoreDropdownOpen(false)}>
                      <Icon size={15} /> {label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="nav-actions">
            <UserPill />
            <button className="btn btn-ghost nav-toggle-admin" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'} aria-expanded={menuOpen} aria-controls="admin-navigation-drawer">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile / tablet drawer */}
      {menuOpen && (
        <>
          <div className="admin-menu-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <nav id="admin-navigation-drawer" className="admin-mobile-menu" aria-label="Navigasi admin">
            <div className="admin-mobile-menu-head">
              <Brand />
              <button className="admin-mobile-menu-close" onClick={() => setMenuOpen(false)} aria-label="Tutup menu navigasi">
                <X size={20} />
              </button>
            </div>
            <div className="admin-mobile-menu-links">
              {allLinks.map(([to, Icon, label]) => (
                <NavLink end={to === '/admin'} to={to} key={to}>
                  <Icon size={16} /> {label}
                </NavLink>
              ))}
            </div>
            <div className="admin-mobile-menu-footer">
              <div className="admin-drawer-user">
                <strong>{access?.display_name}</strong>
                <span>{access?.role === 'admin' ? 'Admin' : 'Nakes'}</span>
              </div>
              <button onClick={logout} className="admin-mobile-logout">
                <LogOut size={16} /> Keluar
              </button>
            </div>
          </nav>
        </>
      )}

      <main><Outlet /></main>
      <footer className="role-footer"><div className="container" style={{ textAlign: 'center', padding: '20px 0 28px', fontSize: 12.5, color: 'var(--muted)' }}><span>Created by </span><a href="https://projek-sdgs.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>SDGS Projek 4G</a><span> — Develop by </span><a href="https://dikaxcloud.web.id" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>Dika</a></div></footer>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav bottom-nav-admin" aria-label="Navigasi admin mobile">
        {mobilePrimary.map(({ to, label, Icon }) => (
          <NavLink end={to === '/admin'} to={to} key={to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon size={19} /><span>{label}</span>
          </NavLink>
        ))}
        <button type="button" className={moreOpen ? 'active' : ''} onClick={() => setMoreOpen(true)} aria-label="Buka menu lainnya" aria-expanded={moreOpen}>
          <Menu size={19} /><span>Lainnya</span>
        </button>
      </nav>

      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu Admin" items={sheetItems} />
    </div>
  )
}
