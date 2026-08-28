import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getPublicLandingData } from '../features/health/healthService'

export function HealthTeamPage() {
  const [workers, setWorkers] = useState([])

  useEffect(() => {
    const load = () => getPublicLandingData().then((data) => setWorkers(data?.workers ?? [])).catch(() => setWorkers([]))
    void load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [])

  return <main className="dashboard-page"><div className="container narrow-container">
    <Link className="back-link" to="/"><ArrowLeft size={15} /> Beranda</Link>
    <div className="form-heading"><div className="icon-tile">+</div><div><div className="eyebrow">Tim kesehatan desa</div><h1 className="display">Tenaga kesehatan</h1></div></div>
    <p className="page-intro">Petugas aktif yang siap membantu warga desa.</p>
    {workers.length === 0 ? <p className="muted-text">Belum ada tenaga kesehatan aktif.</p> : <div className="team-grid">{workers.map((worker) => <div className="team-card" key={worker.name}><div className="avatar">{(worker.name || '?').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div><div><h3>{worker.name}</h3><p>{worker.role} · {worker.specialty}</p><span className="online" style={{ color: worker.is_online ? '#15803d' : 'var(--muted)' }}>{worker.is_online ? 'Sedang online' : 'Tidak sedang online'}</span></div></div>)}</div>}
  </div></main>
}
