import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Menu, X } from 'lucide-react'
import { Brand } from './Brand'
import { useState, useEffect } from 'react'

function scrollToHash(hash) {
  if (!hash) return
  const id = hash.replace('#', '')
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

function NavAnchor({ hash, children, onClick }) {
  const location = useLocation()
  const navigate = useNavigate()
  const handleClick = (e) => {
    e.preventDefault()
    onClick?.()
    if (location.pathname === '/') {
      scrollToHash(hash)
    } else {
      navigate('/' + hash)
      // scroll after navigation completes
      setTimeout(() => scrollToHash(hash), 100)
    }
  }
  return <a href={'/' + hash} onClick={handleClick}>{children}</a>
}

export function Topbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // close menu on route change
  useEffect(() => { setOpen(false) }, [location.pathname])

  // scroll to hash on landing page load (from /#tentang etc)
  useEffect(() => {
    if (location.pathname === '/' && location.hash) {
      setTimeout(() => scrollToHash(location.hash), 150)
    }
  }, [location])

  return <header className="topbar"><div className="container nav">
    <Link to="/"><Brand /></Link>
    <nav id="main-nav" className={`nav-links${open ? ' nav-open' : ''}`} aria-label="Navigasi utama">
      <Link to="/" onClick={() => { setOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Beranda</Link>
      <NavAnchor hash="#tentang" onClick={() => setOpen(false)}>Tentang</NavAnchor>
      <NavAnchor hash="#layanan" onClick={() => setOpen(false)}>Layanan</NavAnchor>
      <NavAnchor hash="#nakes" onClick={() => setOpen(false)}>Tim kesehatan</NavAnchor>
      <NavAnchor hash="#informasi" onClick={() => setOpen(false)}>Informasi</NavAnchor>
      <div className="nav-auth">
        <Link className="btn btn-ghost" to="/login">Masuk</Link>
        <Link className="btn btn-primary" to="/login">Mulai sekarang <ArrowRight size={16} /></Link>
      </div>
    </nav>
    <div className="nav-actions">
      <Link className="btn btn-ghost" to="/login">Masuk</Link>
      <Link className="btn btn-primary" to="/login">Mulai sekarang <ArrowRight size={16} /></Link>
      <button className="nav-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Tutup menu' : 'Buka menu'} aria-expanded={open} aria-controls="main-nav">
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
    </div>
  </div></header>
}
