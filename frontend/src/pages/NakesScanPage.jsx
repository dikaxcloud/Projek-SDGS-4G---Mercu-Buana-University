import { useState } from 'react'
import { ArrowLeft, AlertTriangle, ScanLine, CheckCircle2, UserCheck, ClipboardPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { resolveCitizenQr } from '../features/staff/staffService'
import { QrScanner } from '../components/QrScanner'

export function NakesScanPage() {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const resolve = async (raw) => {
    setError(''); setResult(null)
    const token = String(raw || '').trim().replace(/^DSK1:/i, '')
    if (!token) return setError('Token QR kosong.')
    try {
      const res = await resolveCitizenQr(token)
      if (!res?.found) return setError('QR warga tidak valid atau sudah tidak aktif.')
      if (res.citizen?.verification_status !== 'verified') return setError('Warga pada QR ini belum terverifikasi.')
      setResult(res.citizen)
    } catch (err) {
      setError(err.message || 'QR gagal diproses.')
    }
  }

  return (
    <div className="staff-page">
      <div className="container narrow-container">
        <Link className="back-link" to="/nakes"><ArrowLeft size={15} /> Kembali</Link>
        <div className="form-heading">
          <div className="icon-tile"><ScanLine size={21} /></div>
          <div>
            <div className="eyebrow">Portal nakes</div>
            <h1 className="display">Scan QR Warga</h1>
          </div>
        </div>
        <p className="page-intro">Arahkan kamera ke QR Kesehatan warga. Petugas login wajib — data hanya tampil sesuai izin.</p>

        {error && <div className="staff-alert" role="alert"><AlertTriangle size={17} /> {error}</div>}

        {!result && (
          <section className="staff-panel scan-panel">
            <QrScanner onScan={(value) => void resolve(value)} hint="QR warga berisi token aman tanpa data pribadi." />
          </section>
        )}

        {result && (
          <section className="staff-panel result-panel">
            <div className="staff-panel-head">
              <div>
                <h2>Warga ditemukan <CheckCircle2 size={20} color="#15803d" /></h2>
                <p>Data minimum untuk pemeriksaan.</p>
              </div>
            </div>
            <div className="citizen-hero scan-result">
              <div className="avatar large">{result.full_name.slice(0, 1)}</div>
              <div>
                <strong>{result.full_name}</strong>
                <p>{result.rt_code} · {result.household_number} · NIK ****{result.nik_last4}</p>
                <p><span className="badge">Golongan darah: {result.blood_type || '—'}</span> <span className="badge"><UserCheck size={14} /> Terverifikasi</span></p>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setResult(null)}>Scan lain</button>
              <Link to={`/nakes/pemeriksaan/baru?citizen=${result.citizen_id}`} className="btn btn-primary"><ClipboardPlus size={17} /> Catat Pemeriksaan</Link>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}