import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Topbar } from '../components/Topbar'
import { Footer } from '../components/Footer'
import { House, Info, HeartPulse, Users, Menu, LogIn, ArrowRight } from 'lucide-react'
import { MobileMoreSheet } from '../components/MobileMoreSheet'

function scrollToHash(hash) {
  if (!hash) return
  const id = hash.replace('#', '')
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

export function PublicLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
    window.scrollTo(0, 0)
  }, [location.pathname])

  const goHash = (hash) => {
    if (location.pathname === '/') scrollToHash(hash)
    else { navigate('/' + hash); setTimeout(() => scrollToHash(hash), 100) }
  }

  const sheetItems = [
    { label: 'Tim Kesehatan', Icon: Users, onClick: () => goHash('#nakes') },
    { label: 'Informasi', Icon: Info, onClick: () => goHash('#informasi') },
    { label: 'Masuk', Icon: LogIn, onClick: () => navigate('/login') },
    { label: 'Mulai Sekarang', Icon: ArrowRight, onClick: () => navigate('/login') },
  ]

  return <div className="app-shell public-layout"><Topbar hideHamburgerOnMobile /><Outlet /><Footer />
    <nav className="bottom-nav public-bottom-nav" aria-label="Navigasi utama mobile">
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><House size={19} /><span>Beranda</span></button>
      <button type="button" onClick={() => goHash('#tentang')}><Info size={19} /><span>Tentang</span></button>
      <button type="button" onClick={() => goHash('#layanan')}><HeartPulse size={19} /><span>Layanan</span></button>
      <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} aria-label="Lainnya"><Menu size={19} /><span>Lainnya</span></button>
    </nav>
    <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu" items={sheetItems} />
  </div>
}
