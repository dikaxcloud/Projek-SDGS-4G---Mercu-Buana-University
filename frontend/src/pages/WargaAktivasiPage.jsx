import { useSearchParams, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { QrAccessExperience } from '../components/QrAccessExperience'
import { XCircle, RefreshCw } from 'lucide-react'

/** Warga scans admin's activation QR -> lands here with ?t=<token> -> account unlocked. */
export function WargaAktivasiPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''

  if (!token) {
    return (
      <main className="auth-page"><div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><Brand /></div>
        <XCircle size={52} color="#b42318" style={{ margin: '10px auto' }} />
        <h1 className="display">QR Tidak Valid</h1>
        <p>Token tidak dikenali. Minta petugas desa menampilkan QR aktivasi yang baru, lalu scan ulang.</p>
        <button className="btn btn-ghost btn-wide" style={{ marginTop: 16 }} onClick={() => navigate(0)}><RefreshCw size={16} /> Coba periksa ulang</button>
      </div></main>
    )
  }

  return (
    <QrAccessExperience
      token={token}
      onSuccess={() => navigate('/warga', { replace: true })}
      onRetry={() => navigate(0)}
    />
  )
}
