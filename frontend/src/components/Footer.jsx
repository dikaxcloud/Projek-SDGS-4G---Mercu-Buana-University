import { HeartPulse } from 'lucide-react'
import { Brand } from './Brand'

export function Footer() {
  return <footer className="footer"><div className="container footer-inner"><Brand /><span>© 2026 Desa Sehat Kenanga</span><span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}><span>Created by </span><a href="https://projek-sdgs.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>SDGS Projek 4G</a><span> — Develop by </span><a href="https://dikaxcloud.web.id" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>Dika</a></span></div></footer>
}
