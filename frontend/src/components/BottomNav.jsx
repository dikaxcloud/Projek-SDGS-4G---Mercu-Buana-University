import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { BookOpen, Globe, HeartPulse, House, LogOut, Menu, QrCode, Sparkles, ListChecks, Bell, Siren, UserRound } from 'lucide-react'
import { MobileMoreSheet } from './MobileMoreSheet'
import { useAuth } from '../features/auth/AuthProvider'

const primary = [
  { to: '/warga', label: 'Beranda', Icon: House },
  { to: '/warga/kesehatan', label: 'Kesehatan', Icon: HeartPulse },
  { to: '/informasi-kesehatan', label: 'Info', Icon: BookOpen },
]

const moreItems = [
  { to: '/warga/qr-kesehatan', label: 'QR Kesehatan Saya', Icon: QrCode },
  { to: '/warga/ai-kesehatan', label: 'AI Kesehatan', Icon: Sparkles },
  { to: '/warga/riwayat', label: 'Riwayat Pemeriksaan', Icon: ListChecks },
  { to: '/warga/notifikasi', label: 'Notifikasi', Icon: Bell },
  { to: '/warga/profil', label: 'Profil Saya', Icon: UserRound },
  { to: '/warga/bantuan', label: 'Kontak Nakes & Darurat', Icon: Siren },
]

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const navigate = useNavigate()
  const { isDemo, signOut, signOutDemo } = useAuth()
  const moreActive = moreItems.some(({ to }) => window.location.pathname.startsWith(to))

  const logout = async () => {
    try { if (isDemo) signOutDemo(); else await signOut() } finally { window.location.href = '/login' }
  }

  const sheetItems = [
    ...moreItems,
    { to: '/', label: 'Buka Web Utama', Icon: Globe },
    { label: 'Keluar dari Akun', Icon: LogOut, danger: true, onClick: () => void logout() },
  ]

  return (
    <>
      <nav className="bottom-nav" aria-label="Navigasi warga">
        {primary.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/warga'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon size={19} /><span>{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={moreActive ? 'active' : ''}
          onClick={() => setMoreOpen(true)}
          aria-label="Buka menu lainnya"
          aria-expanded={moreOpen}
        >
          <Menu size={19} /><span>Lainnya</span>
        </button>
      </nav>

      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Lainnya" items={sheetItems} />
    </>
  )
}
