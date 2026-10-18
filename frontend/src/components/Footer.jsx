import { HeartPulse } from 'lucide-react'
import { Brand } from './Brand'

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand"><a href="https://desaku-sehat.my.id/" aria-label="Desa Sehat — beranda"><Brand /></a></div>
        <p className="footer-copy">© 2026 Desa Sehat</p>
        <p className="footer-credits">
          <span>Created by</span>
          <a href="https://4g-sdgs-projek.my.id/" target="_blank" rel="noopener noreferrer">SDGS Projek 4G</a>
          <span className="footer-sep">—</span>
          <span>Develop by</span>
          <a href="https://dikaxcloud.web.id" target="_blank" rel="noopener noreferrer">Dika</a>
        </p>
      </div>
    </footer>
  )
}
