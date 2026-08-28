import { ArrowLeft, Construction } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

export function PlaceholderPage() {
  const { pathname } = useLocation()
  const title = pathname.includes('nakes') ? 'Portal Nakes' : pathname.includes('admin') ? 'Portal Admin Desa' : 'Halaman ini sedang disiapkan'
  return <main className="auth-page"><div className="auth-card" style={{ textAlign: 'center' }}><div className="icon-tile" style={{ margin: '0 auto', width: 58, height: 58 }}><Construction size={26} /></div><h1 className="display">{title}</h1><p>Struktur halaman sudah disiapkan. Fitur data dan izin akan dibangun pada tahap berikutnya.</p><Link className="btn btn-primary btn-wide" to={pathname.startsWith('/admin') || pathname.startsWith('/nakes') ? '/' : '/warga'}><ArrowLeft size={16} /> Kembali</Link></div></main>
}
